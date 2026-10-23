'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

async function checkWarehouseAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('يرجى تسجيل الدخول أولاً')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('صلاحية إدارة المخازن قاصرة على المحاسبين والإدارة فقط')
  }

  return user
}

// 1. التأكد من وجود "المخزن الرئيسي" وتوجيه بضاعة النظام إليه تلقائياً
export async function ensureDefaultWarehouse() {
  try {
    let defaultWh = await (prisma as any).warehouse.findFirst({
      where: { isDefault: true }
    })

    if (!defaultWh) {
      defaultWh = await (prisma as any).warehouse.findFirst({
        where: { name: 'المخزن الرئيسي' }
      })
    }

    if (!defaultWh) {
      defaultWh = await (prisma as any).warehouse.create({
        data: {
          name: 'المخزن الرئيسي',
          code: 'WH-01',
          location: 'المقر الرئيسي / المصنع',
          isDefault: true
        }
      })
    }

    // ترحيل أي أصناف حالية ليس لها سجل مخزن إلى المخزن الرئيسي تلقائياً
    const unmappedProducts = await prisma.product.findMany({
      where: {
        currentStock: { gt: 0 },
        warehouseStocks: { none: {} }
      },
      select: { id: true, currentStock: true }
    })

    if (unmappedProducts.length > 0) {
      await (prisma as any).warehouseStock.createMany({
        data: unmappedProducts.map(p => ({
          warehouseId: defaultWh.id,
          productId: p.id,
          quantity: p.currentStock
        })),
        skipDuplicates: true
      })
    }

    return defaultWh
  } catch (error) {
    console.error('Error ensuring default warehouse:', error)
    return null
  }
}

// 2. جلب جميع المخازن مع ملخص بضاعة وقيمة كل مخزن
export async function getWarehouses() {
  try {
    await checkWarehouseAuth()
    await ensureDefaultWarehouse()

    const warehouses = await (prisma as any).warehouse.findMany({
      include: {
        stocks: {
          where: { quantity: { gt: 0 } },
          include: {
            product: {
              select: { cost: true, price: true }
            }
          }
        },
        _count: {
          select: {
            transfersFrom: true,
            transfersTo: true
          }
        }
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    })

    const formatted = warehouses.map((wh: any) => {
      let totalPieces = 0
      let totalValueCost = 0
      let totalValuePrice = 0

      wh.stocks.forEach((st: any) => {
        const qty = st.quantity || 0
        totalPieces += qty
        totalValueCost += qty * (st.product?.cost || 0)
        totalValuePrice += qty * (st.product?.price || 0)
      })

      return {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        location: wh.location || '-',
        isDefault: wh.isDefault,
        modelsCount: wh.stocks.length,
        totalPieces,
        totalValueCost: Math.round(totalValueCost * 100) / 100,
        totalValuePrice: Math.round(totalValuePrice * 100) / 100,
        transfersCount: (wh._count.transfersFrom || 0) + (wh._count.transfersTo || 0)
      }
    })

    return {
      success: true,
      warehouses: JSON.parse(JSON.stringify(formatted))
    }
  } catch (error: any) {
    console.error('Error fetching warehouses:', error)
    return { success: false, error: error.message, warehouses: [] }
  }
}

// 3. إضافة مخزن جديد
export async function createWarehouse(data: {
  name: string
  code?: string
  location?: string
  isDefault?: boolean
}) {
  try {
    await checkWarehouseAuth()

    if (!data.name?.trim()) {
      return { success: false, error: 'اسم المخزن مطلوب' }
    }

    const trimmedName = data.name.trim()

    let code = data.code?.trim()
    if (!code) {
      const count = await (prisma as any).warehouse.count()
      code = `WH-${String(count + 1).padStart(2, '0')}`
    }

    // إذا كان المخزن الجديد افتراضياً، نلغي صفة الافتراضي عن المخازن الأخرى
    if (data.isDefault) {
      await (prisma as any).warehouse.updateMany({
        data: { isDefault: false }
      })
    }

    const warehouse = await (prisma as any).warehouse.create({
      data: {
        name: trimmedName,
        code,
        location: data.location?.trim() || null,
        isDefault: Boolean(data.isDefault)
      }
    })

    revalidatePath('/admin/warehouses')
    return { success: true, warehouse, message: `تم إنشاء المخزن (${warehouse.name}) بنجاح` }
  } catch (error: any) {
    console.error('Error creating warehouse:', error)
    return { success: false, error: 'اسم المخزن أو الكود مسجل مسبقاً' }
  }
}

// 4. تعديل مخزن
export async function updateWarehouse(id: string, data: {
  name: string
  code: string
  location?: string
  isDefault?: boolean
}) {
  try {
    await checkWarehouseAuth()

    if (data.isDefault) {
      await (prisma as any).warehouse.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false }
      })
    }

    const updated = await (prisma as any).warehouse.update({
      where: { id },
      data: {
        name: data.name.trim(),
        code: data.code.trim(),
        location: data.location?.trim() || null,
        ...(data.isDefault !== undefined && { isDefault: Boolean(data.isDefault) })
      }
    })

    revalidatePath('/admin/warehouses')
    return { success: true, warehouse: updated, message: 'تم تحديث بيانات المخزن بنجاح' }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تعديل المخزن' }
  }
}

