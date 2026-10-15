'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { revalidatePath } from 'next/cache'

// فحص أمني صارم: قصر الصلاحية على المحاسب والمدير فقط
async function checkAccountingAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.image) {
    throw new Error('يرجى تسجيل الدخول أولاً')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string }
  })

  if (!user || !['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(user.role)) {
    throw new Error('عفواً: هذه العمليات المالية والمحاسبية خاصة بالإدارة والمحاسبين فقط')
  }

  return user
}

// 1. جلب جميع حسابات الدائنين والمدينين والشركاء
export async function getOtherAccounts() {
  try {
    await checkAccountingAuth()
    const accounts = await prisma.otherAccount.findMany({
      include: {
        _count: { select: { transactions: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return { success: true, accounts: JSON.parse(JSON.stringify(accounts)) }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 2. إنشاء حساب دائن / مدين / شريك جديد
export async function createOtherAccount(data: {
  name: string
  code?: string
  phone?: string
  type: 'CREDITOR' | 'DEBTOR' | 'PARTNER'
  initialBalance?: number
  notes?: string
}) {
  try {
    const user = await checkAccountingAuth()

    if (!data.name.trim()) {
      return { success: false, error: 'اسم الحساب مطلوب' }
    }

    let code = data.code?.trim()
    if (!code) {
      const prefix = data.type === 'CREDITOR' ? 'CRD' : data.type === 'DEBTOR' ? 'DBT' : 'PRT'
      code = `${prefix}-${Date.now().toString().slice(-5)}`
    }

    const initBal = Number(data.initialBalance) || 0

    const account = await prisma.$transaction(async (tx) => {
      const acc = await tx.otherAccount.create({
        data: {
          name: data.name.trim(),
          code,
          phone: data.phone?.trim() || '',
          type: data.type,
          notes: data.notes || '',
          balance: initBal
        }
      })

      if (initBal !== 0) {
        await tx.accountTransaction.create({
          data: {
            accountId: acc.id,
            type: 'ADJUSTMENT',
            amount: Math.abs(initBal),
            description: 'رصيد افتتاحي لبداية التعامل',
            userId: user.id
          }
        })
      }

      return acc
    })

    revalidatePath('/admin/debtors-creditors')
    return { success: true, account }
  } catch (error: any) {
    return { success: false, error: error.message || 'الكود مسجل مسبقاً' }
  }
}

// 3. استلام سلفة / قرض (دخول نقدية للخزنة أو البنك وزيادة مديونية الدائن)
export async function recordLoanReceipt(payload: {
  accountId: string
  amount: number
  destination: 'SAFE' | 'BANK'
  destinationId: string
  description?: string
  date?: string
}) {
  try {
    const user = await checkAccountingAuth()
    const amt = Number(payload.amount) || 0
    if (amt <= 0) return { success: false, error: 'المبلغ يجب أن يكون أكبر من الصفر' }

    const account = await prisma.otherAccount.findUnique({ where: { id: payload.accountId } })
    if (!account) return { success: false, error: 'الحساب غير موجود' }

    const transDate = payload.date ? new Date(payload.date) : new Date()

    await prisma.$transaction(async (tx) => {
      // أ. زيادة مديونية الحساب (له علينا)
      await tx.otherAccount.update({
        where: { id: account.id },
        data: { balance: { increment: amt } }
      })

      // ب. تسجيل حركة القرض
      await tx.accountTransaction.create({
        data: {
          accountId: account.id,
          type: 'LOAN_IN',
          amount: amt,
          description: payload.description || `استلام قرض/سلفة من: ${account.name}`,
          safeId: payload.destination === 'SAFE' ? payload.destinationId : null,
          bankAccountId: payload.destination === 'BANK' ? payload.destinationId : null,
          userId: user.id,
          transactionDate: transDate
        }
      })

      // ج. إيداع النقدية في الخزنة أو البنك
      if (payload.destination === 'SAFE') {
        await tx.payment.create({
          data: {
            type: 'IN',
            amount: amt,
            currency: 'EGP',
            safeId: payload.destinationId,
            userId: user.id,
            description: `استلام سلفة/قرض من: ${account.name} ${payload.description ? `(${payload.description})` : ''}`,
            createdAt: transDate
          }
        })
      } else {
        await tx.bankAccount.update({
          where: { id: payload.destinationId },
          data: { balance: { increment: amt } }
        })
        await tx.bankTransaction.create({
          data: {
            bankAccountId: payload.destinationId,
            type: 'DEPOSIT',
            amount: amt,
            description: `إيداع سلفة/قرض من: ${account.name}`,
            transactionDate: transDate
          }
        })
      }
    })

    revalidatePath('/admin/debtors-creditors')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم استلام وإيداع مبلغ ${amt.toLocaleString()} ج.م وتثبيت المديونية لحساب ${account.name}` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 4. سداد سلفة / قرض (خروج نقدية وسداد للدائن)
export async function recordLoanRepayment(payload: {
  accountId: string
  amount: number
  source: 'SAFE' | 'BANK'
  sourceId: string
  description?: string
  date?: string
}) {
  try {
    const user = await checkAccountingAuth()
    const amt = Number(payload.amount) || 0
    if (amt <= 0) return { success: false, error: 'المبلغ يجب أن يكون أكبر من الصفر' }

    const account = await prisma.otherAccount.findUnique({ where: { id: payload.accountId } })
    if (!account) return { success: false, error: 'الحساب غير موجود' }

    const transDate = payload.date ? new Date(payload.date) : new Date()

    await prisma.$transaction(async (tx) => {
      // أ. تخفيض مديونية الحساب
      await tx.otherAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: amt } }
      })

      // ب. تسجيل حركة السداد
      await tx.accountTransaction.create({
        data: {
          accountId: account.id,
          type: 'LOAN_OUT',
          amount: amt,
          description: payload.description || `سداد سلفة/قرض لحساب: ${account.name}`,
          safeId: payload.source === 'SAFE' ? payload.sourceId : null,
          bankAccountId: payload.source === 'BANK' ? payload.sourceId : null,
          userId: user.id,
          transactionDate: transDate
        }
      })

      // ج. إخراج النقدية من الخزنة أو البنك
      if (payload.source === 'SAFE') {
        await tx.payment.create({
          data: {
            type: 'OUT',
            amount: amt,
            currency: 'EGP',
            safeId: payload.sourceId,
            userId: user.id,
            description: `رد سداد سلفة/قرض لـ: ${account.name}`,
            createdAt: transDate
          }
        })
      } else {
        await tx.bankAccount.update({
          where: { id: payload.sourceId },
          data: { balance: { decrement: amt } }
        })
        await tx.bankTransaction.create({
          data: {
            bankAccountId: payload.sourceId,
            type: 'WITHDRAWAL',
            amount: amt,
            description: `سداد سلفة/قرض بنكياً لـ: ${account.name}`,
            transactionDate: transDate
          }
        })
      }
    })

    revalidatePath('/admin/debtors-creditors')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')

    return { success: true, message: `تم سداد مبلغ ${amt.toLocaleString()} ج.م وتخفيض رصيد حساب ${account.name}` }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 5. العملية الخاصة: سداد مورد مباشرة من السلفة دون المرور بالخزنة!
export async function recordDirectVendorSettlement(payload: {
  accountId: string // الحساب المقرض (الدائن)
  vendorId: string  // المورد المستفيد
  amount: number
  notes?: string
  date?: string
}) {
  try {
    const user = await checkAccountingAuth()
    const amt = Number(payload.amount) || 0
    if (amt <= 0) return { success: false, error: 'المبلغ غير صالح' }

    const account = await prisma.otherAccount.findUnique({ where: { id: payload.accountId } })
    const vendor = await prisma.vendor.findUnique({ where: { id: payload.vendorId } })

    if (!account || !vendor) return { success: false, error: 'الحساب الدائن أو المورد غير موجود' }

    const transDate = payload.date ? new Date(payload.date) : new Date()

    await prisma.$transaction(async (tx) => {
      // أ. زيادة مديونية الدائن (له علينا) لأنه دفع الفلوس للمورد نيابة عنا
      await tx.otherAccount.update({
        where: { id: account.id },
        data: { balance: { increment: amt } }
      })

      // ب. تسجيل حركة السداد المباشر في كشف الدائن
      await tx.accountTransaction.create({
        data: {
          accountId: account.id,
          type: 'DIRECT_VENDOR_SETTLEMENT',
          amount: amt,
          vendorId: vendor.id,
          description: `سداد مباشر للمورد (${vendor.name}) نيابة عنا ${payload.notes ? `(${payload.notes})` : ''}`,
          userId: user.id,
          transactionDate: transDate
        }
      })

      // ج. تخفيض مديونية المورد فورياً في كشف حسابه المالي (VendorTransaction)
      await tx.vendorTransaction.create({
        data: {
          vendorId: vendor.id,
          type: 'PAYMENT',
          amount: amt,
          reference: `سداد مباشر طرف: ${account.name}`,
          description: `سداد مديونية مسددة مباشرة من طرف الدائن: ${account.name}`,
          userId: user.id,
          createdAt: transDate
        }
      })
    })

    revalidatePath('/admin/debtors-creditors')
    revalidatePath('/admin/vendors')
    revalidatePath(`/admin/vendors/${vendor.id}`)
    revalidatePath('/admin/reports')

    return {
      success: true,
      message: `تم بنجاح تخفيض مديونية المورد (${vendor.name}) بقيمة ${amt.toLocaleString()} ج.م وتثبيتها كمديونية لحساب (${account.name})`
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 6. جلب كشف حساب دائن / مدين تفصيلي
export async function getOtherAccountLedger(accountId: string) {
  try {
    await checkAccountingAuth()

    const account = await prisma.otherAccount.findUnique({
      where: { id: accountId },
      include: {
        transactions: {
          include: {
            safe: true,
            bankAccount: true,
            vendor: true,
            user: { select: { id: true, name: true } }
          },
          orderBy: { transactionDate: 'asc' }
        }
      }
    })

    if (!account) return { success: false, error: 'الحساب غير موجود' }

    let runningBalance = 0
    const ledger = account.transactions.map(t => {
      let debit = 0
      let credit = 0

      if (t.type === 'LOAN_IN' || t.type === 'DIRECT_VENDOR_SETTLEMENT') {
        credit = t.amount // له علينا
        runningBalance += t.amount
      } else if (t.type === 'LOAN_OUT') {
        debit = t.amount  // سددنا له
        runningBalance -= t.amount
      } else if (t.type === 'ADJUSTMENT') {
        credit = t.amount
        runningBalance += t.amount
      }

      return {
        id: t.id,
        date: t.transactionDate,
        type: t.type,
        description: t.description,
        debit,
        credit,
        balance: runningBalance,
        safeName: t.safe?.name,
        bankName: t.bankAccount?.bankName,
        vendorName: t.vendor?.name,
        userName: t.user.name
      }
    })

    return {
      success: true,
      account: { ...account, balance: runningBalance },
      ledger
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}