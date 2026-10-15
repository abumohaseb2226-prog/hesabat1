'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

async function checkAuthorizedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('غير مصرح لك، يرجى تسجيل الدخول')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('صلاحية إدارة الأوراق المالية قاصرة على المحاسب والمدير فقط')
  }

  return user
}

// =========================================================================
// 1. جلب قائمة الأطراف المدمجة (عملاء وموردين معاً مع البحث اللايف)
// =========================================================================
export async function searchParties(query: string = '') {
  try {
    await checkAuthorizedUser()
    const q = query.trim()

    // 1. بحث في العملاء
    const customers = await prisma.customer.findMany({
      where: q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } }
        ]
      } : undefined,
      select: { id: true, name: true, code: true, phone: true },
      take: 20
    })

    // 2. بحث في الموردين
    const vendors = await prisma.vendor.findMany({
      where: q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } }
        ]
      } : undefined,
      select: { id: true, name: true, code: true, phone: true },
      take: 20
    })

    // دمج النتائج مع وضع وسام الطرف (عميل أو مورد)
    const combined = [
      ...customers.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        phone: c.phone,
        partyType: 'CUSTOMER' as const,
        label: `${c.name} (عميل)`
      })),
      ...vendors.map(v => ({
        id: v.id,
        name: v.name,
        code: v.code,
        phone: v.phone,
        partyType: 'VENDOR' as const,
        label: `${v.name} (مورد)`
      }))
    ]

    return { success: true, parties: combined }
  } catch (error: any) {
    console.error('Error searching parties:', error)
    return { success: false, error: error.message }
  }
}

