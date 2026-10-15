'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

async function checkAccountingAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('يرجى تسجيل الدخول أولاً')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('صلاحية إدارة الأصول الثابتة قاصرة على المحاسبين والإدارة فقط')
  }

  return user
}

// 1. جلب قائمة الأصول الثابتة مع إجماليات القيمة الرأسمالية
export async function getFixedAssets() {
  try {
    await checkAccountingAuth()

    const assets = await prisma.fixedAsset.findMany({
      include: {
        safe: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, bankName: true } },
        creditorAccount: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      },
      orderBy: { purchaseDate: 'desc' }
    })

    const totalAssetsValue = assets.reduce((sum, a) => sum + (Number(a.currentValue) || 0), 0)
    const totalPurchaseCost = assets.reduce((sum, a) => sum + (Number(a.purchaseCost) || 0), 0)

    return {
      success: true,
      assets: JSON.parse(JSON.stringify(assets)),
      summary: {
        count: assets.length,
        totalAssetsValue,
        totalPurchaseCost
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 2. شراء وتسجيل أصل ثابت جديد مع سداد قيمته نقدياً أو بنكياً أو عبر دائن
export async function createFixedAsset(data: {
  name: string
  assetCode?: string
  category: string
  purchaseCost: number
  purchaseDate?: string
  depreciationRate?: number
  location?: string
  notes?: string
  paymentMethod: 'CASH_SAFE' | 'BANK' | 'DEBTOR_CREDIT' | 'VENDOR_CREDIT'
  paymentTargetId: string // safeId أو bankAccountId أو creditorAccountId أو vendorId
}) {
  try {
    const user = await checkAccountingAuth()
    const cost = Number(data.purchaseCost) || 0

    if (!data.name.trim() || cost <= 0) {
      return { success: false, error: 'اسم الأصل وتكلفة الشراء مطلوبان' }
    }

    const code = data.assetCode?.trim() || `AST-${Date.now().toString().slice(-5)}`
    const pDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date()

    const asset = await prisma.$transaction(async (tx) => {
      // 1. تسجيل الأصل
      const newAsset = await tx.fixedAsset.create({
        data: {
          assetCode: code,
          name: data.name.trim(),
          category: data.category,
          purchaseDate: pDate,
          purchaseCost: cost,
          currentValue: cost, // القيمة الدفترية تبدأ بنفس تكلفة الشراء
          depreciationRate: Number(data.depreciationRate) || 0,
          location: data.location || 'المصنع / المعرض',
          notes: data.notes || '',
          paymentMethod: data.paymentMethod,
          safeId: data.paymentMethod === 'CASH_SAFE' ? data.paymentTargetId : null,
          bankAccountId: data.paymentMethod === 'BANK' ? data.paymentTargetId : null,
          creditorAccountId: data.paymentMethod === 'DEBTOR_CREDIT' ? data.paymentTargetId : null,
          vendorId: data.paymentMethod === 'VENDOR_CREDIT' ? data.paymentTargetId : null,
          userId: user.id
        }
      })

      // 2. معالجة سداد تكلفة شراء الأصل
      if (data.paymentMethod === 'CASH_SAFE') {
        // خروج نقدية من الخزنة كسند صرف رأسمالي لشراء أصل
        await tx.payment.create({
          data: {
            type: 'OUT',
            amount: cost,
            currency: 'EGP',
            safeId: data.paymentTargetId,
            userId: user.id,
            description: `شراء أصل ثابت رأسمالي: ${data.name.trim()} (كود: ${code})`,
            createdAt: pDate
          }
        })
      } else if (data.paymentMethod === 'BANK') {
        // سحب بنكي لشراء الأصل
        await tx.bankAccount.update({
          where: { id: data.paymentTargetId },
          data: { balance: { decrement: cost } }
        })
        await tx.bankTransaction.create({
          data: {
            bankAccountId: data.paymentTargetId,
            type: 'WITHDRAWAL',
            amount: cost,
            description: `شراء أصل ثابت: ${data.name.trim()}`,
            transactionDate: pDate
          }
        })
      } else if (data.paymentMethod === 'DEBTOR_CREDIT') {
        // إثبات مديونية الأصل على حساب دائن (استلاف لتمويل الأصل)
        await tx.otherAccount.update({
          where: { id: data.paymentTargetId },
          data: { balance: { increment: cost } }
        })
        await tx.accountTransaction.create({
          data: {
            accountId: data.paymentTargetId,
            type: 'LOAN_IN',
            amount: cost,
            description: `تمويل شراء أصل ثابت: ${data.name.trim()} (كود: ${code})`,
            userId: user.id,
            transactionDate: pDate
          }
        })
      } else if (data.paymentMethod === 'VENDOR_CREDIT') {
        // إثبات قيمة الأصل في كشف حساب المورد (شراء آجل)
        await tx.vendorTransaction.create({
          data: {
            vendorId: data.paymentTargetId,
            type: 'PURCHASE',
            amount: cost,
            reference: code,
            description: `شراء أصل ثابت بالآجل: ${data.name.trim()}`,
            userId: user.id,
            createdAt: pDate
          }
        })
      }

      return newAsset
    })

    revalidatePath('/admin/assets')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, asset, message: `تم تسجيل وشراء الأصل الثابت (${data.name}) بقيمة ${cost.toLocaleString()} ج.م بنجاح` }
  } catch (error: any) {
    console.error('Error creating fixed asset:', error)
    return { success: false, error: error.message || 'فشل تسجيل الأصل' }
  }
}

// 3. تعديل حالة الأصل (تشغيل، صيانة، تخريد، بيع)
export async function updateAssetStatus(assetId: string, status: string, notes?: string) {
  try {
    await checkAccountingAuth()
    await prisma.fixedAsset.update({
      where: { id: assetId },
      data: {
        status,
        ...(notes && { notes })
      }
    })
    revalidatePath('/admin/assets')
    return { success: true, message: 'تم تحديث حالة الأصل' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}