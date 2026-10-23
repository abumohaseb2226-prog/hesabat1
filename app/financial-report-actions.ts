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
    throw new Error('التقارير المحاسبية والقوائم المالية قاصرة على المحاسبين والإدارة فقط')
  }

  return user
}

// =========================================================================
// 1. تقرير قائمة الدخل والأرباح والخسائر (Income Statement / P&L)
// =========================================================================
export async function getIncomeStatement(startDateStr?: string, endDateStr?: string) {
  try {
    await checkAccountingAuth()

    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const today = now.toISOString().split('T')[0]

    const startStr = startDateStr || firstDay
    const endStr = endDateStr || today

    const startDate = new Date(startStr + 'T00:00:00')
    const endDate = new Date(endStr + 'T23:59:59.999')

    // أ. المبيعات وبنود الفواتير في الفترة
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        items: {
          include: {
            product: { select: { id: true, modelNo: true, color: true, cost: true, price: true } }
          }
        }
      }
    })

    // ب. مرتجعات المبيعات في الفترة
    const returns = await prisma.returnOrder.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
      include: {
        items: {
          include: { product: { select: { id: true, modelNo: true, color: true, cost: true } } }
        }
      }
    })

    // ج. جلب استقطاعات الخصم المسموح به والمصروفات من شجرة الحسابات وقيود اليومية
    const chartAccounts = await (prisma as any).chartAccount.findMany().catch(() => [])
    const chartMap = new Map<string, any>()
    chartAccounts.forEach((ca: any) => chartMap.set(ca.id, ca))

    let totalDiscountsAllowed = 0
    let totalDiscountsReceived = 0
    let journalExpenses = 0

    // قراءة قيود اليومية المسجلة خلال الفترة
    const journalLines = await (prisma as any).journalEntryLine.findMany({
      where: {
        entry: { date: { gte: startDate, lte: endDate } }
      },
      include: {
        entry: { select: { date: true, description: true } }
      }
    }).catch(() => [])

    journalLines.forEach((jl: any) => {
      const ca = jl.accountId ? chartMap.get(jl.accountId) : null
      const accName = (jl.accountName || '').toLowerCase()
      const notes = (jl.notes || '').toLowerCase()
      const entryDesc = (jl.entry?.description || '').toLowerCase()

      const isDiscountAllowed =
        (ca && (ca.parentCode === '42' || ca.code.startsWith('42') || ca.name.includes('مسموح'))) ||
        accName.includes('مسموح') ||
        notes.includes('مسموح') ||
        entryDesc.includes('خصم مسموح')

      const isDiscountReceived =
        (ca && (ca.name.includes('مكتسب') || ca.parentCode === '4' || ca.code.startsWith('43'))) ||
        accName.includes('مكتسب') ||
        notes.includes('مكتسب') ||
        entryDesc.includes('خصم مكتسب')

      const isCustomExpense =
        (ca && (ca.category === 'EXPENSE' || ca.parentCode === '52' || ca.code.startsWith('52'))) ||
        jl.accountType === 'EXPENSE'

      if (isDiscountAllowed) {
        totalDiscountsAllowed += (jl.debit - jl.credit)
      } else if (isDiscountReceived) {
        totalDiscountsReceived += (jl.credit - jl.debit)
      } else if (isCustomExpense) {
        journalExpenses += (jl.debit - jl.credit)
      }
    })

    // إذا لم تكن هناك قيود خلال الفترة ولكن الحساب المخصص للخصم له رصيد في الشجرة
    if (totalDiscountsAllowed === 0) {
      chartAccounts.forEach((ca: any) => {
        if (ca.parentCode === '42' || ca.name.includes('مسموح')) {
          totalDiscountsAllowed += (ca.balance || 0)
        }
      })
    }

    // د. المصروفات العامة والتشغيلية من الخزنة
    const operatingExpenses = await prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        type: 'OUT',
        vendorId: null,
        customerId: null,
        checkRefId: null,
        NOT: [
          { description: { contains: 'أصل ثابت' } },
          { description: { contains: 'شراء أصل' } },
          { description: { contains: 'سلفة/قرض' } },
          { description: { contains: 'سداد سلفة' } },
          { description: { contains: 'رد سداد' } },
          { description: { contains: 'للعميل' } },
          { description: { contains: 'للمورد' } }
        ]
      }
    })

    // هـ. رواتب ومسحوبات الموظفين
    const employeeExpenses = await prisma.employeeTransaction.findMany({
      where: {
        transactionDate: { gte: startDate, lte: endDate },
        amount: { gt: 0 }
      }
    })

    // 1. حساب المبيعات وتكلفتها
    let grossSalesRevenue = 0
    let grossCOGS = 0
    let totalPiecesSold = 0

    const productProfitMap = new Map<string, {
      modelNo: string
      color: string
      quantitySold: number
      revenue: number
      totalCost: number
      grossProfit: number
    }>()

    orders.forEach(ord => {
      grossSalesRevenue += ord.totalAmount
      ord.items.forEach(it => {
        const qty = it.quantity || 0
        const revenue = (it.price || 0) * qty
        const cost = (it.product?.cost || 0) * qty

        totalPiecesSold += qty
        grossCOGS += cost

        const key = `${it.product?.modelNo || 'عام'}_${it.product?.color || 'افتراضي'}`
        if (!productProfitMap.has(key)) {
          productProfitMap.set(key, {
            modelNo: it.product?.modelNo || 'صنف',
            color: it.product?.color || '-',
            quantitySold: 0,
            revenue: 0,
            totalCost: 0,
            grossProfit: 0
          })
        }

        const pStat = productProfitMap.get(key)!
        pStat.quantitySold += qty
        pStat.revenue += revenue
        pStat.totalCost += cost
        pStat.grossProfit += (revenue - cost)
      })
    })

    // 2. حساب المرتجعات
    let totalReturnsRevenue = 0
    let totalReturnsCost = 0
    let totalPiecesReturned = 0

    returns.forEach(ret => {
      totalReturnsRevenue += ret.totalRefund
      ret.items.forEach(ri => {
        const qty = ri.quantity || 0
        const cost = (ri.product?.cost || 0) * qty
        totalPiecesReturned += qty
        totalReturnsCost += cost
      })
    })

    // ✅ صافي إيراد المبيعات بعد خصم المرتجعات والخصم المسموح به
    const netSalesRevenue = grossSalesRevenue - totalReturnsRevenue - totalDiscountsAllowed
    const netCOGS = grossCOGS - totalReturnsCost - totalDiscountsReceived
    const grossProfit = netSalesRevenue - netCOGS
    const grossProfitMargin = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0

    const cashOperatingExpenses = operatingExpenses.reduce((s, p) => s + p.amount, 0)
    const totalOperatingExpenses = cashOperatingExpenses + Math.max(0, journalExpenses)
    const totalSalariesExpenses = employeeExpenses.reduce((s, e) => s + e.amount, 0)
    const totalExpenses = totalOperatingExpenses + totalSalariesExpenses

    const netProfit = grossProfit - totalExpenses
    const netProfitMargin = netSalesRevenue > 0 ? (netProfit / netSalesRevenue) * 100 : 0

    const productsAnalysis = Array.from(productProfitMap.values())
      .sort((a, b) => b.grossProfit - a.grossProfit)

    return {
      success: true,
      data: {
        dateRange: { start: startStr, end: endStr },
        sales: {
          grossSalesRevenue,
          totalReturnsRevenue,
          totalDiscountsAllowed, // ✅ قيمة الخصم المسموح به
          netSalesRevenue,
          totalPiecesSold,
          totalPiecesReturned,
          netPiecesSold: totalPiecesSold - totalPiecesReturned,
          ordersCount: orders.length
        },
        cogs: { grossCOGS, totalReturnsCost, totalDiscountsReceived, netCOGS },
        profitability: {
          grossProfit,
          grossProfitMargin,
          totalOperatingExpenses,
          totalSalariesExpenses,
          totalExpenses,
          netProfit,
          netProfitMargin
        },
        operatingExpensesList: operatingExpenses.map(p => ({
          id: p.id,
          amount: p.amount,
          description: p.description || 'مصروفات متنوعة',
          date: p.createdAt
        })),
        productsAnalysis
      }
    }
  } catch (error: any) {
    console.error('Error generating income statement:', error)
    return { success: false, error: error.message || 'فشل توليد قائمة الدخل' }
  }
}

