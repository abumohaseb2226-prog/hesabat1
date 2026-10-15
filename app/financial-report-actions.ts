'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

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

    const startDate = new Date(startStr)
    startDate.setHours(0, 0, 0, 0)

    const endDate = new Date(endStr)
    endDate.setHours(23, 59, 59, 999)

    // أ. المبيعات وبنود الأوردرات في الفترة
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, modelNo: true, color: true, cost: true, price: true }
            }
          }
        }
      }
    })

    // ب. مرتجعات المبيعات في الفترة
    const returns = await prisma.returnOrder.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' }
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, modelNo: true, color: true, cost: true } }
          }
        }
      }
    })

    // ج. المصروفات العامة والتشغيلية
    const operatingExpenses = await prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        type: 'OUT',
        vendorId: null,
        checkRefId: null
      }
    })

    // د. رواتب ومسحوبات الموظفين
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

    const netSalesRevenue = grossSalesRevenue - totalReturnsRevenue
    const netCOGS = grossCOGS - totalReturnsCost
    const grossProfit = netSalesRevenue - netCOGS
    const grossProfitMargin = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0

    const totalOperatingExpenses = operatingExpenses.reduce((s, p) => s + p.amount, 0)
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
          netSalesRevenue,
          totalPiecesSold,
          totalPiecesReturned,
          netPiecesSold: totalPiecesSold - totalPiecesReturned,
          ordersCount: orders.length
        },
        cogs: {
          grossCOGS,
          totalReturnsCost,
          netCOGS
        },
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
// مصحح بالكامل ومطابق 100% مع شاشات العملاء والمخازن والخزائن
// =========================================================================
export async function getBalanceSheet() {
  try {
    await checkAccountingAuth()

    // 1. الأصول المتداولة: الخزن النقدية
    const safes = await prisma.safe.findMany({
      include: {
        payments: true,
        incomingTransfers: true
      }
    })

    const safesBalances = safes.map(s => {
      let balance = 0
      s.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') balance += p.amount
        else if (p.type === 'OUT') balance -= p.amount
        else if (p.type === 'TRANSFER') balance -= p.amount
      })
      s.incomingTransfers.forEach(p => {
        balance += p.amount
      })
      return { id: s.id, name: s.name, balance }
    })
    const totalCashInSafes = safesBalances.reduce((sum, s) => sum + s.balance, 0)

    // 2. الأصول المتداولة: الحسابات البنكية
    const banks = await prisma.bankAccount.findMany()
    const totalBankBalances = banks.reduce((sum, b) => sum + (Number(b.balance) || 0), 0)

    // 3. الأصول المتداولة: مديونية العملاء (مطابقة 100% مع شاشة العملاء)
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
        payments: {
          select: { amount: true, type: true }
        }
      }
    })

    let totalCustomerDebtors = 0       // عليهم للشركة (مديونيات مستحقة)
    let totalCustomerCreditors = 0     // لهم عندنا (أرصدة دائنة مقدماً)

    customers.forEach(c => {
      // إجمالي الفواتير
      const ordersTotal = c.orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)

      // إجمالي المرتجعات
      let returnsTotal = 0
      c.orders.forEach(o => {
        o.originalReturns.forEach(r => {
          returnsTotal += (r.totalRefund || 0)
        })
      })

      // إجمالي السدادات من العميل (IN و PAYMENT_COLLECTION)
      let paymentsIn = 0
      let paymentsOut = 0
      c.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') {
          paymentsIn += (p.amount || 0)
        } else if (p.type === 'OUT') {
          paymentsOut += (p.amount || 0)
        }
      })

      const bal = ordersTotal - returnsTotal - paymentsIn + paymentsOut

      if (bal > 0) {
        totalCustomerDebtors += bal
      } else if (bal < 0) {
        totalCustomerCreditors += Math.abs(bal)
      }
    })

    // تقريب الأرقام
    totalCustomerDebtors = Math.round(totalCustomerDebtors * 100) / 100
    totalCustomerCreditors = Math.round(totalCustomerCreditors * 100) / 100
    const netCustomerReceivables = Math.round((totalCustomerDebtors - totalCustomerCreditors) * 100) / 100

    // 4. الأصول المتداولة: بضاعة المخزون الحالية
    const products = await prisma.product.findMany({
      select: { currentStock: true, cost: true, price: true }
    })
    const totalInventoryValueAtCost = products.reduce((sum, p) => sum + (p.currentStock * p.cost), 0)
    const totalInventoryValueAtPrice = products.reduce((sum, p) => sum + (p.currentStock * p.price), 0)

    // 5. الأصول المتداولة: المدينون والعهد طرف الغير
    const otherAccounts = await prisma.otherAccount.findMany()
    const totalDebtorsReceivables = otherAccounts
      .filter(a => a.type === 'DEBTOR' || a.balance < 0)
      .reduce((sum, a) => sum + Math.abs(a.balance), 0)

    // 6. الأصول غير المتداولة: الأصول الثابتة الرأسمالية
    const fixedAssets = await prisma.fixedAsset.findMany({
      where: { status: 'ACTIVE' }
    })
    const totalFixedAssetsValue = fixedAssets.reduce((sum, a) => sum + a.currentValue, 0)

    // إجمالي الأصول الكلية (باستخدام مديونيات العملاء المدينة)
    const totalCurrentAssets = totalCashInSafes + totalBankBalances + totalCustomerDebtors + totalInventoryValueAtCost + totalDebtorsReceivables
    const totalAssets = totalCurrentAssets + totalFixedAssetsValue

    // ==========================================
    // 7. الالتزامات (الخصوم)
    // ==========================================

    // أ. مستحقات الموردين (التجارية)
    const vendors = await prisma.vendor.findMany({
      include: {
        products: { select: { stockQty: true, cost: true } },
        transactions: true,
        payments: { where: { type: 'OUT' } }
      }
    })
    let totalVendorPayables = 0
    vendors.forEach(v => {
      const initialStockDebt = v.products.reduce((s, p) => s + (p.stockQty * p.cost), 0)
      const purchasesFromTrans = v.transactions.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.amount, 0)
      const returns = v.transactions.filter(t => t.type === 'RETURN').reduce((s, t) => s + t.amount, 0)
      const paid = v.payments.reduce((s, p) => s + p.amount, 0)
      const balance = (initialStockDebt + purchasesFromTrans) - (returns + paid)
      if (balance > 0) totalVendorPayables += balance
    })

    // ب. أوراق دفع شيكات تحت الصرف
    const pendingPayableChecks = await prisma.check.findMany({
      where: { type: 'PAYABLE', status: 'PORTFOLIO' }
    })
    const totalChecksPayable = pendingPayableChecks.reduce((sum, c) => sum + c.amount, 0)

    // ج. القروض والسلف المستحقة للدائنين
    const totalCreditorsLiability = otherAccounts
      .filter(a => a.type === 'CREDITOR' && a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0)

    // د. أرصدة عملاء دائنة مقدماً (لهم عندنا رصيد)
    const totalCustomerCreditLiabilities = totalCustomerCreditors

    const totalLiabilities = totalVendorPayables + totalChecksPayable + totalCreditorsLiability + totalCustomerCreditLiabilities

    // ==========================================
    // 8. حقوق الملكية ورأس المال
    // ==========================================
    const totalPartnersCapital = otherAccounts
      .filter(a => a.type === 'PARTNER')
      .reduce((sum, a) => sum + a.balance, 0)

    // صافي رأس المال العامل والأرباح المرحلة (التوازن المحاسبي)
    const retainedEarnings = totalAssets - totalLiabilities - totalPartnersCapital
    const totalEquity = totalPartnersCapital + retainedEarnings

    return {
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        assets: {
          cashInSafes: totalCashInSafes,
          bankBalances: totalBankBalances,
          receivables: totalCustomerDebtors, // مديونيات العملاء المطابقة لـ 23,136
          netReceivables: netCustomerReceivables, // الصافي المطابق لـ 13,945.75
          customerCredits: totalCustomerCreditors, // المطابق لـ 9,190.25
          inventoryAtCost: totalInventoryValueAtCost,
          inventoryAtPrice: totalInventoryValueAtPrice,
          debtorsReceivables: totalDebtorsReceivables,
          totalCurrentAssets,
          fixedAssets: totalFixedAssetsValue,
          totalAssets
        },
        liabilities: {
          vendorPayables: totalVendorPayables,
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