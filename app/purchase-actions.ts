'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

interface PurchaseLineItem {
  modelNo: string
  color: string
  quantity: number
  cost: number
  price?: number
  description?: string
}

interface PurchaseInvoicePayload {
  vendorId: string
  invoiceType: 'PURCHASE' | 'RETURN'
  paymentStatus: 'CREDIT' | 'CASH'
  safeId?: string
  invoiceNo?: string
  date?: string
  notes?: string
  items: PurchaseLineItem[]
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

// إنشاء فاتورة مشتريات / مرتجع جديدة
export async function createPurchaseInvoice(data: PurchaseInvoicePayload) {
  try {
    const user = await checkAuthorizedUser()

    if (!data.vendorId) {
      return { success: false, error: 'يرجى تحديد المورد' }
    }

    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'يجب إضافة صنف واحد على الأقل' }
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: data.vendorId }
    })

    if (!vendor) {
      return { success: false, error: 'المورد غير موجود' }
    }

    const invoiceDate = data.date ? new Date(data.date) : new Date()
    const invoiceNumber = data.invoiceNo?.trim() || `PUR-${Date.now().toString().slice(-6)}`

    // تنظيف وتجميع البنود
    const consolidatedItemsMap = new Map<string, {
      modelNo: string
      color: string
      quantity: number
      cost: number
      price: number
      description?: string
    }>()

    for (const item of data.items) {
      const model = String(item.modelNo || '').trim()
      const color = String(item.color || '').trim() || 'افتراضي'
      const qty = Number(item.quantity) || 0
      const cost = Number(item.cost) || 0
      const price = Number(item.price) || (cost * 1.25)

      if (!model || qty <= 0) continue

      const key = `${model.toLowerCase()}|${color.toLowerCase()}`
      if (consolidatedItemsMap.has(key)) {
        const existing = consolidatedItemsMap.get(key)!
        existing.quantity += qty
        if (cost > 0) existing.cost = cost
        if (price > 0) existing.price = price
      } else {
        consolidatedItemsMap.set(key, {
          modelNo: model,
          color: color,
          quantity: qty,
          cost: cost,
          price: price,
          description: item.description
        })
      }
    }

    const finalItems = Array.from(consolidatedItemsMap.values())

    if (finalItems.length === 0) {
      return { success: false, error: 'لا توجد بنود صالحة بكميات صحيحة' }
    }

    const totalAmount = finalItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0)

    if (totalAmount <= 0) {
      return { success: false, error: 'إجمالي الفاتورة يجب أن يكون أكبر من الصفر' }
    }

    if (data.paymentStatus === 'CASH' && !data.safeId) {
      return { success: false, error: 'يرجى اختيار الخزنة للدفع النقدي' }
    }

    await prisma.$transaction(
      async (tx) => {
        const isPurchase = data.invoiceType === 'PURCHASE'
        const transType = isPurchase ? 'PURCHASE' : 'RETURN'

        // 1. إنشاء الفاتورة الأساسية في جدول PurchaseInvoice
        const purchaseInvoice = await tx.purchaseInvoice.create({
          data: {
            invoiceNo: invoiceNumber,
            invoiceType: data.invoiceType,
            paymentStatus: data.paymentStatus,
            date: invoiceDate,
            totalAmount: totalAmount,
            notes: data.notes || '',
            vendorId: vendor.id,
            safeId: data.paymentStatus === 'CASH' ? data.safeId : null,
            userId: user.id
          }
        })

        // 2. تحديث المخزون الفعلي فقط للأصناف (عدم لمس stockQty الرصيد الافتتاحي)
        for (const item of finalItems) {
          let product = await tx.product.findUnique({
            where: {
              modelNo_color: { modelNo: item.modelNo, color: item.color }
            }
          })

          const stockChange = isPurchase ? item.quantity : -item.quantity

          if (product) {
            // صنف موجود مسبقاً: نزيد الرصيد الفعلي الحالي فقط
            product = await tx.product.update({
              where: { id: product.id },
              data: {
                currentStock: { increment: stockChange },
                cost: item.cost > 0 ? item.cost : product.cost,
                vendor: vendor.name,
                vendorId: vendor.id,
                description: item.description || product.description
              }
            })
          } else {
            // صنف جديد دخل من فاتورة المشتريات: رصيده الافتتاحي صفر
            product = await tx.product.create({
              data: {
                modelNo: item.modelNo,
                color: item.color,
                stockQty: 0, // ✅ الرصيد الافتتاحي صفر دائماً لفواتير الشراء
                currentStock: stockChange, // الرصيد المتاح هو كمية الفاتورة
                cost: item.cost,
                price: item.price,
                vendor: vendor.name,
                vendorId: vendor.id,
                description: item.description || ''
              }
            })
          }

          // حفظ البند في بنود الفاتورة
          await tx.purchaseInvoiceItem.create({
            data: {
              invoiceId: purchaseInvoice.id,
              productId: product.id,
              quantity: item.quantity,
              cost: item.cost,
              price: item.price,
              description: item.description || ''
            }
          })
        }

        // 3. سطر مالي واحد في كشف حساب المورد بإجمالي الفاتورة
        const totalPieces = finalItems.reduce((s, it) => s + it.quantity, 0)
        await tx.vendorTransaction.create({
          data: {
            vendorId: vendor.id,
            type: transType,
            amount: totalAmount,
            reference: invoiceNumber,
            description: isPurchase
              ? `فاتورة مشتريات #${invoiceNumber} (${data.paymentStatus === 'CASH' ? 'نقدي' : 'آجل'}) - إجمالي ${finalItems.length} صنف (${totalPieces} قطعة)`
              : `مرتجع مشتريات للمورد #${invoiceNumber} (${data.paymentStatus === 'CASH' ? 'نقدي' : 'آجل'}) - إجمالي ${finalItems.length} صنف (${totalPieces} قطعة)`,
            userId: user.id,
            createdAt: invoiceDate
          }
        })

        // 4. في حال السداد النقدي
        if (data.paymentStatus === 'CASH' && data.safeId) {
          if (isPurchase) {
            await tx.payment.create({
              data: {
                type: 'OUT',
                amount: totalAmount,
                currency: 'EGP',
                safeId: data.safeId,
                vendorId: vendor.id,
                userId: user.id,
                description: `سداد نقدي لفاتورة مشتريات #${invoiceNumber} للمورد: ${vendor.name}`,
                createdAt: invoiceDate
              }
            })
          } else {
            await tx.payment.create({
              data: {
                type: 'IN',
                amount: totalAmount,
                currency: 'EGP',
                safeId: data.safeId,
                vendorId: vendor.id,
                userId: user.id,
                description: `استرداد نقدي لمرتجع مشتريات #${invoiceNumber} من المورد: ${vendor.name}`,
                createdAt: invoiceDate
              }
            })
          }
        }
      },
      { maxWait: 30000, timeout: 60000 }
    )

    revalidatePath('/admin/products')
    revalidatePath('/admin/vendors')
    revalidatePath(`/admin/vendors/${vendor.id}`)
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return {
      success: true,
      message: data.invoiceType === 'PURCHASE' 
        ? `تم حفظ فاتورة المشتريات رقم #${invoiceNumber} بنجاح` 
        : `تم حفظ مرتجع المشتريات رقم #${invoiceNumber} بنجاح`
    }
  } catch (error: any) {
    console.error('Error creating purchase invoice:', error)
    return { success: false, error: error.message || 'حدث خطأ أثناء حفظ الفاتورة' }
  }
}