// =========================================================================
// 2. تقرير قائمة المركز المالي والميزانية العمومية (Balance Sheet)
// =========================================================================
export async function getBalanceSheet() {
  try {
    await checkAccountingAuth()

    const safes = await prisma.safe.findMany({
      include: { payments: true, incomingTransfers: true }
    })

    const safesBalances = safes.map(s => {
      let balance = 0
      s.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') balance += p.amount
        else if (p.type === 'OUT') balance -= p.amount
        else if (p.type === 'TRANSFER') balance -= p.amount
      })
      s.incomingTransfers.forEach(p => { balance += p.amount })
      return { id: s.id, name: s.name, balance }
    })
    const totalCashInSafes = safesBalances.reduce((sum, s) => sum + s.balance, 0)

    const banks = await prisma.bankAccount.findMany()
    const totalBankBalances = banks.reduce((sum, b) => sum + (Number(b.balance) || 0), 0)

    const customers = await prisma.customer.findMany({
      include: {
        orders: {
          select: {
            id: true,
            totalAmount: true,
            originalReturns: {
              where: { status: { not: 'CANCELLED' } },
              select: { totalRefund: true }
            }
          }
        },
        payments: { select: { amount: true, type: true } }
      }
    })

    let totalCustomerDebtors = 0
    let totalCustomerCreditors = 0

    customers.forEach(c => {
      const ordersTotal = c.orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
      let returnsTotal = 0
      c.orders.forEach(o => {
        o.originalReturns.forEach(r => { returnsTotal += (r.totalRefund || 0) })
      })

      let paymentsIn = 0
      let paymentsOut = 0
      c.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') paymentsIn += (p.amount || 0)
        else if (p.type === 'OUT') paymentsOut += (p.amount || 0)
      })

      const bal = ordersTotal - returnsTotal - paymentsIn + paymentsOut
      if (bal > 0) totalCustomerDebtors += bal
      else if (bal < 0) totalCustomerCreditors += Math.abs(bal)
    })

    totalCustomerDebtors = Math.round(totalCustomerDebtors * 100) / 100
    totalCustomerCreditors = Math.round(totalCustomerCreditors * 100) / 100
    const netCustomerReceivables = Math.round((totalCustomerDebtors - totalCustomerCreditors) * 100) / 100

    const products = await prisma.product.findMany({
      select: { currentStock: true, cost: true, price: true }
    })
    const totalInventoryValueAtCost = products.reduce((sum, p) => sum + (p.currentStock * p.cost), 0)
    const totalInventoryValueAtPrice = products.reduce((sum, p) => sum + (p.currentStock * p.price), 0)

    const otherAccounts = await prisma.otherAccount.findMany()
    const totalDebtorsReceivables = otherAccounts
      .filter(a => a.type === 'DEBTOR' || a.balance < 0)
      .reduce((sum, a) => sum + Math.abs(a.balance), 0)

    const fixedAssets = await prisma.fixedAsset.findMany({ where: { status: 'ACTIVE' } })
    const totalFixedAssetsValue = fixedAssets.reduce((sum, a) => sum + a.currentValue, 0)

    const vendors = await prisma.vendor.findMany({
      include: {
        products: { select: { stockQty: true, cost: true } },
        transactions: { select: { type: true, amount: true, reference: true, description: true } },
        payments: { where: { type: 'OUT' }, select: { amount: true, checkRefId: true, description: true } },
        checks: { where: { type: 'PAYABLE', status: { not: 'CANCELLED' } }, select: { amount: true, checkNo: true } }
      }
    })

    const allProductsWithName = await prisma.product.findMany({
      where: { vendorId: null, vendor: { not: null } },
      select: { vendor: true, stockQty: true, cost: true }
    })

    const unlinkedProductsByVendorName = new Map<string, number>()
    allProductsWithName.forEach(p => {
      if (p.vendor) {
        const amt = (p.stockQty || 0) * (p.cost || 0)
        unlinkedProductsByVendorName.set(p.vendor.trim(), (unlinkedProductsByVendorName.get(p.vendor.trim()) || 0) + amt)
      }
    })

    let totalVendorPayables = 0
    let totalVendorDebtors = 0

    vendors.forEach(vendor => {
      let initialStockTotal = vendor.products.reduce((s, p) => s + ((p.stockQty || 0) * (p.cost || 0)), 0)
      if (unlinkedProductsByVendorName.has(vendor.name.trim())) {
        initialStockTotal += unlinkedProductsByVendorName.get(vendor.name.trim())!
      }

      const groupedTrans = new Map<string, { type: string, amount: number, description?: string | null }>()
      vendor.transactions.forEach(t => {
        const refKey = t.reference ? `${t.type}_${t.reference}` : `single_${Math.random()}`
        if (groupedTrans.has(refKey)) groupedTrans.get(refKey)!.amount += t.amount
        else groupedTrans.set(refKey, { type: t.type, amount: t.amount, description: t.description })
      })

      let purchasesTotal = 0
      let returnsTotal = 0
      let transactionPayments = 0
      let refundsInTotal = 0

      groupedTrans.forEach((t, refKey) => {
        const isCashRefund = t.type === 'REFUND_IN' || 
                             t.type === 'RECEIPT' || 
                             refKey.includes('استرداد') || 
                             (t.description && t.description.includes('استرداد نقدي'));

        if (isCashRefund) refundsInTotal += t.amount
        else if (t.type === 'PURCHASE') purchasesTotal += t.amount
        else if (t.type === 'RETURN') returnsTotal += t.amount
        else if (t.type === 'PAYMENT' || t.type.includes('CHECK')) transactionPayments += t.amount
      })

      let cashPaymentsTotal = 0
      vendor.payments.forEach(p => {
        if (p.checkRefId || (p.description && p.description.includes('شيك #'))) return
        cashPaymentsTotal += p.amount
      })

      let additionalChecksTotal = 0
      const existingRefs = new Set(Array.from(groupedTrans.keys()))
      vendor.checks.forEach(chk => {
        const refKey = `PAYMENT_شيك #${chk.checkNo}`
        if (!existingRefs.has(refKey) && !existingRefs.has(`single_شيك #${chk.checkNo}`)) {
          additionalChecksTotal += chk.amount
        }
      })

      const totalCredits = initialStockTotal + purchasesTotal + refundsInTotal
      const totalDebits = returnsTotal + transactionPayments + cashPaymentsTotal + additionalChecksTotal
      const bal = Math.round((totalCredits - totalDebits) * 100) / 100

      if (bal > 0) totalVendorPayables += bal
      else if (bal < 0) totalVendorDebtors += Math.abs(bal)
    })

    totalVendorPayables = Math.round(totalVendorPayables * 100) / 100
    totalVendorDebtors = Math.round(totalVendorDebtors * 100) / 100
    const netVendorPayables = Math.round((totalVendorPayables - totalVendorDebtors) * 100) / 100

    const pendingPayableChecks = await prisma.check.findMany({
      where: { type: 'PAYABLE', status: 'PORTFOLIO' }
    })
    const totalChecksPayable = pendingPayableChecks.reduce((sum, c) => sum + c.amount, 0)

    const totalCreditorsLiability = otherAccounts
      .filter(a => a.type === 'CREDITOR' && a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0)

    const totalCustomerCreditLiabilities = totalCustomerCreditors

    const totalLiabilities = totalVendorPayables + totalChecksPayable + totalCreditorsLiability + totalCustomerCreditLiabilities
    const totalCurrentAssets = totalCashInSafes + totalBankBalances + totalCustomerDebtors + totalInventoryValueAtCost + totalDebtorsReceivables + totalVendorDebtors
    const totalAssets = totalCurrentAssets + totalFixedAssetsValue

    const totalPartnersCapital = otherAccounts
      .filter(a => a.type === 'PARTNER')
      .reduce((sum, a) => sum + a.balance, 0)

    const retainedEarnings = totalAssets - totalLiabilities - totalPartnersCapital
    const totalEquity = totalPartnersCapital + retainedEarnings

    return {
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        assets: {
          cashInSafes: totalCashInSafes,
          bankBalances: totalBankBalances,
          receivables: totalCustomerDebtors,
          netReceivables: netCustomerReceivables,
          customerCredits: totalCustomerCreditors,
          inventoryAtCost: totalInventoryValueAtCost,
          inventoryAtPrice: totalInventoryValueAtPrice,
          debtorsReceivables: totalDebtorsReceivables,
          vendorDebtors: totalVendorDebtors,
          totalCurrentAssets,
          fixedAssets: totalFixedAssetsValue,
          totalAssets
        },
        liabilities: {
          vendorPayables: totalVendorPayables,
          netVendorPayables: netVendorPayables,
          checksPayable: totalChecksPayable,
          creditorsLiability: totalCreditorsLiability,
          customerCredits: totalCustomerCreditLiabilities,
          totalLiabilities
        },
        equity: {
          partnersCapital: totalPartnersCapital,
          retainedEarnings,
          totalEquity,
          totalLiabilitiesAndEquity: totalLiabilities + totalEquity
        },
        breakdowns: {
          safes: safesBalances,
          banks: banks.map(b => ({ name: b.bankName, balance: b.balance, currency: b.currency })),
          fixedAssetsCount: fixedAssets.length
        }
      }
    }
  } catch (error: any) {
    console.error('Error generating balance sheet:', error)
    return { success: false, error: error.message || 'فشل توليد قائمة المركز المالي' }
  }
}