// 5. حذف مخزن (مع التحقق من خلوه من البضاعة)
export async function deleteWarehouse(id: string) {
  try {
    await checkWarehouseAuth()

    const wh = await (prisma as any).warehouse.findUnique({
      where: { id },
      include: {
        stocks: {
          where: { quantity: { gt: 0 } }
        }
      }
    })

    if (!wh) return { success: false, error: 'المخزن غير موجود' }
    if (wh.isDefault) return { success: false, error: 'لا يمكن حذف المخزن الرئيسي الافتراضي للنظام' }

    const stockSum = wh.stocks.reduce((s: number, st: any) => s + (st.quantity || 0), 0)
    if (stockSum > 0) {
      return {
        success: false,
        error: `لا يمكن حذف المخزن لأنه يحتوي على (${stockSum}) قطعة بضاعة. يرجى نقل البضاعة لمخزن آخر أولاً.`
      }
    }

    await (prisma as any).warehouse.delete({
      where: { id }
    })

    revalidatePath('/admin/warehouses')
    return { success: true, message: `تم حذف المخزن (${wh.name}) بنجاح` }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل حذف المخزن لوجود حركات سابقة مرتبطة به' }
  }
}

// 6. جلب بضاعة ومخزون مخزن معين بالبحث
export async function getWarehouseInventory(warehouseId: string, query: string = '') {
  try {
    await checkWarehouseAuth()

    const q = query.trim().toLowerCase()

    const stocks = await (prisma as any).warehouseStock.findMany({
      where: {
        warehouseId,
        quantity: { gt: 0 },
        product: q ? {
          OR: [
            { modelNo: { contains: q, mode: 'insensitive' } },
            { color: { contains: q, mode: 'insensitive' } },
            { vendor: { contains: q, mode: 'insensitive' } }
          ]
        } : undefined
      },
      include: {
        product: {
          select: {
            id: true,
            modelNo: true,
            color: true,
            vendor: true,
            cost: true,
            price: true,
            currentStock: true
          }
        }
      },
      orderBy: { product: { modelNo: 'asc' } }
    })

    return {
      success: true,
      items: JSON.parse(JSON.stringify(stocks))
    }
  } catch (error: any) {
    return { success: false, error: error.message, items: [] }
  }
}

