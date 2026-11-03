'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

interface AuditItemInput {
  productId: string
  actualStock: number
}

// دالة بحث مخصصة لشاشة الجرد تجلب تفصيل رصيد الصنف في كل مخزن
export async function searchProductsForAudit(query: string) {
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
        description: true,
        currentStock: true,
        cost: true,
        warehouseStocks: {
          select: {
            warehouseId: true,
            quantity: true
          }
        }
      },
      take: 25
    })

    return JSON.parse(JSON.stringify(products))
  } catch (error) {
    console.error('Error searching products for audit:', error)
    return []
  }
}

// 1. حفظ جرد جديد مع احتساب الرصيد الدفتري بحسب المخزن المختار
export async function saveInventoryAudit(payload: {
  title?: string
  notes?: string
  warehouseId?: string // إذا كان 'ALL' أو فارغاً يعتبر جرد شامل
  items: AuditItemInput[]
}) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) {
      return { success: false, error: 'يرجى تسجيل الدخول أولاً' }
    }

    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'لا توجد أصناف في وثيقة الجرد' }
    }

    const isAllWarehouses = !payload.warehouseId || payload.warehouseId === 'ALL'
    const targetWhId = isAllWarehouses ? null : payload.warehouseId

    const productIds = payload.items.map(i => i.productId)
    
    // جلب المنتجات وتفاصيل مخزونها
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { 
        id: true, 
        currentStock: true, 
        cost: true,
        warehouseStocks: targetWhId ? {
          where: { warehouseId: targetWhId },
          select: { quantity: true }
        } : false
      }
    })

    const productMap = new Map<string, { systemStock: number; cost: number }>()
    products.forEach((p: any) => {
      let sysStock = p.currentStock // الافتراضي هو الكلي
      if (targetWhId && p.warehouseStocks && p.warehouseStocks.length > 0) {
        sysStock = p.warehouseStocks[0].quantity || 0
      } else if (targetWhId) {
        sysStock = 0 // الصنف ليس له رصيد في هذا المخزن المحدد
      }
      productMap.set(p.id, { systemStock: sysStock, cost: p.cost })
    })

    const audit = await prisma.$transaction(async (tx) => {
      const newAudit = await tx.inventoryAudit.create({
        data: {
          title: payload.title || (isAllWarehouses ? 'جرد شامل (كل المخازن)' : 'جرد فرعي'),
          notes: payload.notes || '',
          warehouseId: targetWhId,
          userId: session.user.image as string,
          status: 'PENDING',
        }
      })

      for (const item of payload.items) {
        const prodData = productMap.get(item.productId) || { systemStock: 0, cost: 0 }
        const sysStock = prodData.systemStock
        const actStock = Number(item.actualStock) || 0
        const diff = actStock - sysStock

        await tx.inventoryAuditItem.create({
          data: {
            auditId: newAudit.id,
            productId: item.productId,
            systemStock: sysStock,
            actualStock: actStock,
            difference: diff,
            costAtAudit: prodData.cost
          }
        })
      }

      return newAudit
    })

    revalidatePath('/admin/inventory-audits')
    revalidatePath('/admin/warehouses')

    return {
      success: true,
      auditNo: audit.auditNo,
      message: `تم حفظ الجرد رقم #${audit.auditNo} بنجاح دون المساس بالمخزون الحالي`
    }
  } catch (error: any) {
    console.error('Error saving inventory audit:', error)
    return { success: false, error: error.message || 'حدث خطأ أثناء حفظ الجرد' }
  }
}

// 2. جلب سجل عمليات الجرد السابقة
export async function getInventoryAudits() {
  try {
    const audits = await prisma.inventoryAudit.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { success: true, audits: JSON.parse(JSON.stringify(audits)) }
  } catch (error: any) {
    console.error('Error fetching inventory audits:', error)
    return { success: false, error: error.message }
  }
}

