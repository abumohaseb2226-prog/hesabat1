'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { postSalesOrderToLedger } from '@/lib/accounting-engine'

interface BazaarOrderItem {
  productId: string
  quantity: number // يمكن أن تكون سالبة (مرتجع/استبدال) أو موجبة (بيع)
  price: number
  discountPercent?: number
}

interface PaymentSplit {
  safeId: string
  safeName?: string
  amount: number
}

interface PendingBazaarOrder {
  id: string
  items: BazaarOrderItem[]
  totalAmount: number
  paymentSplits: PaymentSplit[]
  notes?: string
  createdAt?: string
}

async function checkAuthorizedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('غير مصرح لك، يرجى تسجيل الدخول')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('ليست لديك صلاحية للقيام بهذه العملية')
  }

  return user
}

// جلب كتالوج كل الأصناف النشطة لتخزينها محلياً والعمل بها أوفلاين
export async function getBazaarProductsCatalog() {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        modelNo: true,
        color: true,
        price: true,
        cost: true,
        currentStock: true,
        description: true,
        status: true
      },
      orderBy: { modelNo: 'asc' }
    })

    return {
      success: true,
      products: JSON.parse(JSON.stringify(products))
    }
  } catch (error: any) {
    console.error('Error fetching bazaar products catalog:', error)
    return { success: false, error: error.message || 'فشل جلب كتالوج الأصناف' }
  }
}

// تهيئة عميل وخزنة البازار الافتراضية مع جلب كل الخزن المتاحة
export async function getOrCreateBazaarDefaults() {
  try {
    let customer = await prisma.customer.findFirst({
      where: { name: 'البازار' }
    })

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: 'البازار',
          code: 'BAZAAR-001',
          source: 'BAZAAR',
          address: 'مبيعات البازار المباشرة'
        }
      })
    }

    let defaultSafe = await prisma.safe.findFirst({
      where: { name: 'خزنة البازار' }
    })

    if (!defaultSafe) {
      defaultSafe = await prisma.safe.create({
        data: {
          name: 'خزنة البازار'
        }
      })
    }

    const allSafes = await prisma.safe.findMany({
      orderBy: { name: 'asc' }
    })

    return {
      success: true,
      customerId: customer.id,
      customerName: customer.name,
      defaultSafeId: defaultSafe.id,
      defaultSafeName: defaultSafe.name,
      allSafes: JSON.parse(JSON.stringify(allSafes))
    }
  } catch (error: any) {
    console.error('Error getting bazaar defaults:', error)
    return { success: false, error: error.message || 'فشل تهيئة إعدادات البازار' }
  }
}