// استرجاع تفاصيل بنود الفاتورة بالكامل من الجدول المخصص لها للتعديل
export async function getPurchaseInvoiceDetails(invoiceNumber: string) {
  try {
    await checkAuthorizedUser()

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { invoiceNo: invoiceNumber },
      include: {
        vendor: true,
        items: {
          include: { product: true }
        }
      }
    })

    if (invoice) {
      return {
        success: true,
        invoice: {
          invoiceNo: invoice.invoiceNo,
          invoiceType: invoice.invoiceType,
          paymentStatus: invoice.paymentStatus,
          safeId: invoice.safeId || '',
          vendorId: invoice.vendorId,
          vendorName: invoice.vendor.name,
          date: invoice.date.toISOString().split('T')[0],
          notes: invoice.notes || '',
          items: invoice.items.map(it => ({
            id: it.id,
            productId: it.productId,
            modelNo: it.product.modelNo,
            color: it.product.color,
            quantity: it.quantity,
            cost: it.cost,
            price: it.price,
            description: it.description || ''
          }))
        }
      }
    }

    const transactions = await prisma.vendorTransaction.findMany({
      where: { reference: invoiceNumber },
      include: { product: true, vendor: true }
    })

    if (transactions.length > 0) {
      const first = transactions[0]
      return {
        success: true,
        invoice: {
          invoiceNo: invoiceNumber,
          invoiceType: first.type,
          paymentStatus: 'CREDIT',
          safeId: '',
          vendorId: first.vendorId,
          vendorName: first.vendor.name,
          date: first.createdAt.toISOString().split('T')[0],
          notes: '',
          items: transactions.map(t => ({
            id: t.id,
            productId: t.productId,
            modelNo: t.product?.modelNo || '',
            color: t.product?.color || 'افتراضي',
            quantity: t.quantity || 1,
            cost: t.quantity ? t.amount / t.quantity : t.amount,
            price: t.product?.price || 0,
            description: t.description || ''
          }))
        }
      }
    }

    return { success: false, error: 'الفاتورة غير موجودة' }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل جلب تفاصيل الفاتورة' }
  }
}

