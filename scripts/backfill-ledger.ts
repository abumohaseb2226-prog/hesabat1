import { PrismaClient } from '@prisma/client'
import {
  ensureStandardChartAccounts,
  postPurchaseInvoiceToLedger,
  postSalesOrderToLedger,
  postSalesReturnToLedger,
  postPaymentToLedger
} from '../lib/accounting-engine'

const prisma = new PrismaClient()

async function main() {
  console.log('==================================================')
  console.log('🚀 بدء ترحيل العمليات التاريخية إلى دفتر الأستاذ العام...')
  console.log('==================================================\n')

  // مستخدم افتراضي للقيود في حال عدم توفر مستخدم
  const fallbackUser = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' }
  })

  if (!fallbackUser) {
    console.error('❌ لا يوجد أي مستخدم مسجل في النظام لربط القيود به!')
    return
  }

  const defaultUserId = fallbackUser.id

  // 1. التأكد من وجود شجرة الحسابات
  console.log('1️⃣ فحص وتهيئة الحسابات القياسية في شجرة الحسابات...')
  await prisma.$transaction(async (tx) => {
    await ensureStandardChartAccounts(tx)
  })
  console.log('   ✅ تم التأكد من شجرة الحسابات بنجاح.\n')

  // 2. ترحيل فواتير المشتريات السابقة
  console.log('2️⃣ ترحيل فواتير المشتريات السابقة...')
  const purchases = await prisma.purchaseInvoice.findMany({
    include: {
      vendor: { select: { name: true } },
      safe: { select: { name: true } }
    },
    orderBy: { date: 'asc' }
  })

  let purchasesCount = 0
  for (const pur of purchases) {
    const ref = `PUR-${pur.invoiceNo}`
    const exists = await (prisma as any).journalEntry.findFirst({
      where: { reference: ref }
    })

    if (!exists) {
      await prisma.$transaction(async (tx) => {
        await postPurchaseInvoiceToLedger(tx, {
          invoiceNo: pur.invoiceNo,
          vendorId: pur.vendorId,
          vendorName: pur.vendor?.name || 'مورد',
          totalAmount: pur.totalAmount,
          isCash: pur.paymentStatus === 'CASH',
          safeId: pur.safeId,
          safeName: pur.safe?.name,
          date: pur.date || pur.createdAt,
          userId: pur.userId || defaultUserId
        })
      })
      purchasesCount++
    }
  }
  console.log(`   ✅ تم ترحيل ${purchasesCount} فاتورة مشتريات (تم تخطي ${purchases.length - purchasesCount} مرحلة مسبقاً).\n`)

  // 3. ترحيل أوردرات وفواتير المبيعات السابقة
  console.log('3️⃣ ترحيل أوردرات المبيعات السابقة...')
  const orders = await prisma.order.findMany({
    include: {
      customer: { select: { name: true } },
      safe: { select: { name: true } },
      items: {
        include: {
          product: { select: { cost: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })

  let ordersCount = 0
  for (const ord of orders) {
    const ref = `ORD-${ord.orderNo}`
    const exists = await (prisma as any).journalEntry.findFirst({
      where: { reference: ref }
    })

    if (!exists) {
      // احتساب تكلفة البضاعة المباعة التقديرية لهذا الأوردر
      const cogsAmount = ord.items.reduce((s, it) => {
        const itemCost = it.product?.cost || 0
        return s + (itemCost * (it.quantity || 0))
      }, 0)

      await prisma.$transaction(async (tx) => {
        await postSalesOrderToLedger(tx, {
          orderId: ord.id,
          orderNo: ord.orderNo,
          customerId: ord.customerId,
          customerName: ord.customer?.name || 'عميل',
          totalAmount: ord.totalAmount,
          depositPaid: ord.deposit || 0,
          safeId: ord.safeId,
          safeName: ord.safe?.name,
          cogsAmount,
          date: ord.createdAt,
          userId: ord.userId || defaultUserId
        })
      })
      ordersCount++
    }
  }
  console.log(`   ✅ تم ترحيل ${ordersCount} أوردر مبيعات (تم تخطي ${orders.length - ordersCount} مرحلة مسبقاً).\n`)

  // 4. ترحيل مرتجعات المبيعات السابقة
  console.log('4️⃣ ترحيل مرتجعات المبيعات السابقة...')
  const returns = await prisma.returnOrder.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: {
      originalOrder: {
        include: {
          customer: { select: { name: true } }
        }
      },
      safe: { select: { name: true } },
      items: {
        include: {
          product: { select: { cost: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })

  let returnsCount = 0
  for (const ret of returns) {
    const ref = `RET-${ret.returnNo}`
    const exists = await (prisma as any).journalEntry.findFirst({
      where: { reference: ref }
    })

    if (!exists) {
      const cogsAmount = ret.items.reduce((s, it) => {
        const itemCost = it.product?.cost || 0
        return s + (itemCost * (it.quantity || 0))
      }, 0)

      await prisma.$transaction(async (tx) => {
        await postSalesReturnToLedger(tx, {
          returnNo: ret.returnNo,
          customerId: ret.originalOrder.customerId,
          customerName: ret.originalOrder.customer?.name || 'عميل',
          refundAmount: ret.totalRefund || 0,
          isCash: ret.refundMethod === 'CASH',
          safeId: ret.safeId,
          safeName: ret.safe?.name,
          cogsAmount,
          date: ret.date || ret.createdAt,
          userId: ret.userId || defaultUserId
        })
      })
      returnsCount++
    }
  }
  console.log(`   ✅ تم ترحيل ${returnsCount} مرتجع مبيعات (تم تخطي ${returns.length - returnsCount} مرحلة مسبقاً).\n`)

  // 5. ترحيل سندات القبض والصرف والمصروفات المستقلة
  console.log('5️⃣ ترحيل سندات القبض والصرف السابقة...')
  const payments = await prisma.payment.findMany({
    where: {
      // استبعاد السندات التلقائية المربوطة بأوردرات لتفادي الازدواجية
      NOT: [
        { description: { contains: 'أوردر #' } },
        { description: { contains: 'فاتورة مشتريات #' } },
        { description: { contains: 'مرتجع مبيعات #' } }
      ]
    },
    include: {
      customer: { select: { name: true } },
      vendor: { select: { name: true } },
      safe: { select: { name: true } },
      targetSafe: { select: { name: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  let paymentsCount = 0
  for (const pay of payments) {
    const ref = `PAY-${pay.receiptNo}`
    const exists = await (prisma as any).journalEntry.findFirst({
      where: { reference: ref }
    })

    if (!exists && pay.safeId) {
      let partyType: 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE' | 'EXPENSE' = 'EXPENSE'
      let partyName = ''

      if (pay.customerId) {
        partyType = 'CUSTOMER'
        partyName = pay.customer?.name || 'عميل'
      } else if (pay.vendorId) {
        partyType = 'VENDOR'
        partyName = pay.vendor?.name || 'مورد'
      } else if (pay.description && (pay.description.includes('سلفة') || pay.description.includes('راتب') || pay.description.includes('موظف'))) {
        partyType = 'EMPLOYEE'
        partyName = 'موظف'
      }

      await prisma.$transaction(async (tx) => {
        await postPaymentToLedger(tx, {
          receiptNo: pay.receiptNo,
          type: pay.type as any,
          partyType,
          partyId: pay.customerId || pay.vendorId || null,
          partyName,
          amount: pay.amount,
          safeId: pay.safeId!,
          safeName: pay.safe?.name || 'الخزنة',
          targetSafeId: pay.targetSafeId,
          targetSafeName: pay.targetSafe?.name,
          description: pay.description,
          date: pay.createdAt,
          userId: pay.userId || defaultUserId
        })
      })
      paymentsCount++
    }
  }
  console.log(`   ✅ تم ترحيل ${paymentsCount} سند نقدي (تم تخطي ${payments.length - paymentsCount} مرحلة مسبقاً).\n`)

  console.log('==================================================')
  console.log('🎉 اكتملت عملية الترحيل التاريخي بنجاح تام!')
  console.log('أصبح دفتر الأستاذ العام وشجرة الحسابات متزامنين مع كافة بياناتك السابقة.')
  console.log('==================================================')
}

main()
  .catch((e) => {
    console.error('❌ حدث خطأ أثناء الترحيل التاريخي:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })