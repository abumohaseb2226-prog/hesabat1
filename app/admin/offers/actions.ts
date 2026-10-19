'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

// التأكد من صلاحية المحاسب أو الإدارة
async function checkAuthorizedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('يرجى تسجيل الدخول أولاً')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('غير مصرح لك بالدخول إلى لوحة إدارة العروض')
  }

  return user
}

// جلب المنتجات للبحث والفلاتر (يدعم البحث بالموديل، الوصف، اللون، واسم المورد)
export async function getProductsForOffers(query: string = '', vendor: string = '') {
  try {
    await checkAuthorizedUser()

    const whereClause: any = {}

    if (query && query.trim() !== '') {
      const q = query.trim()
      whereClause.OR = [
        { modelNo: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { color: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } }, // 👈 البحث المباشر بالمورد
      ]
    }

    if (vendor && vendor.trim() !== '') {
      whereClause.vendor = { contains: vendor.trim(), mode: 'insensitive' }
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        modelNo: true,
        description: true,
        vendor: true,
        color: true,
        price: true,
        cost: true,
        discount: true,
        stockQty: true,
        currentStock: true,
        status: true
      },
      orderBy: { modelNo: 'asc' },
      take: 2000
    })

    return { success: true, products: JSON.parse(JSON.stringify(products)) }
  } catch (error: any) {
    console.error('Error fetching products for offers:', error)
    return { success: false, error: error.message || 'فشل جلب الأصناف' }
  }
}

// تحديث أسعار مجموعة من الأصناف دفعة واحدة
export async function applyBulkPriceUpdate(updates: { id: string; newPrice: number; newDiscount?: number }[]) {
  try {
    await checkAuthorizedUser()

    if (!updates || updates.length === 0) {
      return { success: false, error: 'لم يتم تحديد أي أصناف للتحديث' }
    }

    await prisma.$transaction(
      updates.map((item) =>
        prisma.product.update({
          where: { id: item.id },
          data: {
            price: Number(item.newPrice),
            ...(item.newDiscount !== undefined && { discount: Number(item.newDiscount) })
          }
        })
      )
    )

    revalidatePath('/admin/products')
    revalidatePath('/admin/offers')
    revalidatePath('/admin/reports')
    revalidatePath('/orders/new')

    return {
      success: true,
      message: `تم تحديث أسعار ${updates.length} صنف بنجاح`
    }
  } catch (error: any) {
    console.error('Error updating bulk prices:', error)
    return { success: false, error: error.message || 'حدث خطأ أثناء تطبيق الأسعار' }
  }
}