// =========================================================================
// 3. تقرير قائمة التدفقات النقدية (Cash Flow Statement)
// =========================================================================
export async function getCashFlowStatement(startDateStr?: string, endDateStr?: string) {
  try {
    await checkAccountingAuth()

    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const today = now.toISOString().split('T')[0]

    const startStr = startDateStr || firstDay
    const endStr = endDateStr || today

    const startDate = new Date(startStr + 'T00:00:00')
    const endDate = new Date(endStr + 'T23:59:59.999')

    const periodPayments = await prisma.payment.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { customer: true, vendor: true }
    })

    const periodBankTransactions = await prisma.bankTransaction.findMany({
      where: { transactionDate: { gte: startDate, lte: endDate } }
    })

    const periodAccountTransactions = await prisma.accountTransaction.findMany({
      where: { transactionDate: { gte: startDate, lte: endDate } },
      include: { account: true }
    })

    const periodAssetsPurchased = await prisma.fixedAsset.findMany({
      where: {
        purchaseDate: { gte: startDate, lte: endDate },
        paymentMethod: { in: ['CASH_SAFE', 'BANK'] }
      }
    })

    let cashFromCustomers = 0
    let cashPaidToCustomers = 0
    let cashPaidToVendors = 0
    let cashRefundFromVendors = 0
    let operatingExpensesPaid = 0
    let salariesPaid = 0

    periodPayments.forEach(p => {
      if (p.customerId) {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') cashFromCustomers += p.amount
        else if (p.type === 'OUT') cashPaidToCustomers += p.amount
        return
      }

      if (p.vendorId) {
        if (p.type === 'OUT') cashPaidToVendors += p.amount
        else if (p.type === 'IN') cashRefundFromVendors += p.amount
        return
      }

      if (p.type === 'OUT' && (p.description?.includes('راتب') || p.description?.includes('سلفة') || p.description?.includes('موظف'))) {
        salariesPaid += p.amount
        return
      }

      if (p.description?.includes('أصل ثابت') || p.description?.includes('شراء أصل') || p.description?.includes('سلفة/قرض') || p.description?.includes('رد سداد')) {
        return
      }

      if (p.type === 'OUT') {
        operatingExpensesPaid += p.amount
      }
    })

    periodBankTransactions.forEach(bt => {
      if (bt.type === 'DEPOSIT' && bt.checkId) {
        cashFromCustomers += bt.amount
      } else if (bt.type === 'WITHDRAWAL' && bt.checkId) {
        cashPaidToVendors += bt.amount
      }
    })

    const netOperatingCashFlow = (cashFromCustomers + cashRefundFromVendors) - (cashPaidToCustomers + cashPaidToVendors + operatingExpensesPaid + salariesPaid)
    const cashPaidForFixedAssets = periodAssetsPurchased.reduce((sum, a) => sum + (a.purchaseCost || 0), 0)
    const netInvestingCashFlow = -cashPaidForFixedAssets

    let loansReceived = 0
    let loansRepaid = 0
    let partnersCapitalIn = 0
    let partnersDrawings = 0

    periodAccountTransactions.forEach(at => {
      if (!at.safeId && !at.bankAccountId) return

      if (at.account.type === 'PARTNER') {
        if (at.type === 'LOAN_IN' || at.type === 'ADJUSTMENT') partnersCapitalIn += at.amount
        else if (at.type === 'LOAN_OUT') partnersDrawings += at.amount
      } else {
        if (at.type === 'LOAN_IN') loansReceived += at.amount
        else if (at.type === 'LOAN_OUT') loansRepaid += at.amount
      }
    })

    const netFinancingCashFlow = (loansReceived + partnersCapitalIn) - (loansRepaid + partnersDrawings)
    const netCashChange = netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow

    const allSafes = await prisma.safe.findMany({
      include: { payments: true, incomingTransfers: true }
    })
    let currentClosingCash = 0
    allSafes.forEach(s => {
      s.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') currentClosingCash += p.amount
        else if (p.type === 'OUT' || p.type === 'TRANSFER') currentClosingCash -= p.amount
      })
      s.incomingTransfers.forEach(p => { currentClosingCash += p.amount })
    })

    const allBanks = await prisma.bankAccount.findMany()
    const currentClosingBank = allBanks.reduce((s, b) => s + (Number(b.balance) || 0), 0)
    const totalClosingLiquidity = currentClosingCash + currentClosingBank
    const openingLiquidity = totalClosingLiquidity - netCashChange

    return {
      success: true,
      data: {
        dateRange: { start: startStr, end: endStr },
        operating: {
          cashFromCustomers,
          cashRefundFromVendors,
          totalInflows: cashFromCustomers + cashRefundFromVendors,
          cashPaidToCustomers,
          cashPaidToVendors,
          operatingExpensesPaid,
          salariesPaid,
          totalOutflows: cashPaidToCustomers + cashPaidToVendors + operatingExpensesPaid + salariesPaid,
          netOperatingCashFlow
        },
        investing: {
          cashPaidForFixedAssets,
          netInvestingCashFlow
        },
        financing: {
          loansReceived,
          loansRepaid,
          partnersCapitalIn,
          partnersDrawings,
          netFinancingCashFlow
        },
        summary: {
          netCashChange,
          openingLiquidity,
          totalClosingLiquidity,
          currentClosingCash,
          currentClosingBank
        }
      }
    }
  } catch (error: any) {
    console.error('Error generating cash flow statement:', error)
    return { success: false, error: error.message || 'فشل توليد قائمة التدفقات النقدية' }
  }
}