// حفظ مجموعة الأوردرات دفعة واحدة مع دعم التوزيع على الخزن والكميات السالبة والترحيل المحاسبي
export async function saveBulkBazaarOrders(payload: {
  orders: PendingBazaarOrder[]
  userId: string
  customerId: string
  defaultSafeId: string
}) {
  try {
    const { orders, userId, customerId, defaultSafeId } = payload

    if (!orders || orders.length === 0) {
      return { success: false, error: 'لا توجد أوردرات معلقة للحفظ' }
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true }
    })

    const allSafesList = await prisma.safe.findMany({
      select: { id: true, name: true }
    })
    const safeNameMap = new Map<string, string>()
    allSafesList.forEach(s => safeNameMap.set(s.id, s.name))

    // تجهيز أسعار التكلفة لحساب تكلفة البضاعة المباعة بدقة
    const allProductIds = Array.from(new Set(orders.flatMap(o => o.items.map(it => it.productId))))
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, cost: true }
    })
    const costMap = new Map<string, number>()
    dbProducts.forEach(p => costMap.set(p.id, p.cost || 0))

    const createdOrderNumbers: number[] = []

    await prisma.$transaction(async (tx) => {
      for (const ord of orders) {
        if (!ord.items || ord.items.length === 0) continue

        const primarySafeId = ord.paymentSplits?.[0]?.safeId || defaultSafeId

        // 1. إنشاء الأوردر
        const newOrder = await tx.order.create({
          data: {
            userId,
            customerId,
            safeId: primarySafeId,
            totalAmount: ord.totalAmount,
            deposit: ord.totalAmount, // خالص الحساب كاشير
            currency: 'EGP',
            notes: ord.notes || 'فاتورة مبيعات سريعة - نمط البازار',
            items: {
              create: ord.items.map(it => ({
                productId: it.productId,
                quantity: it.quantity,
                price: it.price,
                discountPercent: it.discountPercent || 0
              }))
            }
          }
        })

        createdOrderNumbers.push(newOrder.orderNo)

        // 2. تحديث المخزون وحساب إجمالي التكلفة
        let totalCogs = 0
        for (const it of ord.items) {
          await tx.product.update({
            where: { id: it.productId },
            data: {
              currentStock: { decrement: it.quantity }
            }
          })
          const unitCost = costMap.get(it.productId) || 0
          if (it.quantity > 0) {
            totalCogs += (unitCost * it.quantity)
          }
        }

        // 3. إنشاء حركات الخزنة حسب التوزيع
        const splits = (ord.paymentSplits && ord.paymentSplits.length > 0)
          ? ord.paymentSplits.filter(s => s.amount !== 0)
          : [{ safeId: defaultSafeId, amount: ord.totalAmount }]

        for (const split of splits) {
          if (split.amount > 0) {
            await tx.payment.create({
              data: {
                type: 'IN',
                amount: split.amount,
                currency: 'EGP',
                safeId: split.safeId,
                customerId: customerId,
                userId: userId,
                description: `تحصيل نقدي لأوردر بازار #${newOrder.orderNo}`
              }
            })
          } else if (split.amount < 0) {
            await tx.payment.create({
              data: {
                type: 'OUT',
                amount: Math.abs(split.amount),
                currency: 'EGP',
                safeId: split.safeId,
                customerId: customerId,
                userId: userId,
                description: `استرداد نقدي لمرتجع بازار #${newOrder.orderNo}`
              }
            })
          }
        }

        // 4. الترحيل الآلي المحاسبي إلى دفتر الأستاذ العام
        await postSalesOrderToLedger(tx, {
          orderId: newOrder.id,
          orderNo: newOrder.orderNo,
          customerId,
          customerName: customer?.name || 'البازار',
          totalAmount: ord.totalAmount,
          depositPaid: ord.totalAmount,
          safeId: primarySafeId,
          safeName: safeNameMap.get(primarySafeId) || 'خزنة البازار',
          cogsAmount: Math.max(0, totalCogs),
          date: new Date(),
          userId
        })
      }
    }, {
      maxWait: 30000,
      timeout: 90000
    })

    revalidatePath('/')
    revalidatePath('/orders/list')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/reports/bazaar')
    revalidatePath('/admin/reports/financial')
    revalidatePath('/admin/journal-entries')
    revalidatePath('/today-summary')

    return {
      success: true,
      count: createdOrderNumbers.length,
      orderNumbers: createdOrderNumbers,
      message: `تم بنجاح حفظ ${createdOrderNumbers.length} أوردر وتوزيع النقدية وتحديث المخزون ودفتر الأستاذ بدقة.`
    }
  } catch (error: any) {
    console.error('Error saving bulk bazaar orders:', error)
    return { success: false, error: error.message || 'حدث خطأ أثناء حفظ الأوردرات' }
  }
}