// تحديث بنود الفاتورة وإعادة وزن المخزون والنقدية بدقة تامة
export async function updatePurchaseInvoice(invoiceNumber: string, data: PurchaseInvoicePayload) {
  try {
    const user = await checkAuthorizedUser()

    const oldInvoice = await prisma.purchaseInvoice.findUnique({
      where: { invoiceNo: invoiceNumber },
      include: { items: true }
    })

    const vendor = await prisma.vendor.findUnique({
      where: { id: data.vendorId }
    })

    if (!vendor) return { success: false, error: 'المورد غير موجود' }

    const invoiceDate = data.date ? new Date(data.date) : new Date()

    await prisma.$transaction(async (tx) => {
      // 1. عكس الأثر القديم للمخزون
      if (oldInvoice) {
        const isOldPurchase = oldInvoice.invoiceType === 'PURCHASE'
        for (const it of oldInvoice.items) {
          const delta = isOldPurchase ? -it.quantity : it.quantity
          await tx.product.update({
            where: { id: it.productId },
            data: {
              currentStock: { increment: delta }
            }
          })
        }
      } else {
        const oldTrans = await tx.vendorTransaction.findMany({ where: { reference: invoiceNumber } })
        for (const t of oldTrans) {
          if (t.productId && t.quantity) {
            const delta = t.type === 'PURCHASE' ? -t.quantity : t.quantity
            await tx.product.update({
              where: { id: t.productId },
              data: { currentStock: { increment: delta } }
            })
          }
        }
      }

      // 2. حذف السندات والبيانات القديمة
      await tx.payment.deleteMany({ where: { description: { contains: `#${invoiceNumber}` } } })
      await tx.vendorTransaction.deleteMany({ where: { reference: invoiceNumber } })
      await tx.purchaseInvoice.deleteMany({ where: { invoiceNo: invoiceNumber } })

      // 3. تطبيق الفاتورة الجديدة بالكامل
      const isPurchase = data.invoiceType === 'PURCHASE'
      const transType = isPurchase ? 'PURCHASE' : 'RETURN'
      let totalAmount = 0

      const newInv = await tx.purchaseInvoice.create({
        data: {
          invoiceNo: invoiceNumber,
          invoiceType: data.invoiceType,
          paymentStatus: data.paymentStatus,
          date: invoiceDate,
          totalAmount: 0,
          notes: data.notes || '',
          vendorId: vendor.id,
          safeId: data.paymentStatus === 'CASH' ? data.safeId : null,
          userId: user.id
        }
      })

      for (const item of data.items) {
        const qty = Number(item.quantity) || 0
        const cost = Number(item.cost) || 0
        const price = Number(item.price) || (cost * 1.25)
        const modelNo = String(item.modelNo).trim()
        const color = String(item.color).trim() || 'افتراضي'

        if (!modelNo || qty <= 0) continue

        totalAmount += (qty * cost)

        let product = await tx.product.findUnique({
          where: { modelNo_color: { modelNo, color } }
        })

        const stockChange = isPurchase ? qty : -qty

        if (product) {
          product = await tx.product.update({
            where: { id: product.id },
            data: {
              currentStock: { increment: stockChange },
              cost: cost > 0 ? cost : product.cost,
              vendor: vendor.name,
              vendorId: vendor.id,
              description: item.description || product.description
            }
          })
        } else {
          product = await tx.product.create({
            data: {
              modelNo,
              color,
              stockQty: 0, // ✅ دائماً صفر
              currentStock: stockChange,
              cost,
              price,
              vendor: vendor.name,
              vendorId: vendor.id,
              description: item.description || ''
            }
          })
        }

        await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: newInv.id,
            productId: product.id,
            quantity: qty,
            cost: cost,
            price: price,
            description: item.description || ''
          }
        })
      }

      await tx.purchaseInvoice.update({
        where: { id: newInv.id },
        data: { totalAmount }
      })

      // سطر واحد مالي فقط في كشف حساب المورد
      await tx.vendorTransaction.create({
        data: {
          vendorId: vendor.id,
          type: transType,
          amount: totalAmount,
          reference: invoiceNumber,
          description: isPurchase
            ? `فاتورة مشتريات #${invoiceNumber} (معدلة) - إجمالي ${data.items.length} صنف`
            : `مرتجع مشتريات #${invoiceNumber} (معدل) - إجمالي ${data.items.length} صنف`,
          userId: user.id,
          createdAt: invoiceDate
        }
      })

      // حركة الخزنة إن كانت نقداً
      if (data.paymentStatus === 'CASH' && data.safeId && totalAmount > 0) {
        await tx.payment.create({
          data: {
            type: isPurchase ? 'OUT' : 'IN',
            amount: totalAmount,
            currency: 'EGP',
            safeId: data.safeId,
            vendorId: vendor.id,
            userId: user.id,
            description: `${isPurchase ? 'سداد نقدي لفاتورة مشتريات' : 'استرداد نقدي لمرتجع'} #${invoiceNumber} للمورد: ${vendor.name}`,
            createdAt: invoiceDate
          }
        })
      }
    }, { maxWait: 30000, timeout: 60000 })

    revalidatePath('/admin/products')
    revalidatePath('/admin/vendors')
    revalidatePath(`/admin/vendors/${vendor.id}`)
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم تحديث بنود الفاتورة #${invoiceNumber} بنجاح` }
  } catch (error: any) {
    console.error('Error updating purchase invoice:', error)
    return { success: false, error: error.message || 'فشل تحديث الفاتورة' }
  }
}

