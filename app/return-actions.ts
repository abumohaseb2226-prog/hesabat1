'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

// فحص الصلاحية
async function checkAuthUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('يرجى تسجيل الدخول أولاً')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT', 'EMPLOYEE'].includes(user.role)) {
    throw new Error('غير مصرح لك بالقيام بهذه العملية')
  }

  return user
}

// 1. بحث لايف في فواتير العميل المختار فقط
export async function getCustomerOrdersForReturn(customerId: string, searchNo: string = '') {
  try {
    await checkAuthUser()

    if (!customerId) return { success: true, orders: [] }

    const whereClause: any = {
      customerId: customerId,
    }

    if (searchNo.trim()) {
      const parsedNo = parseInt(searchNo.trim(), 10)
      if (!isNaN(parsedNo)) {
        whereClause.orderNo = parsedNo
      }
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                modelNo: true,
                color: true,
                price: true,
                currentStock: true,
                description: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    const formattedOrders = orders.map(ord => ({
      id: ord.id,
      orderNo: ord.orderNo,
      date: ord.createdAt.toISOString().split('T')[0],
      totalAmount: ord.totalAmount,
      deposit: ord.deposit,
      items: ord.items.map(it => ({
        orderItemId: it.id,
        productId: it.productId,
        modelNo: it.product.modelNo,
        color: it.product.color,
        description: it.product.description || '',
        price: it.price,
        quantity: it.quantity,
        maxQuantity: it.quantity,
        discountPercent: it.discountPercent || 0
      }))
    }))

    return { success: true, orders: formattedOrders }
  } catch (error: any) {
    console.error('Error fetching customer orders for return:', error)
    return { success: false, error: error.message, orders: [] }
  }
}

// 2. إنشاء وتوثيق فاتورة المرتجع الموحدة (من فاتورة سابقة أو حر + استبدال + تسوية مالية ومخزنية)
export async function createUnifiedReturnOrder(payload: {
  customerId: string
  originalOrderId?: string | null
  returnType: 'FULL' | 'PARTIAL' | 'EXCHANGE'
  refundMethod: 'CASH' | 'CREDIT'
  safeId?: string | null
  reason?: string
  notes?: string
  returnItems: {
    productId: string
    orderItemId?: string | null
    quantity: number
    unitPrice: number
  }[]
  exchangeItems?: {
    productId: string
    quantity: number
    price: number
  }[]
}) {
  try {
    const user = await checkAuthUser()

    if (!payload.customerId) {
      return { success: false, error: 'يرجى تحديد العميل أولاً' }
    }

    if (!payload.returnItems || payload.returnItems.length === 0) {
      return { success: false, error: 'يجب إضافة صنف واحد على الأقل للمرتجع' }
    }

    const customer = await prisma.customer.findUnique({
      where: { id: payload.customerId }
    })
    if (!customer) return { success: false, error: 'العميل غير موجود' }

    // حساب إجمالي قيمة المرتجع
    const totalRefund = payload.returnItems.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0)

    // حساب إجمالي قيمة الأصناف البديلة
    const totalExchange = (payload.exchangeItems || []).reduce((sum, it) => sum + (it.quantity * it.price), 0)

    // فرق السعر (الموجب = العميل يدفع، السالب = العميل يسترد)
    const exchangeDiff = totalExchange - totalRefund

    if (payload.refundMethod === 'CASH' && !payload.safeId && payload.returnType !== 'EXCHANGE') {
      return { success: false, error: 'يرجى اختيار الخزنة للصرف النقدي' }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. التأكد من وجود Order مرجعي (إذا كان المرتجع حراً ولا يرتبط بأوردر سابق، نربطه بأحدث أوردر أو ننشئ مرجعاً رمزياً)
      let targetOrderId = payload.originalOrderId

      if (!targetOrderId) {
        const lastOrder = await tx.order.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' }
        })

        if (lastOrder) {
          targetOrderId = lastOrder.id
        } else {
          // إنشاء أوردر رمزي لحفظ ترابط قاعدة البيانات
          const dummyOrder = await tx.order.create({
            data: {
              userId: user.id,
              customerId: customer.id,
              totalAmount: 0,
              deposit: 0,
              notes: 'أوردر رمزي لمرتجع حر بدون فاتورة سابقة'
            }
          })
          targetOrderId = dummyOrder.id
        }
      }

      // 2. إنشاء سجل ReturnOrder
      const newReturn = await tx.returnOrder.create({
        data: {
          originalOrderId: targetOrderId,
          type: payload.returnType,
          reason: payload.reason || '',
          notes: payload.notes || '',
          totalRefund: payload.returnType === 'EXCHANGE' ? 0 : totalRefund,
          depositRefunded: 0,
          exchangeAmount: payload.returnType === 'EXCHANGE' ? exchangeDiff : 0,
          refundMethod: payload.returnType === 'EXCHANGE' ? 'CREDIT' : payload.refundMethod,
          safeId: payload.refundMethod === 'CASH' ? payload.safeId : null,
          userId: user.id,
          status: 'COMPLETED'
        }
      })

      // 3. إضافة بنود المرتجع وزيادة رصيد المخزن الفعلي للأصناف المرتجعة
      for (const it of payload.returnItems) {
        // إذا كان هناك orderItemId نستخدمه، وإن لم يكن نبحث عن أي بند سابق أو نتركه null
        let resolvedOrderItemId = it.orderItemId
        if (!resolvedOrderItemId) {
          const existingOi = await tx.orderItem.findFirst({
            where: { orderId: targetOrderId, productId: it.productId }
          })
          if (existingOi) {
            resolvedOrderItemId = existingOi.id
          } else {
            // إنشاء بند أوردر لربط الـ foreign key
            const dummyOi = await tx.orderItem.create({
              data: {
                orderId: targetOrderId,
                productId: it.productId,
                quantity: it.quantity,
                price: it.unitPrice
              }
            })
            resolvedOrderItemId = dummyOi.id
          }
        }

        await tx.returnItem.create({
          data: {
            returnOrderId: newReturn.id,
            orderItemId: resolvedOrderItemId,
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            refundAmount: it.quantity * it.unitPrice
          }
        })

        // زيادة المخزون الفعلي للصنف المرتجع
        await tx.product.update({
          where: { id: it.productId },
          data: { currentStock: { increment: it.quantity } }
        })
      }

      // 4. معالجة الأصناف البديلة (في حالة الاستبدال)
      if (payload.returnType === 'EXCHANGE' && payload.exchangeItems && payload.exchangeItems.length > 0) {
        for (const exIt of payload.exchangeItems) {
          // خصم بضاعة الاستبدال من المخزن
          await tx.product.update({
            where: { id: exIt.productId },
            data: { currentStock: { decrement: exIt.quantity } }
          })
        }
      }

      // 5. التسوية المالية
      const actionDesc = payload.returnType === 'EXCHANGE'
        ? `تسوية استبدال لمرتجع #${newReturn.returnNo} للعميل: ${customer.name}`
        : `استرداد نقدي لمرتجع مبيعات #${newReturn.returnNo} للعميل: ${customer.name}`

      // أ. صرف كاش من الخزنة
      if (payload.refundMethod === 'CASH' && payload.safeId && totalRefund > 0 && payload.returnType !== 'EXCHANGE') {
        await tx.payment.create({
          data: {
            type: 'OUT',
            amount: totalRefund,
            currency: 'EGP',
            safeId: payload.safeId,
            customerId: customer.id,
            userId: user.id,
            description: actionDesc
          }
        })
      }

      // ب. في حالة الاستبدال وكان هناك فرق نقدي يستلزم الدفع أو الاسترداد في الخزنة
      if (payload.returnType === 'EXCHANGE' && payload.safeId && Math.abs(exchangeDiff) > 0) {
        if (exchangeDiff > 0) {
          // العميل يدفع فرقاً للخزنة
          await tx.payment.create({
            data: {
              type: 'IN',
              amount: exchangeDiff,
              currency: 'EGP',
              safeId: payload.safeId,
              customerId: customer.id,
              userId: user.id,
              description: `تحصيل فرق سعر استبدال لمرتجع #${newReturn.returnNo} من العميل: ${customer.name}`
            }
          })
        } else if (exchangeDiff < 0) {
          // العميل يسترد فرقاً من الخزنة
          await tx.payment.create({
            data: {
              type: 'OUT',
              amount: Math.abs(exchangeDiff),
              currency: 'EGP',
              safeId: payload.safeId,
              customerId: customer.id,
              userId: user.id,
              description: `صرف فرق سعر استبدال لمرتجع #${newReturn.returnNo} للعميل: ${customer.name}`
            }
          })
        }
      }

      return newReturn
    })

    revalidatePath('/admin/returns')
    revalidatePath('/orders/list')
    revalidatePath('/admin/products')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')
    revalidatePath(`/admin/reports/customer/${customer.id}`)

    return {
      success: true,
      returnNo: result.returnNo,
      returnId: result.id,
      message: `تم بنجاح تسجيل المرتجع رقم #${result.returnNo} وتحديث المخزون والحسابات المالية.`
    }
  } catch (error: any) {
    console.error('Error creating unified return order:', error)
    return { success: false, error: error.message || 'فشل حفظ المرتجع' }
  }
}