// =========================================================================
// 2. إدارة الحسابات البنكية (إنشاء بنك، جلب البنوك، التسوية)
// =========================================================================
export async function getBankAccounts() {
  try {
    await checkAuthorizedUser()
    const banks = await prisma.bankAccount.findMany({
      include: {
        _count: { select: { checks: true, transactions: true } }
      },
      orderBy: { bankName: 'asc' }
    })
    return { success: true, banks: JSON.parse(JSON.stringify(banks)) }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createBankAccount(data: {
  bankName: string
  accountNumber: string
  branch?: string
  currency?: string
  initialBalance?: number
}) {
  try {
    await checkAuthorizedUser()

    if (!data.bankName || !data.accountNumber) {
      return { success: false, error: 'اسم البنك ورقم الحساب مطلوبان' }
    }

    const initialBal = Number(data.initialBalance) || 0

    const bank = await prisma.bankAccount.create({
      data: {
        bankName: data.bankName.trim(),
        accountNumber: data.accountNumber.trim(),
        branch: data.branch?.trim() || '',
        currency: data.currency || 'EGP',
        balance: initialBal
      }
    })

    // تسجيل رصيد افتتاحي للبنك إن وجد
    if (initialBal > 0) {
      await prisma.bankTransaction.create({
        data: {
          bankAccountId: bank.id,
          type: 'DEPOSIT',
          amount: initialBal,
          description: 'رصيد افتتاحي للحساب البنكي'
        }
      })
    }

    revalidatePath('/admin/financial-papers')
    return { success: true, bank }
  } catch (error: any) {
    return { success: false, error: error.message || 'رقم الحساب مسجل مسبقاً لهذا البنك' }
  }
}

// =========================================================================
// 3. إضافة ورقة مالية (شيك استلام قبض أو إصدار دفع)
// =========================================================================
export async function createCheck(data: {
  checkNo: string
  type: 'RECEIVABLE' | 'PAYABLE'
  amount: number
  currency?: string
  drawnBank: string
  issueDate: string
  dueDate: string
  partyType: 'CUSTOMER' | 'VENDOR'
  partyId: string
  notes?: string
}) {
  try {
    const user = await checkAuthorizedUser()

    if (!data.checkNo || !data.amount || !data.drawnBank || !data.dueDate || !data.partyId) {
      return { success: false, error: 'يرجى استكمال جميع البيانات الأساسية للشيك' }
    }

    const isReceivable = data.type === 'RECEIVABLE'
    const isCustomer = data.partyType === 'CUSTOMER'

    const check = await prisma.$transaction(async (tx) => {
      // 1. تسجيل الشيك
      const newCheck = await tx.check.create({
        data: {
          checkNo: data.checkNo.trim(),
          type: data.type,
          status: 'PORTFOLIO', // بالمحفظة تحت التحصيل
          amount: Number(data.amount),
          currency: data.currency || 'EGP',
          drawnBank: data.drawnBank.trim(),
          issueDate: new Date(data.issueDate),
          dueDate: new Date(data.dueDate),
          partyType: data.partyType,
          customerId: isCustomer ? data.partyId : null,
          vendorId: !isCustomer ? data.partyId : null,
          notes: data.notes || '',
          userId: user.id
        }
      })

      // 2. توثيق حركة الشيك في كشف حساب الطرف (مديونية المورد / العميل)
      if (isCustomer) {
        // شيك استلام من عميل: ينشئ حركة إيصال أمانة / استلام شيك في المدفوعات كـ Pending
        // تُحدث المديونية الفعلية عند التحصيل أو تثبت في كشف حسابه فوراً كشيك تحت التحصيل
      } else {
        // شيك صادر أو مستلم لمورد: نسجل حركة في كشف حساب المورد (VendorTransaction)
        await tx.vendorTransaction.create({
          data: {
            vendorId: data.partyId,
            type: isReceivable ? 'PAYMENT' : 'PAYMENT', // شيك دفع يخصم من مديونية المورد
            amount: Number(data.amount),
            reference: `شيك #${data.checkNo}`,
            description: `${isReceivable ? 'استلام شيك قبض' : 'إصدار شيك دفع'} #${data.checkNo} على بنك ${data.drawnBank} (استحقاق: ${data.dueDate})`,
            userId: user.id,
            createdAt: new Date(data.issueDate)
          }
        })
      }

      return newCheck
    })

    revalidatePath('/admin/financial-papers')
    revalidatePath('/admin/vendors')
    revalidatePath('/admin/reports')

    return {
      success: true,
      check,
      message: `تم بنجاح تسجيل ${isReceivable ? 'ورقة قبض (شيك وارد)' : 'ورقة دفع (شيك صادر)'} برقم #${data.checkNo}`
    }
  } catch (error: any) {
    console.error('Error creating check:', error)
    return { success: false, error: error.message || 'فشل تسجيل الشيك' }
  }
}

// =========================================================================
// 4. تحصيل الشيك والتسوية (إيداع في البنك أو الخزنة)
// =========================================================================
export async function clearAndCollectCheck(payload: {
  checkId: string
  destinationType: 'BANK' | 'SAFE'
  destinationId: string // bankAccountId أو safeId
  collectedDate: string
  notes?: string
}) {
  try {
    const user = await checkAuthorizedUser()

    const check = await prisma.check.findUnique({
      where: { id: payload.checkId },
      include: { customer: true, vendor: true }
    })

    if (!check) return { success: false, error: 'الشيك غير موجود' }
    if (check.status === 'COLLECTED') return { success: false, error: 'تم تحصيل هذا الشيك مسبقاً' }

    const isReceivable = check.type === 'RECEIVABLE'
    const clearedDate = new Date(payload.collectedDate)

    await prisma.$transaction(async (tx) => {
      // 1. تحديث حالة الشيك
      await tx.check.update({
        where: { id: check.id },
        data: {
          status: 'COLLECTED',
          collectedDate: clearedDate,
          collectedBankId: payload.destinationType === 'BANK' ? payload.destinationId : null,
          collectedSafeId: payload.destinationType === 'SAFE' ? payload.destinationId : null,
          notes: payload.notes ? `${check.notes || ''}\n${payload.notes}` : check.notes
        }
      })

      // 2. التسوية البنكية إذا كان التحصيل على بنك
      if (payload.destinationType === 'BANK') {
        const transType = isReceivable ? 'DEPOSIT' : 'WITHDRAWAL'
        const balChange = isReceivable ? check.amount : -check.amount

        await tx.bankAccount.update({
          where: { id: payload.destinationId },
          data: { balance: { increment: balChange } }
        })

        await tx.bankTransaction.create({
          data: {
            bankAccountId: payload.destinationId,
            type: transType,
            amount: check.amount,
            reference: check.checkNo,
            checkId: check.id,
            description: `تحصيل ${isReceivable ? 'شيك قبض' : 'شيك دفع'} #${check.checkNo} - ${check.customer?.name || check.vendor?.name || ''}`,
            transactionDate: clearedDate
          }
        })
      }

      // 3. الإيداع في الخزنة إذا تم التحصيل نقداً في خزنة
      if (payload.destinationType === 'SAFE') {
        const payType = isReceivable ? 'IN' : 'OUT'
        await tx.payment.create({
          data: {
            type: payType,
            amount: check.amount,
            currency: check.currency,
            safeId: payload.destinationId,
            customerId: check.customerId,
            vendorId: check.vendorId,
            userId: user.id,
            checkRefId: check.id,
            description: `تحصيل نقدي لشيك #${check.checkNo} (${check.drawnBank})`,
            createdAt: clearedDate
          }
        })
      }

      // 4. تسوية حساب العميل في حال كان شيك قبض لعميل
      if (check.customerId && isReceivable && payload.destinationType === 'BANK') {
        // تسجيل سداد في كشف حساب العميل
        await tx.payment.create({
          data: {
            type: 'IN',
            amount: check.amount,
            currency: check.currency,
            customerId: check.customerId,
            userId: user.id,
            checkRefId: check.id,
            description: `تحصيل شيك بنكي #${check.checkNo} بحساب البنك`,
            createdAt: clearedDate
          }
        })
      }
    })

    revalidatePath('/admin/financial-papers')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم بنجاح تحصيل الشيك #${check.checkNo} وتسوية الحساب` }
  } catch (error: any) {
    console.error('Error collecting check:', error)
    return { success: false, error: error.message || 'فشل تحصيل الشيك' }
  }
}

// =========================================================================
// 5. رفض الشيك (BOUNCED) وارتداده
// =========================================================================
export async function bounceCheck(checkId: string, reason: string) {
  try {
    const user = await checkAuthorizedUser()

    const check = await prisma.check.findUnique({
      where: { id: checkId },
      include: { vendor: true, customer: true }
    })

    if (!check) return { success: false, error: 'الشيك غير موجود' }

    await prisma.$transaction(async (tx) => {
      // 1. تحديث حالة الشيك إلى مرتد/مرفوض
      await tx.check.update({
        where: { id: check.id },
        data: {
          status: 'BOUNCED',
          bouncedReason: reason || 'عدم كفاية الرصيد / توقيع غير مطابق'
        }
      })

      // 2. عكس أثر المديونية إن كان قد أثر على مورد سابقاً
      if (check.vendorId) {
        await tx.vendorTransaction.create({
          data: {
            vendorId: check.vendorId,
            type: check.type === 'RECEIVABLE' ? 'RETURN' : 'PURCHASE', // عكس الحركة
            amount: check.amount,
            reference: `ارتداد شيك #${check.checkNo}`,
            description: `ارتداد ورفض شيك #${check.checkNo} - السبب: ${reason || 'مرفوض من البنك'}`,
            userId: user.id
          }
        })
      }
    })

    revalidatePath('/admin/financial-papers')
    revalidatePath('/admin/vendors')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم تسجيل رفض وارتداد الشيك #${check.checkNo} وعكس أثره المالي` }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل رفض الشيك' }
  }
}

// =========================================================================
// 6. إلغاء أو حذف الشيك نهائياً
// =========================================================================
export async function deleteCheck(checkId: string) {
  try {
    await checkAuthorizedUser()

    const check = await prisma.check.findUnique({
      where: { id: checkId }
    })

    if (!check) return { success: false, error: 'الشيك غير موجود' }

    if (check.status === 'COLLECTED') {
      return { success: false, error: 'لا يمكن حذف شيك تم تحصيله وتسويته بالبنك، يرجى إلغاء التسوية أولاً' }
    }

    await prisma.$transaction(async (tx) => {
      // حذف الحركات المترتبة
      await tx.vendorTransaction.deleteMany({
        where: { reference: { contains: check.checkNo } }
      })

      await tx.payment.deleteMany({
        where: { checkRefId: check.id }
      })

      await tx.check.delete({
        where: { id: check.id }
      })
    })

    revalidatePath('/admin/financial-papers')
    revalidatePath('/admin/vendors')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم حذف الشيك #${check.checkNo} بنجاح` }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل حذف الشيك' }
  }
}

// =========================================================================
// 7. جلب قائمة الشيكات مع الفلاتر (أوراق قبض، أوراق دفع، الحالة، المواعيد)
// =========================================================================
export async function getChecks(filter?: {
  type?: 'RECEIVABLE' | 'PAYABLE' | 'ALL'
  status?: string
  startDate?: string
  endDate?: string
  search?: string
}) {
  try {
    await checkAuthorizedUser()

    const where: any = {}

    if (filter?.type && filter.type !== 'ALL') {
      where.type = filter.type
    }

    if (filter?.status && filter.status !== 'ALL') {
      where.status = filter.status
    }

    if (filter?.startDate || filter?.endDate) {
      where.dueDate = {}
      if (filter.startDate) where.dueDate.gte = new Date(filter.startDate)
      if (filter.endDate) where.dueDate.lte = new Date(filter.endDate + 'T23:59:59.999')
    }

    if (filter?.search) {
      const q = filter.search.trim()
      where.OR = [
        { checkNo: { contains: q, mode: 'insensitive' } },
        { drawnBank: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { vendor: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const checks = await prisma.check.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vendor: { select: { id: true, name: true, phone: true } },
        collectedBank: { select: { id: true, bankName: true, accountNumber: true } },
        collectedSafe: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      },
      orderBy: { dueDate: 'asc' }
    })

    return { success: true, checks: JSON.parse(JSON.stringify(checks)) }
  } catch (error: any) {
    console.error('Error fetching checks:', error)
    return { success: false, error: error.message }
  }
}