// =========================================================================
// تقرير البازار الشامل (مطابق 100% مع دفتر أستاذ الخزينة والمصروفات)
// =========================================================================
export async function getBazaarReport(startDateStr?: string, endDateStr?: string) {
  try {
    await checkAuthorizedUser()

    const today = new Date().toISOString().split('T')[0]
    const startStr = startDateStr || today
    const endStr = endDateStr || today

    const startDate = new Date(startStr)
    startDate.setHours(0, 0, 0, 0)

    const endDate = new Date(endStr)
    endDate.setHours(23, 59, 59, 999)

    // جلب معرف "خزنة البازار"
    const bazaarSafe = await prisma.safe.findFirst({
      where: { name: 'خزنة البازار' }
    })

    // 1. جلب فواتير البازار في الفترة المحددة
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        OR: [
          { customer: { name: 'البازار' } },
          { customer: { source: 'BAZAAR' } },
          { notes: { contains: 'بازار' } }
        ]
      },
      include: {
        user: { select: { id: true, name: true, code: true } },
        safe: true,
        items: {
          include: {
            product: { select: { modelNo: true, color: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // 2. جلب جميع أرقام أوردرات البازار الموجودة فعلياً في النظام
    const allExistingBazaarOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer: { name: 'البازار' } },
          { customer: { source: 'BAZAAR' } },
          { notes: { contains: 'بازار' } }
        ]
      },
      select: { orderNo: true }
    })
    const existingOrderNos = new Set(allExistingBazaarOrders.map(o => o.orderNo))

    // 3. جلب جميع الحركات النقدية
    const paymentsOrConditions: any[] = [
      { customer: { name: 'البازار' } },
      { customer: { source: 'BAZAAR' } },
      { description: { contains: 'بازار' } }
    ]

    if (bazaarSafe) {
      paymentsOrConditions.push({ safeId: bazaarSafe.id })
      paymentsOrConditions.push({ targetSafeId: bazaarSafe.id })
    }

    const payments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        OR: paymentsOrConditions
      },
      include: {
        user: { select: { id: true, name: true, code: true } },
        safe: true,
        targetSafe: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // 4. تصفية الحركات النقدية المعلقة لأوردرات محذوفة
    const orphanedPaymentIds: string[] = []
    const validPayments = payments.filter(pay => {
      const match = pay.description?.match(/#(\d+)/)
      if (match && (pay.description?.includes('أوردر') || pay.description?.includes('فاتورة'))) {
        const orderNo = parseInt(match[1], 10)
        const orderExists = existingOrderNos.has(orderNo)
        if (!orderExists) {
          orphanedPaymentIds.push(pay.id)
          return false
        }
      }
      return true
    })

    if (orphanedPaymentIds.length > 0) {
      await prisma.payment.deleteMany({
        where: { id: { in: orphanedPaymentIds } }
      }).catch(err => console.error('Error cleaning up orphaned payments:', err))
    }

    // 5. الإجماليات العامة وتفصيل الخزن
    const totalOrdersCount = orders.length
    const totalSalesAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const totalPiecesCount = orders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0)

    const safesMap: { [safeName: string]: any } = {}

    let totalCashIn = 0
    let totalCashOut = 0

    validPayments.forEach(pay => {
      let inAmt = 0
      let outAmt = 0
      let activeSafeName = pay.safe?.name || 'غير محددة'

      if (pay.type === 'IN' || pay.type === 'PAYMENT_COLLECTION') {
        inAmt = pay.amount
      } else if (pay.type === 'OUT') {
        outAmt = pay.amount
      } else if (pay.type === 'TRANSFER') {
        if (bazaarSafe && pay.safeId === bazaarSafe.id) {
          outAmt = pay.amount
          activeSafeName = pay.safe?.name || 'خزنة البازار'
        } else if (bazaarSafe && pay.targetSafeId === bazaarSafe.id) {
          inAmt = pay.amount
          activeSafeName = pay.targetSafe?.name || 'خزنة البازار'
        }
      }

      totalCashIn += inAmt
      totalCashOut += outAmt

      if (!safesMap[activeSafeName]) {
        safesMap[activeSafeName] = {
          safeName: activeSafeName,
          safeId: pay.safeId,
          totalIn: 0,
          totalOut: 0,
          net: 0,
          byEmployee: {}
        }
      }

      safesMap[activeSafeName].totalIn += inAmt
      safesMap[activeSafeName].totalOut += outAmt
      safesMap[activeSafeName].net += (inAmt - outAmt)

      const uName = pay.user?.name || 'النظام'
      if (!safesMap[activeSafeName].byEmployee[uName]) {
        safesMap[activeSafeName].byEmployee[uName] = 0
      }
      safesMap[activeSafeName].byEmployee[uName] += (inAmt - outAmt)
    })

    const netCash = totalCashIn - totalCashOut
    const safesSummary = Object.values(safesMap).sort((a: any, b: any) => b.net - a.net)

    // 6. تقرير الموظفين
    const employeesMap: { [userId: string]: any } = {}

    orders.forEach(ord => {
      const uId = ord.user.id
      if (!employeesMap[uId]) {
        employeesMap[uId] = {
          userId: uId,
          name: ord.user.name,
          code: ord.user.code,
          ordersCount: 0,
          totalSales: 0,
          piecesCount: 0,
          safesCollected: {}
        }
      }

      employeesMap[uId].ordersCount += 1
      employeesMap[uId].totalSales += ord.totalAmount
      employeesMap[uId].piecesCount += ord.items.reduce((s, it) => s + it.quantity, 0)
    })

    validPayments.forEach(pay => {
      const uId = pay.user?.id
      if (!uId) return

      const safeName = pay.safe?.name || 'غير محددة'
      const netAmount = (pay.type === 'IN' || pay.type === 'PAYMENT_COLLECTION') ? pay.amount : -pay.amount

      if (!employeesMap[uId]) {
        employeesMap[uId] = {
          userId: uId,
          name: pay.user.name,
          code: pay.user.code,
          ordersCount: 0,
          totalSales: 0,
          piecesCount: 0,
          safesCollected: {}
        }
      }

      if (!employeesMap[uId].safesCollected[safeName]) {
        employeesMap[uId].safesCollected[safeName] = 0
      }
      employeesMap[uId].safesCollected[safeName] += netAmount
    })

    const employeesSummary = Object.values(employeesMap).sort((a: any, b: any) => b.totalSales - a.totalSales)

    // 7. تفاصيل الفواتير
    const formattedOrders = orders.map(ord => ({
      id: ord.id,
      orderNo: ord.orderNo,
      createdAt: ord.createdAt,
      employeeName: ord.user.name,
      totalAmount: ord.totalAmount,
      piecesCount: ord.items.reduce((s, it) => s + it.quantity, 0),
      notes: ord.notes || '',
      itemsDetails: ord.items.map(it => `${it.product.modelNo} (${it.quantity})`).join(', ')
    }))

    return {
      success: true,
      data: {
        dateRange: { start: startStr, end: endStr },
        summary: {
          totalOrdersCount,
          totalSalesAmount,
          totalPiecesCount,
          totalCashIn,
          totalCashOut,
          netCash
        },
        employeesSummary,
        safesSummary,
        orders: formattedOrders
      }
    }
  } catch (error: any) {
    console.error('Error generating bazaar report:', error)
    return { success: false, error: error.message || 'فشل توليد تقرير البازار' }
  }
}

