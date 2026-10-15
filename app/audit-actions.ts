'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

interface AuditItemInput {
  productId: string
  actualStock: number
}

// 1. حفظ جرد جديد (متاح لجميع المستخدمين بما فيهم الموظفون)
export async function saveInventoryAudit(payload: {
  title?: string
  notes?: string
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

    const productIds = payload.items.map(i => i.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, currentStock: true, cost: true }
    })

    const productMap = new Map<string, { currentStock: number; cost: number }>()
    products.forEach(p => productMap.set(p.id, { currentStock: p.currentStock, cost: p.cost }))

    const audit = await prisma.$transaction(async (tx) => {
      const newAudit = await tx.inventoryAudit.create({
        data: {
          title: payload.title || `جرد مخزني - ${new Date().toLocaleDateString('ar-EG')}`,
          notes: payload.notes || '',
          userId: session.user.image as string,
          status: 'PENDING',
        }
      })

      for (const item of payload.items) {
        const prodData = productMap.get(item.productId) || { currentStock: 0, cost: 0 }
        const sysStock = prodData.currentStock
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

// 2. جلب سجل عمليات الجرد السابقة (للأدمن والمحاسب)
export async function getInventoryAudits() {
  try {
    const audits = await prisma.inventoryAudit.findMany({
      include: {
        user: { select: { id: true, name: true, role: true } },
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

// 3. جلب تفاصيل جرد معين بكامل بنوده وفروقاته
export async function getInventoryAuditDetails(auditId: string) {
  try {
    const audit = await prisma.inventoryAudit.findUnique({
      where: { id: auditId },
      include: {
        user: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            product: { select: { id: true, modelNo: true, color: true, currentStock: true, cost: true, price: true } }
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

// 5. تسوية وتعديل المخزون الحالي الفعلي فقط للأصناف المجرودة
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

    await prisma.$transaction(async (tx) => {
      for (const item of audit.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: item.actualStock
          }
        })
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
    revalidatePath('/admin/reports')

    return {
      success: true,
      message: `تم بنجاح اعتماد الجرد رقم #${audit.auditNo} وتعديل الرصيد الفعلي لـ ${audit.items.length} صنف`
    }
  } catch (error: any) {
    console.error('Error reconciling audit:', error)
    return { success: false, error: error.message || 'فشل تسوية الجرد' }
  }
}