// دالة حذف وإلغاء فاتورة المشتريات أو المرتجع وعكس أثر المخزون
export async function cancelVendorInvoice(invoiceNumber: string) {
  try {
    await checkAuthorizedUser()

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { invoiceNo: invoiceNumber },
      include: { items: true }
    })

    await prisma.$transaction(async (tx) => {
      if (invoice) {
        const isPurchase = invoice.invoiceType === 'PURCHASE'
        for (const it of invoice.items) {
          const delta = isPurchase ? -it.quantity : it.quantity
          await tx.product.update({
            where: { id: it.productId },
            data: {
              currentStock: { increment: delta }
            }
          })
        }
        await tx.purchaseInvoice.delete({ where: { id: invoice.id } })
      } else {
        const oldTrans = await tx.vendorTransaction.findMany({ where: { reference: invoiceNumber } })
        for (const t of oldTrans) {
          if (t.productId && t.quantity) {
            const delta = t.type === 'PURCHASE' ? -t.quantity : t.quantity
            await tx.product.update({
              where: { id: t.productId },
              data: { currentStock: { increment: delta } }
            })
          }
        }
      }

      await tx.payment.deleteMany({ where: { description: { contains: `#${invoiceNumber}` } } })
      await tx.vendorTransaction.deleteMany({ where: { reference: invoiceNumber } })
    })

    revalidatePath('/admin/products')
    revalidatePath('/admin/vendors')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم إلغاء وحذف الفاتورة #${invoiceNumber} وعكس أثر المخزون والنقدية بنجاح` }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل إلغاء الفاتورة' }
  }
}