// 7. تحويل ومناقلة بضاعة بين مخزنين
export async function transferStockBetweenWarehouses(payload: {
  fromWarehouseId: string
  toWarehouseId: string
  date?: string
  notes?: string
  items: { productId: string; quantity: number }[]
}) {
  try {
    const user = await checkWarehouseAuth()

    if (!payload.fromWarehouseId || !payload.toWarehouseId) {
      return { success: false, error: 'يرجى اختيار المخزن المصدر والمخزن المستلم' }
    }

    if (payload.fromWarehouseId === payload.toWarehouseId) {
      return { success: false, error: 'لا يمكن التحويل لنفس المخزن' }
    }

    const validItems = payload.items.filter(i => (Number(i.quantity) || 0) > 0)
    if (validItems.length === 0) {
      return { success: false, error: 'يرجى إدخال كميات صحيحة للأصناف المراد نقلها' }
    }

    const transferDate = payload.date ? new Date(payload.date + 'T12:00:00') : new Date()

    // تنفيذ عملية التحويل داخل Transaction آمنة
    const transfer = await prisma.$transaction(async (tx) => {
      // أ. التحقق من كفاية الرصيد في المخزن المصدر
      for (const it of validItems) {
        const sourceStock = await (tx as any).warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: payload.fromWarehouseId,
              productId: it.productId
            }
          },
          include: { product: true }
        })

        const available = sourceStock?.quantity || 0
        if (available < it.quantity) {
          throw new Error(
            `الرصيد المتاح من الموديل (${sourceStock?.product?.modelNo || 'صنف'} - ${sourceStock?.product?.color || ''}) بالمخزن المصدر هو (${available}) قطعة فقط، ولا يكفي لتحويل (${it.quantity}) قطعة.`
          )
        }
      }

      // ب. إنشاء إذن التحويل
      const newTransfer = await (tx as any).stockTransfer.create({
        data: {
          fromWarehouseId: payload.fromWarehouseId,
          toWarehouseId: payload.toWarehouseId,
          date: transferDate,
          notes: payload.notes?.trim() || null,
          userId: user.id,
          items: {
            create: validItems.map(it => ({
              productId: it.productId,
              quantity: it.quantity
            }))
          }
        }
      })

      // ج. خصم الكميات من المخزن المصدر وإضافتها للمخزن المستلم
      for (const it of validItems) {
        // خصم من المصدر
        await (tx as any).warehouseStock.update({
          where: {
            warehouseId_productId: {
              warehouseId: payload.fromWarehouseId,
              productId: it.productId
            }
          },
          data: {
            quantity: { decrement: it.quantity }
          }
        })

        // إضافة إلى المستلم (Upsert)
        await (tx as any).warehouseStock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: payload.toWarehouseId,
              productId: it.productId
            }
          },
          update: {
            quantity: { increment: it.quantity }
          },
          create: {
            warehouseId: payload.toWarehouseId,
            productId: it.productId,
            quantity: it.quantity
          }
        })
      }

      return newTransfer
    })

    revalidatePath('/admin/warehouses')
    revalidatePath('/admin/products')
    revalidatePath('/admin/reports')

    const totalTransferred = validItems.reduce((s, it) => s + it.quantity, 0)
    return {
      success: true,
      transferNo: transfer.transferNo,
      message: `تم بنجاح نقل (${totalTransferred}) قطعة بإذن تحويل رقم #${transfer.transferNo}`
    }
  } catch (error: any) {
    console.error('Error transferring stock:', error)
    return { success: false, error: error.message || 'حدث خطأ أثناء مناقلة البضاعة' }
  }
}

// 8. سجل أذونات التحويل والمناقلات السابقة
export async function getStockTransfersLog(limit = 50) {
  try {
    await checkWarehouseAuth()

    const logs = await (prisma as any).stockTransfer.findMany({
      take: limit,
      orderBy: { transferNo: 'desc' },
      include: {
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
        user: { select: { name: true } },
        items: {
          include: {
            product: { select: { modelNo: true, color: true } }
          }
        }
      }
    })

    return {
      success: true,
      transfers: JSON.parse(JSON.stringify(logs))
    }
  } catch (error: any) {
    return { success: false, error: error.message, transfers: [] }
  }
}