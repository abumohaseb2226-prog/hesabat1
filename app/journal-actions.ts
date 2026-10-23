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
    throw new Error('صلاحية قيود اليومية قاصرة على المحاسبين والإدارة فقط')
  }

  return user
}

// 1. جلب الحسابات والأطراف بما فيها حسابات شجرة الحسابات الفرعية
export async function getJournalPrerequisites() {
  try {
    await checkAccountingAuth()

    const [customers, vendors, safes, banks, employees, otherAccounts, chartAccounts] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true, code: true, phone: true }, take: 1000 }),
      prisma.vendor.findMany({ select: { id: true, name: true, code: true, phone: true }, take: 500 }),
      prisma.safe.findMany({ select: { id: true, name: true } }),
      prisma.bankAccount.findMany({ select: { id: true, bankName: true, accountNumber: true } }),
      prisma.employee.findMany({ select: { id: true, name: true } }),
      prisma.otherAccount.findMany({ select: { id: true, name: true, code: true, type: true } }),
      (prisma as any).chartAccount.findMany({ select: { id: true, name: true, code: true, type: true, category: true }, orderBy: { code: 'asc' } })
    ])

    return {
      success: true,
      data: {
        customers: JSON.parse(JSON.stringify(customers)),
        vendors: JSON.parse(JSON.stringify(vendors)),
        safes: JSON.parse(JSON.stringify(safes)),
        banks: JSON.parse(JSON.stringify(banks)),
        employees: JSON.parse(JSON.stringify(employees)),
        otherAccounts: JSON.parse(JSON.stringify(otherAccounts)),
        chartAccounts: JSON.parse(JSON.stringify(chartAccounts || []))
      }
    }
  } catch (error: any) {
    console.error('Error fetching journal prerequisites:', error)
    return { success: false, error: error.message }
  }
}

export interface JournalLineInput {
  accountType: 'CUSTOMER' | 'VENDOR' | 'SAFE' | 'BANK' | 'EMPLOYEE' | 'OTHER_ACCOUNT' | 'EXPENSE' | 'REVENUE' | 'CHART_ACCOUNT'
  accountId?: string
  accountName: string
  debit: number
  credit: number
  notes?: string
}