// 3. جلب تفاصيل جرد معين بكامل بنوده
export async function getInventoryAuditDetails(auditId: string) {
  try {
    const audit = await prisma.inventoryAudit.findUnique({
      where: { id: auditId },
      include: {
        user: { select: { id: true, name: true, role: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { 
              select: { 
                id: true, 
                modelNo: true, 
                color: true, 
                currentStock: true, 
                cost: true, 
                price: true,
                warehouseStocks: true
              } 
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!audit) return { success: false, error: 'وثيقة الجرد غير موجودة' }

    return { success: true, audit: JSON.parse(JSON.stringify(audit)) }
  } catch (error: any) {
    console.error('Error fetching audit details:', error)
    return { success: false, error: error.message }
  }
}

// 4. تعديل كميات الجرد الفعلي داخل وثيقة الجرد قبل التسوية
export async function updateInventoryAuditItems(auditId: string, items: { id: string; actualStock: number }[]) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) return { success: false, error: 'غير مصرح' }

    const user = await prisma.user.findUnique({ where: { id: session.user.image as string } })
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'صلاحية تعديل وثيقة الجرد قاصرة على المدير والمحاسب فقط' }
    }

    const audit = await prisma.inventoryAudit.findUnique({
      where: { id: auditId },
      include: { items: true }
    })

    if (!audit) return { success: false, error: 'وثيقة الجرد غير موجودة' }
    if (audit.status === 'RECONCILED') {
      return { success: false, error: 'لا يمكن تعديل جرد تمت تسويته واعتماده بالفعل' }
    }

    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        const existingItem = audit.items.find(i => i.id === it.id)
        if (existingItem) {
          const actStock = Number(it.actualStock) || 0
          const diff = actStock - existingItem.systemStock
          await tx.inventoryAuditItem.update({
            where: { id: it.id },
            data: {
              actualStock: actStock,
              difference: diff
            }
          })
        }
      }
    })

    revalidatePath('/admin/inventory-audits')
    return { success: true, message: 'تم حفظ تعديلات كشف الجرد بنجاح' }
  } catch (error: any) {
    console.error('Error updating audit items:', error)
    return { success: false, error: error.message || 'فشل تحديث كشف الجرد' }
  }
}

// 5. تسوية واعتماد الجرد وتعديل رصيد المخزن المحدد ورصيد الشركة العام
export async function reconcileInventoryAudit(auditId: string) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) return { success: false, error: 'غير مصرح' }

    const user = await prisma.user.findUnique({ where: { id: session.user.image as string } })
    if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
      return { success: false, error: 'صلاحية تسوية الجرد قاصرة على المدير والمحاسب فقط' }
    }

    const audit = await prisma.inventoryAudit.findUnique({
      where: { id: auditId },
      include: { items: true }
    })

    if (!audit) return { success: false, error: 'وثيقة الجرد غير موجودة' }
    if (audit.status === 'RECONCILED') {
      return { success: false, error: 'تمت تسوية هذا الجرد مسبقاً بالفعل' }
    }

    const isSpecificWarehouse = Boolean(audit.warehouseId)

    await prisma.$transaction(async (tx) => {
      for (const item of audit.items) {
        if (isSpecificWarehouse && audit.warehouseId) {
          // 1. جلب رصيد الصنف السابق في هذا المخزن لحساب فرق التعديل
          const currentWhStock = await (tx as any).warehouseStock.findUnique({
            where: {
              warehouseId_productId: {
                warehouseId: audit.warehouseId,
                productId: item.productId
              }
            }
          })

          const oldQtyInThisWh = currentWhStock?.quantity || 0
          const delta = item.actualStock - oldQtyInThisWh // مقدار الزيادة أو العجز في هذا المخزن

          // 2. تحديث رصيد هذا المخزن برقم الجرد الفعلي
          await (tx as any).warehouseStock.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: audit.warehouseId,
                productId: item.productId
              }
            },
            update: {
              quantity: item.actualStock
            },
            create: {
              warehouseId: audit.warehouseId,
              productId: item.productId,
              quantity: item.actualStock
            }
          })

          // 3. تعديل رصيد الشركة العام (currentStock) بمقدار الفرق (delta)
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: { increment: delta }
            }
          })
        } else {
          // جرد عام شامل لكل المخازن: تعديل رصيد الشركة المباشر
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: item.actualStock
            }
          })
        }
      }

      await tx.inventoryAudit.update({
        where: { id: auditId },
        data: {
          status: 'RECONCILED',
          reconciledAt: new Date()
        }
      })
    })

    revalidatePath('/admin/products')
    revalidatePath('/admin/inventory-audits')
    revalidatePath('/admin/warehouses')
    revalidatePath('/admin/reports')

    return {
      success: true,
      message: `تم بنجاح اعتماد الجرد رقم #${audit.auditNo} وتعديل رصيد المخزن والمخزون العام لـ ${audit.items.length} صنف`
    }
  } catch (error: any) {
    console.error('Error reconciling audit:', error)
    return { success: false, error: error.message || 'فشل تسوية الجرد' }
  }
}