// =========================================================================
// دالة حذف الأوردر المتكاملة (حذف الأوردر + حذف نقدية الخزنة + استرجاع المخزون + حذف القيد المحاسبي)
// =========================================================================
export async function deleteOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true
      }
    })

    if (!order) {
      return { success: false, error: 'الأوردر غير موجود' };
    }

    await prisma.$transaction(async (tx) => {
      // 1. إعادة رصيد المخزون للأصناف
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity }
          }
        })
      }

      // 2. حذف سجلات التنفيذ والمرتجعات
      await tx.fulfillmentLog.deleteMany({
        where: { orderItem: { orderId: order.id } }
      })

      await tx.returnItem.deleteMany({
        where: {
          orderItemId: { in: order.items.map(i => i.id) }
        }
      })

      await tx.returnOrder.deleteMany({
        where: {
          OR: [
            { originalOrderId: order.id },
            { newOrderId: order.id }
          ]
        }
      })

      // 3. حذف بنود الأوردر
      await tx.orderItem.deleteMany({
        where: { orderId: order.id }
      })

      // 4. حذف جميع حركات النقدية المرتبطة بهذا الأوردر من جدول Payment
      await tx.payment.deleteMany({
        where: {
          OR: [
            { description: { contains: `#${order.orderNo}` } },
            { description: { contains: ` ${order.orderNo}` } }
          ]
        }
      })

      // 5. حذف القيود المحاسبية لدفتر الأستاذ المرتبطة بالأوردر
      await (tx as any).journalEntry.deleteMany({
        where: {
          OR: [
            { reference: `ORD-${order.orderNo}` },
            { reference: `COGS-ORD-${order.orderNo}` }
          ]
        }
      })

      // 6. حذف الأوردر نفسه
      await tx.order.delete({
        where: { id: order.id }
      })
    }, {
      maxWait: 15000,
      timeout: 30000
    })

    revalidatePath('/')
    revalidatePath('/orders/list')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/reports/bazaar')
    revalidatePath('/admin/reports/financial')
    revalidatePath('/admin/journal-entries')
    revalidatePath('/today-summary')

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting order:', error)
    return { success: false, error: error.message || 'فشل حذف الأوردر' }
  }
}