// 2. ترحيل وحفظ قيد اليومية وتحديث دفاتر الأستاذ والحسابات الفرعية
export async function postJournalEntry(payload: {
  date: string
  description: string
  reference?: string
  lines: JournalLineInput[]
}) {
  try {
    const user = await checkAccountingAuth()

    if (!payload.description || !payload.description.trim()) {
      return { success: false, error: 'البيان العام للقيد مطلوب' }
    }

    if (!payload.lines || payload.lines.length < 2) {
      return { success: false, error: 'يجب أن يتكون القيد من طرفين على الأقل (مدين ودائن)' }
    }

    const totalDebit = payload.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
    const totalCredit = payload.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return {
        success: false,
        error: `القيد غير متزن محاسبياً! إجمالي المدين (${totalDebit.toFixed(2)}) لا يتساوى مع إجمالي الدائن (${totalCredit.toFixed(2)})`
      }
    }

    if (totalDebit <= 0) {
      return { success: false, error: 'قيمة القيد يجب أن تكون أكبر من الصفر' }
    }

    const entryDate = payload.date ? new Date(payload.date + 'T12:00:00') : new Date()

    await prisma.$transaction(async (tx) => {
      // 1. إنشاء القيد الرئيسي مع بنوده
      const newEntry = await (tx as any).journalEntry.create({
        data: {
          date: entryDate,
          description: payload.description.trim(),
          reference: payload.reference?.trim() || null,
          totalAmount: totalDebit,
          userId: user.id,
          lines: {
            create: payload.lines.map(line => ({
              accountType: line.accountType,
              accountId: line.accountId || null,
              accountName: line.accountName,
              debit: Number(line.debit) || 0,
              credit: Number(line.credit) || 0,
              notes: line.notes?.trim() || null
            }))
          }
        }
      })

      // 2. ترحيل الأثر المالي على الدفاتر
      for (const line of payload.lines) {
        const lineDebit = Number(line.debit) || 0
        const lineCredit = Number(line.credit) || 0
        const lineAmount = lineDebit > 0 ? lineDebit : lineCredit
        if (lineAmount <= 0) continue

        const lineDesc = line.notes?.trim() || payload.description.trim()

        // حساب فرعي في شجرة الحسابات (خصم مسموح به، مصروف مخصص...)
        if (line.accountType === 'CHART_ACCOUNT' && line.accountId) {
          const chartAcc = await (tx as any).chartAccount.findUnique({ where: { id: line.accountId } })
          if (chartAcc) {
            const isDebitAcc = chartAcc.type === 'DEBIT'
            const balChange = isDebitAcc ? (lineDebit - lineCredit) : (lineCredit - lineDebit)
            await (tx as any).chartAccount.update({
              where: { id: line.accountId },
              data: { balance: { increment: balChange } }
            })
          }
        }

        // الخزينة
        if (line.accountType === 'SAFE' && line.accountId) {
          await tx.payment.create({
            data: {
              type: lineDebit > 0 ? 'IN' : 'OUT',
              amount: lineAmount,
              currency: 'EGP',
              safeId: line.accountId,
              description: `قيد #${newEntry.entryNo}: ${lineDesc}`,
              userId: user.id,
              createdAt: entryDate
            }
          })
        }

        // البنك
        if (line.accountType === 'BANK' && line.accountId) {
          const isDeposit = lineDebit > 0
          await tx.bankAccount.update({
            where: { id: line.accountId },
            data: { balance: { increment: isDeposit ? lineAmount : -lineAmount } }
          })
          await tx.bankTransaction.create({
            data: {
              bankAccountId: line.accountId,
              type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
              amount: lineAmount,
              reference: `قيد #${newEntry.entryNo}`,
              description: `قيد يومية: ${lineDesc}`,
              transactionDate: entryDate
            }
          })
        }

        // العميل
        if (line.accountType === 'CUSTOMER' && line.accountId) {
          await tx.payment.create({
            data: {
              type: lineDebit > 0 ? 'OUT' : 'IN',
              amount: lineAmount,
              currency: 'EGP',
              customerId: line.accountId,
              description: `قيد #${newEntry.entryNo}: ${lineDesc}`,
              userId: user.id,
              createdAt: entryDate
            }
          })
        }

        // المورد
        if (line.accountType === 'VENDOR' && line.accountId) {
          await tx.vendorTransaction.create({
            data: {
              vendorId: line.accountId,
              type: lineCredit > 0 ? 'PURCHASE' : 'PAYMENT',
              amount: lineAmount,
              reference: `قيد #${newEntry.entryNo}`,
              description: `قيد يومية: ${lineDesc}`,
              userId: user.id,
              createdAt: entryDate
            }
          })
        }

        // الموظف
        if (line.accountType === 'EMPLOYEE' && line.accountId) {
          await tx.employeeTransaction.create({
            data: {
              employeeId: line.accountId,
              amount: lineDebit > 0 ? -lineAmount : lineAmount,
              description: `قيد #${newEntry.entryNo}: ${lineDesc}`,
              createdById: user.id,
              transactionDate: entryDate
            }
          })
        }

        // الدائنون والمدينون
        if (line.accountType === 'OTHER_ACCOUNT' && line.accountId) {
          const isCredit = lineCredit > 0
          await tx.otherAccount.update({
            where: { id: line.accountId },
            data: { balance: { increment: isCredit ? lineAmount : -lineAmount } }
          })
          await tx.accountTransaction.create({
            data: {
              accountId: line.accountId,
              type: isCredit ? 'LOAN_IN' : 'LOAN_OUT',
              amount: lineAmount,
              description: `قيد #${newEntry.entryNo}: ${lineDesc}`,
              userId: user.id,
              transactionDate: entryDate
            }
          })
        }
      }
    })

    revalidatePath('/admin/journal-entries')
    revalidatePath('/admin/cash-management')
    revalidatePath('/admin/reports')
    revalidatePath('/admin/reports/financial')

    return { success: true, message: `تم ترحيل قيد اليومية بنجاح بإجمالي ${totalDebit.toLocaleString()} ج.م` }
  } catch (error: any) {
    console.error('Error posting journal entry:', error)
    return { success: false, error: error.message || 'فشل حفظ وترحيل قيد اليومية' }
  }
}

// 3. جلب سجل القيود المرحلة بـ Prisma
export async function getJournalEntries(limit = 50) {
  try {
    await checkAccountingAuth()

    const entries = await (prisma as any).journalEntry.findMany({
      take: limit,
      orderBy: { entryNo: 'desc' },
      include: {
        user: { select: { name: true } },
        lines: true
      }
    })

    return {
      success: true,
      entries: entries.map((e: any) => ({
        ...e,
        userName: e.user?.name || 'المحاسب'
      }))
    }
  } catch (error: any) {
    console.error('Error fetching journal entries:', error)
    return { success: false, error: error.message, entries: [] }
  }
}