export async function searchProductsForPurchase(query: string) {
  try {
    if (!query || query.trim().length === 0) return []

    const q = query.trim()
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { modelNo: { contains: q, mode: 'insensitive' } },
          { color: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        cost: true,
        price: true,
        currentStock: true,
        description: true
      },
      take: 25
    })

    return products
  } catch (error) {
    return []
  }
}

export async function getModelColors(modelNo: string) {
  try {
    if (!modelNo || modelNo.trim().length === 0) return []

    const products = await prisma.product.findMany({
      where: {
        modelNo: { equals: modelNo.trim(), mode: 'insensitive' }
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        cost: true,
        price: true,
        currentStock: true,
        description: true
      },
      orderBy: { color: 'asc' }
    })

    return products
  } catch (error) {
    return []
  }
}

export async function fetchProductsForExcelImport(items: { modelNo: string; color: string }[]) {
  try {
    if (!items || items.length === 0) return []

    const modelNos = Array.from(new Set(items.map(i => String(i.modelNo).trim())))

    const dbProducts = await prisma.product.findMany({
      where: { modelNo: { in: modelNos } },
      select: {
        id: true,
        modelNo: true,
        color: true,
        cost: true,
        price: true,
        currentStock: true,
        description: true
      }
    })

    return JSON.parse(JSON.stringify(dbProducts))
  } catch (error) {
    return []
  }
}

export async function createQuickProduct(data: {
  modelNo: string
  color: string
  cost: number
  price: number
  description?: string
  vendorId?: string
}) {
  try {
    await checkAuthorizedUser()

    if (!data.modelNo || !data.color) {
      return { success: false, error: 'الموديل واللون مطلوبان' }
    }

    const existing = await prisma.product.findUnique({
      where: {
        modelNo_color: {
          modelNo: data.modelNo.trim(),
          color: data.color.trim()
        }
      }
    })

    if (existing) {
      return { success: false, error: 'هذا الصنف (الموديل مع اللون) مسجل بالفعل مسبقاً' }
    }

    let vendorName: string | undefined = undefined
    if (data.vendorId) {
      const v = await prisma.vendor.findUnique({ where: { id: data.vendorId } })
      if (v) vendorName = v.name
    }

    const product = await prisma.product.create({
      data: {
        modelNo: data.modelNo.trim(),
        color: data.color.trim(),
        cost: Number(data.cost) || 0,
        price: Number(data.price) || (Number(data.cost) * 1.25),
        description: data.description || '',
        vendor: vendorName,
        vendorId: data.vendorId || null,
        stockQty: 0,
        currentStock: 0,
        status: 'OPEN'
      }
    })

    revalidatePath('/admin/products')
    return { success: true, product }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}