// =========================================================================
// 4. إنشاء وحذف الحسابات الفرعية في شجرة الحسابات
// =========================================================================
export async function createChartAccount(payload: {
  name: string
  parentCode: string
  code?: string
  type?: 'DEBIT' | 'CREDIT'
  initialBalance?: number
  description?: string
}) {
  try {
    await checkAccountingAuth()

    if (!payload.name?.trim() || !payload.parentCode) {
      return { success: false, error: 'اسم الحساب الفرعي والمجموعة التابع لها مطلوبان' }
    }

    const parentCode = payload.parentCode.trim()

    let category = 'EXPENSE'
    let accountType = payload.type || 'DEBIT'

    if (parentCode.startsWith('1')) {
      category = 'ASSET'
      accountType = 'DEBIT'
    } else if (parentCode.startsWith('2')) {
      category = 'LIABILITY'
      accountType = 'CREDIT'
    } else if (parentCode.startsWith('3')) {
      category = 'EQUITY'
      accountType = 'CREDIT'
    } else if (parentCode.startsWith('4')) {
      category = 'REVENUE'
      accountType = parentCode === '42' ? 'DEBIT' : 'CREDIT'
    } else if (parentCode.startsWith('5')) {
      category = 'EXPENSE'
      accountType = 'DEBIT'
    }

    let code = payload.code?.trim()
    if (!code) {
      const existingInParent = await (prisma as any).chartAccount.findMany({
        where: { parentCode },
        orderBy: { code: 'desc' }
      })

      if (existingInParent.length > 0) {
        const lastCode = existingInParent[0].code
        const numPart = parseInt(lastCode.slice(parentCode.length), 10)
        code = `${parentCode}${String((isNaN(numPart) ? 0 : numPart) + 1).padStart(2, '0')}`
      } else {
        code = `${parentCode}01`
      }
    }

    const initBal = Number(payload.initialBalance) || 0

    const account = await (prisma as any).chartAccount.create({
      data: {
        code,
        name: payload.name.trim(),
        type: accountType,
        category,
        parentCode,
        balance: initBal,
        description: payload.description || ''
      }
    })

    revalidatePath('/admin/reports/financial')
    revalidatePath('/admin/journal-entries')

    return { success: true, account, message: `تم إنشاء الحساب الفرعي (${account.name} - كود: ${account.code}) بنجاح` }
  } catch (error: any) {
    console.error('Error creating chart account:', error)
    return { success: false, error: error.message || 'الكود مسجل مسبقاً، يرجى اختيار كود آخر' }
  }
}

export async function deleteChartAccount(id: string) {
  try {
    await checkAccountingAuth()

    const account = await (prisma as any).chartAccount.findUnique({
      where: { id }
    })

    if (!account) return { success: false, error: 'الحساب غير موجود' }

    if (Math.abs(account.balance) > 0) {
      return { success: false, error: 'لا يمكن حذف حساب يحتوي على رصيد مالي. يرجى تصفير رصيده أولاً عبر قيد تسوية' }
    }

    await (prisma as any).chartAccount.delete({
      where: { id }
    })

    revalidatePath('/admin/reports/financial')
    revalidatePath('/admin/journal-entries')

    return { success: true, message: `تم حذف الحساب الفرعي (${account.name}) بنجاح` }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل حذف الحساب' }
  }
}

// =========================================================================
// 5. تقرير شجرة الحسابات المحاسبية الموحدة ودمج الحسابات الفرعية المخصصة
// =========================================================================
export async function getChartOfAccounts() {
  try {
    await checkAccountingAuth()

    const [balanceSheetRes, incomeStatementRes, customAccounts] = await Promise.all([
      getBalanceSheet(),
      getIncomeStatement(),
      (prisma as any).chartAccount.findMany({ orderBy: { code: 'asc' } })
    ])

    if (!balanceSheetRes.success || !balanceSheetRes.data) {
      return { success: false, error: balanceSheetRes.error || 'فشل جلب بيانات المركز المالي' }
    }

    if (!incomeStatementRes.success || !incomeStatementRes.data) {
      return { success: false, error: incomeStatementRes.error || 'فشل جلب بيانات قائمة الدخل' }
    }

    const bs = balanceSheetRes.data
    const is = incomeStatementRes.data

    const customByParent = new Map<string, any[]>()
    customAccounts.forEach((ca: any) => {
      const pCode = ca.parentCode || '52'
      if (!customByParent.has(pCode)) customByParent.set(pCode, [])
      customByParent.get(pCode)!.push({
        id: ca.id,
        code: ca.code,
        name: ca.name,
        type: ca.type,
        balance: ca.balance,
        details: ca.description || 'حساب فرعي مخصص',
        isCustom: true
      })
    })

    const getSubChildren = (parentCode: string, initialChildren: any[] = []) => {
      const customs = customByParent.get(parentCode) || []
      return [...initialChildren, ...customs]
    }

    const chartTree = [
      {
        code: '1',
        name: 'الأصول (Assets)',
        type: 'DEBIT',
        balance: bs.assets.totalAssets,
        children: [
          {
            code: '11',
            name: 'الأصول المتداولة (Current Assets)',
            type: 'DEBIT',
            balance: bs.assets.totalCurrentAssets,
            children: [
              {
                code: '111',
                name: 'النقدية بالخزن والمحافظ السائلة',
                type: 'DEBIT',
                balance: bs.assets.cashInSafes,
                children: bs.breakdowns.safes.map((s: any, idx: number) => ({
                  code: `111${idx + 1}`,
                  name: `خزنة / محفظة: ${s.name}`,
                  type: 'DEBIT',
                  balance: s.balance
                }))
              },
              {
                code: '112',
                name: 'أرصدة الحسابات البنكية',
                type: 'DEBIT',
                balance: bs.assets.bankBalances,
                children: bs.breakdowns.banks.map((b: any, idx: number) => ({
                  code: `112${idx + 1}`,
                  name: `بنك: ${b.name}`,
                  type: 'DEBIT',
                  balance: b.balance
                }))
              },
              {
                code: '113',
                name: 'حسابات العملاء والمدينون التجاريون',
                type: 'DEBIT',
                balance: bs.assets.receivables,
                details: `صافي المستحق: ${bs.assets.netReceivables} ج.م`
              },
              {
                code: '114',
                name: 'المخزون السلعي والبضاعة الحالية (بالتكلفة)',
                type: 'DEBIT',
                balance: bs.assets.inventoryAtCost,
                details: `القيمة البيعية: ${bs.assets.inventoryAtPrice} ج.م`
              },
              {
                code: '115',
                name: 'المدينون والعهد وسلف طرف الغير',
                type: 'DEBIT',
                balance: bs.assets.debtorsReceivables
              },
              {
                code: '116',
                name: 'أرصدة الموردين المدينة (لنا عندهم)',
                type: 'DEBIT',
                balance: bs.assets.vendorDebtors
              },
              ...(customByParent.get('11') || [])
            ]
          },
          {
            code: '12',
            name: 'الأصول غير المتداولة (Fixed Assets)',
            type: 'DEBIT',
            balance: bs.assets.fixedAssets,
            children: getSubChildren('12', [
              {
                code: '121',
                name: 'الأصول الثابتة الرأسمالية (ماكينات، سيارات، أجهزة)',
                type: 'DEBIT',
                balance: bs.assets.fixedAssets,
                details: `عدد الأصول: ${bs.breakdowns.fixedAssetsCount}`
              }
            ])
          }
        ]
      },
      {
        code: '2',
        name: 'الخصوم والالتزامات (Liabilities)',
        type: 'CREDIT',
        balance: bs.liabilities.totalLiabilities,
        children: [
          {
            code: '21',
            name: 'الالتزامات المتداولة (Current Liabilities)',
            type: 'CREDIT',
            balance: bs.liabilities.totalLiabilities,
            children: getSubChildren('21', [
              {
                code: '211',
                name: 'الموردون والدائنون التجاريون (مستحقات الموردين)',
                type: 'CREDIT',
                balance: bs.liabilities.vendorPayables,
                details: `الصافي بعد الأرصدة المدينة: ${bs.liabilities.netVendorPayables} ج.م`
              },
              {
                code: '212',
                name: 'أوراق الدفع (شيكات صادرة تحت الصرف)',
                type: 'CREDIT',
                balance: bs.liabilities.checksPayable
              },
              {
                code: '213',
                name: 'قروض وسلف الدائنين (قروض نقدية للغير)',
                type: 'CREDIT',
                balance: bs.liabilities.creditorsLiability
              },
              {
                code: '214',
                name: 'أرصدة عملاء دائنة مقدماً (أموال للعملاء بالشركة)',
                type: 'CREDIT',
                balance: bs.liabilities.customerCredits
              }
            ])
          }
        ]
      },
      {
        code: '3',
        name: 'حقوق الملكية ورأس المال (Equity)',
        type: 'CREDIT',
        balance: bs.equity.totalEquity,
        children: getSubChildren('3', [
          {
            code: '31',
            name: 'رأس المال وجاري الشركاء',
            type: 'CREDIT',
            balance: bs.equity.partnersCapital
          },
          {
            code: '32',
            name: 'الأرباح المرحلة ورأس المال العامل التراكمي',
            type: 'CREDIT',
            balance: bs.equity.retainedEarnings
          }
        ])
      },
      {
        code: '4',
        name: 'الإيرادات والمبيعات (Revenues)',
        type: 'CREDIT',
        balance: is.sales.netSalesRevenue,
        children: [
          {
            code: '41',
            name: 'إجمالي إيراد مبيعات الفواتير',
            type: 'CREDIT',
            balance: is.sales.grossSalesRevenue,
            children: getSubChildren('41')
          },
          {
            code: '42',
            name: 'مردودات ومسموحات المبيعات والخصم المسموح به (-)',
            type: 'DEBIT',
            balance: - (is.sales.totalReturnsRevenue + (is.sales.totalDiscountsAllowed || 0)),
            children: getSubChildren('42')
          },
          ...(customByParent.get('4') || [])
        ]
      },
      {
        code: '5',
        name: 'التكاليف والمصروفات (Expenses & COGS)',
        type: 'DEBIT',
        balance: is.cogs.netCOGS + is.profitability.totalExpenses,
        children: [
          {
            code: '51',
            name: 'تكلفة البضاعة المباعة (COGS)',
            type: 'DEBIT',
            balance: is.cogs.netCOGS,
            children: getSubChildren('51')
          },
          {
            code: '52',
            name: 'المصروفات العامة والتشغيلية والنثريات',
            type: 'DEBIT',
            balance: is.profitability.totalOperatingExpenses,
            children: getSubChildren('52')
          },
          {
            code: '53',
            name: 'الأجور والرواتب ومسحوبات الموظفين',
            type: 'DEBIT',
            balance: is.profitability.totalSalariesExpenses,
            children: getSubChildren('53')
          },
          ...(customByParent.get('5') || [])
        ]
      }
    ]

    return {
      success: true,
      data: chartTree
    }
  } catch (error: any) {
    console.error('Error fetching chart of accounts:', error)
    return { success: false, error: error.message || 'فشل جلب شجرة الحسابات' }
  }
}