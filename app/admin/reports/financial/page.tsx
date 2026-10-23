'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { 
  getIncomeStatement, 
  getBalanceSheet, 
  getCashFlowStatement, 
  getChartOfAccounts,
  createChartAccount,
  deleteChartAccount
} from '@/app/financial-report-actions'

export default function FinancialReportsPage() {
  const [activeReport, setActiveReport] = useState<
    'P_AND_L' | 'BALANCE_SHEET' | 'CASH_FLOW' | 'CHART_OF_ACCOUNTS' | 'PRODUCT_PROFIT'
  >('P_AND_L')

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(today)

  const [pnlData, setPnlData] = useState<any>(null)
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [cashFlowData, setCashFlowData] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [showAddSubAccountModal, setShowAddSubAccountModal] = useState(false)
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false)
  const [newAccountForm, setNewAccountForm] = useState({
    name: '',
    parentCode: '42',
    code: '',
    initialBalance: '',
    description: ''
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    const [resPnl, resBs, resCf, resChart] = await Promise.all([
      getIncomeStatement(startDate, endDate),
      getBalanceSheet(),
      getCashFlowStatement(startDate, endDate),
      getChartOfAccounts()
    ])

    if (resPnl.success && resPnl.data) setPnlData(resPnl.data)
    if (resBs.success && resBs.data) setBalanceSheetData(resBs.data)
    if (resCf.success && resCf.data) setCashFlowData(resCf.data)
    if (resChart.success && resChart.data) setChartData(resChart.data)
    else setChartData([])

    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const setQuickRange = (type: 'TODAY' | 'MONTH' | 'YEAR') => {
    const cur = new Date()
    const t = cur.toISOString().split('T')[0]

    if (type === 'TODAY') {
      setStartDate(t)
      setEndDate(t)
    } else if (type === 'MONTH') {
      setStartDate(new Date(cur.getFullYear(), cur.getMonth(), 1).toISOString().split('T')[0])
      setEndDate(t)
    } else if (type === 'YEAR') {
      setStartDate(new Date(cur.getFullYear(), 0, 1).toISOString().split('T')[0])
      setEndDate(t)
    }
  }

  const handleSaveSubAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccountForm.name.trim()) return alert('اسم الحساب مطلوب')

    setIsSubmittingAccount(true)
    const res = await createChartAccount({
      name: newAccountForm.name,
      parentCode: newAccountForm.parentCode,
      code: newAccountForm.code || undefined,
      initialBalance: parseFloat(newAccountForm.initialBalance) || 0,
      description: newAccountForm.description
    })
    setIsSubmittingAccount(false)

    if (res.success) {
      alert(res.message)
      setShowAddSubAccountModal(false)
      setNewAccountForm({ name: '', parentCode: '42', code: '', initialBalance: '', description: '' })
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleDeleteSubAccount = async (id: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف الحساب الفرعي (${name})؟`)) return

    const res = await deleteChartAccount(id)
    if (res.success) {
      alert(res.message)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    if (pnlData) {
      const pnlRows = [
        { 'البند المحاسبي': 'إجمالي إيراد المبيعات', 'المبلغ (ج.م)': pnlData.sales.grossSalesRevenue },
        { 'البند المحاسبي': 'مرتجعات المبيعات (-)', 'المبلغ (ج.م)': pnlData.sales.totalReturnsRevenue },
        { 'البند المحاسبي': 'الخصم المسموح به للعملاء (-)', 'المبلغ (ج.م)': pnlData.sales.totalDiscountsAllowed },
        { 'البند المحاسبي': 'صافي إيرادات المبيعات', 'المبلغ (ج.م)': pnlData.sales.netSalesRevenue },
        { 'البند المحاسبي': 'تكلفة البضاعة المباعة (COGS) (-)', 'المبلغ (ج.م)': pnlData.cogs.netCOGS },
        { 'البند المحاسبي': 'مجمل الربح التجاري', 'المبلغ (ج.م)': pnlData.profitability.grossProfit },
        { 'البند المحاسبي': 'المصروفات التشغيلية والعمومية (-)', 'المبلغ (ج.م)': pnlData.profitability.totalOperatingExpenses },
        { 'البند المحاسبي': 'رواتب وسلف الموظفين (-)', 'المبلغ (ج.م)': pnlData.profitability.totalSalariesExpenses },
        { 'البند المحاسبي': 'صافي الربح الفعلي للنشاط', 'المبلغ (ج.م)': pnlData.profitability.netProfit },
      ]
      const wsPnl = XLSX.utils.json_to_sheet(pnlRows)
      XLSX.utils.book_append_sheet(wb, wsPnl, 'قائمة الدخل')
    }

    if (balanceSheetData) {
      const bsRows = [
        { 'التصنيف': 'أصول متداولة', 'البند': 'النقدية بالخزن', 'المبلغ': balanceSheetData.assets.cashInSafes },
        { 'التصنيف': 'أصول متداولة', 'البند': 'أرصدة البنوك', 'المبلغ': balanceSheetData.assets.bankBalances },
        { 'التصنيف': 'أصول متداولة', 'البند': 'مديونية العملاء', 'المبلغ': balanceSheetData.assets.receivables },
        { 'التصنيف': 'أصول متداولة', 'البند': 'المخزون السلعي بالتكلفة', 'المبلغ': balanceSheetData.assets.inventoryAtCost },
        { 'التصنيف': 'أصول متداولة', 'البند': 'مدينون وعهد', 'المبلغ': balanceSheetData.assets.debtorsReceivables },
        { 'التصنيف': 'أصول غير متداولة', 'البند': 'الأصول الثابتة الرأسمالية', 'المبلغ': balanceSheetData.assets.fixedAssets },
        { 'التصنيف': 'إجمالي الأصول', 'البند': 'المجموع الكلي للأصول', 'المبلغ': balanceSheetData.assets.totalAssets },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'مستحقات الموردين', 'المبلغ': balanceSheetData.liabilities.vendorPayables },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'شيكات دفع تحت الصرف', 'المبلغ': balanceSheetData.liabilities.checksPayable },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'قروض وسلف الدائنين', 'المبلغ': balanceSheetData.liabilities.creditorsLiability },
        { 'التصنيف': 'حقوق ملكية', 'البند': 'جاري الشركاء ورأس المال', 'المبلغ': balanceSheetData.equity.partnersCapital },
        { 'التصنيف': 'حقوق ملكية', 'البند': 'الأرباح المرحلة ورأس المال العامل', 'المبلغ': balanceSheetData.equity.retainedEarnings }
      ]
      const wsBs = XLSX.utils.json_to_sheet(bsRows)
      XLSX.utils.book_append_sheet(wb, wsBs, 'المركز المالي')
    }

    if (cashFlowData) {
      const cfRows = [
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'مقبوضات نقدية من العملاء', 'المبلغ': cashFlowData.operating.cashFromCustomers },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'استردادات نقدية من الموردين', 'المبلغ': cashFlowData.operating.cashRefundFromVendors },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'مدفوعات نقدية للعملاء (-)', 'المبلغ': -cashFlowData.operating.cashPaidToCustomers },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'سداد نقدي للموردين (-)', 'المبلغ': -cashFlowData.operating.cashPaidToVendors },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'مصروفات عامة مسددة (-)', 'المبلغ': -cashFlowData.operating.operatingExpensesPaid },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'رواتب منصرفة نقداً (-)', 'المبلغ': -cashFlowData.operating.salariesPaid },
        { 'النشاط': 'أنشطة تشغيلية', 'البند': 'صافي التدفق النقدي التشغيلي', 'المبلغ': cashFlowData.operating.netOperatingCashFlow },
        { 'النشاط': 'أنشطة استثمارية', 'البند': 'شراء أصول ثابتة رأسمالية (-)', 'المبلغ': -cashFlowData.investing.cashPaidForFixedAssets },
        { 'النشاط': 'أنشطة استثمارية', 'البند': 'صافي التدفق النقدي الاستثماري', 'المبلغ': cashFlowData.investing.netInvestingCashFlow },
        { 'النشاط': 'أنشطة تمويلية', 'البند': 'استلام قروض وسلف من دائنين', 'المبلغ': cashFlowData.financing.loansReceived },
        { 'النشاط': 'أنشطة تمويلية', 'البند': 'رد وسداد قروض لدائنين (-)', 'المبلغ': -cashFlowData.financing.loansRepaid },
        { 'النشاط': 'أنشطة تمويلية', 'البند': 'صافي التدفق النقدي التمويلي', 'المبلغ': cashFlowData.financing.netFinancingCashFlow },
        { 'النشاط': 'خلاصة التدفقات', 'البند': 'صافي التغير في النقدية للفترة', 'المبلغ': cashFlowData.summary.netCashChange },
        { 'النشاط': 'خلاصة التدفقات', 'البند': 'رصيد النقدية والبنوك آخر المدة', 'المبلغ': cashFlowData.summary.totalClosingLiquidity }
      ]
      const wsCf = XLSX.utils.json_to_sheet(cfRows)
      XLSX.utils.book_append_sheet(wb, wsCf, 'التدفقات النقدية')
    }

    XLSX.writeFile(wb, `Financial_Reports_${startDate}_to_${endDate}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      
      <style jsx global>{`
        @media print {
          nav, aside, header, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .bg-slate-900, .bg-slate-800, .bg-slate-950 { background: white !important; color: black !important; border-color: #ccc !important; }
          .text-white, .text-slate-300, .text-slate-400 { color: black !important; }
          .text-emerald-400, .text-blue-400, .text-amber-400 { color: black !important; font-weight: bold !important; }
        }
      `}</style>

      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6 no-print">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📈</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">التقارير المالية والقوائم الختامية</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            قائمة الدخل، الميزانية العمومية، التدفقات النقدية، وشجرة الحسابات المحاسبية الموحدة
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => window.print()}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2"
          >
            <span>🖨️</span>
            <span>طباعة القوائم</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-lg"
          >
            <span>📊</span>
            <span>تصدير Excel شامل</span>
          </button>

          <Link
            href="/admin"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition"
          >
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* شريط الفلاتر والتبويبات */}
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 no-print">
          
          <div className="flex gap-1.5 border-b border-slate-700 pb-2 md:pb-0 md:border-b-0 w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveReport('P_AND_L')}
              className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                activeReport === 'P_AND_L' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>📊</span>
              <span>قائمة الدخل (P&L)</span>
            </button>

            <button
              onClick={() => setActiveReport('BALANCE_SHEET')}
              className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                activeReport === 'BALANCE_SHEET' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🏛️</span>
              <span>الميزانية والمركز المالي</span>
            </button>

            <button
              onClick={() => setActiveReport('CASH_FLOW')}
              className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                activeReport === 'CASH_FLOW' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🌊</span>
              <span>التدفقات النقدية</span>
            </button>

            <button
              onClick={() => setActiveReport('CHART_OF_ACCOUNTS')}
              className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                activeReport === 'CHART_OF_ACCOUNTS' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🌳</span>
              <span>شجرة الحسابات</span>
            </button>

            <button
              onClick={() => setActiveReport('PRODUCT_PROFIT')}
              className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap ${
                activeReport === 'PRODUCT_PROFIT' ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🏷️</span>
              <span>أرباح الأصناف</span>
            </button>
          </div>

          {(activeReport === 'P_AND_L' || activeReport === 'CASH_FLOW' || activeReport === 'PRODUCT_PROFIT') && (
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold outline-none"
                  title="من تاريخ"
                />
                <span className="text-slate-500 text-xs">إلى</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold outline-none"
                  title="إلى تاريخ"
                />
              </div>

              <div className="flex gap-1">
                <button onClick={() => setQuickRange('TODAY')} className="bg-slate-900 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold">اليوم</button>
                <button onClick={() => setQuickRange('MONTH')} className="bg-slate-900 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold">هذا الشهر</button>
                <button onClick={() => setQuickRange('YEAR')} className="bg-slate-900 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold">هذا العام</button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-20 text-center text-slate-400 font-bold text-lg animate-pulse">
            جاري معالجة واستخراج الحسابات والقوائم المالية...
          </div>
        ) : (
          <>
            {/* 1. قائمة الدخل (P&L) مع إظهار الخصم المسموح به بدقة */}
            {activeReport === 'P_AND_L' && pnlData && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">صافي الإيرادات (المبيعات)</span>
                    <span className="text-2xl md:text-3xl font-black text-blue-400 font-mono">
                      {pnlData.sales.netSalesRevenue.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">{pnlData.sales.netPiecesSold} قطعة مباعة</span>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">تكلفة البضاعة المباعة (COGS)</span>
                    <span className="text-2xl md:text-3xl font-black text-amber-400 font-mono">
                      {pnlData.cogs.netCOGS.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">تكلفة شراء الأصناف المباعة</span>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">مجمل الربح التجاري</span>
                    <span className="text-2xl md:text-3xl font-black text-purple-400 font-mono">
                      {pnlData.profitability.grossProfit.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-purple-300 font-bold block mt-1">
                      هامش مجمل الربح: {pnlData.profitability.grossProfitMargin.toFixed(1)}%
                    </span>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">صافي الربح الفعلي النهائي</span>
                    <span className={`text-2xl md:text-3xl font-black font-mono ${pnlData.profitability.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pnlData.profitability.netProfit.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className={`text-[11px] font-bold block mt-1 ${pnlData.profitability.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      صافي الهامش: {pnlData.profitability.netProfitMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-black text-white text-base">قائمة الأرباح والخسائر الرسمية (P&L)</h3>
                    <span className="text-xs text-slate-400 font-mono">الفترة: من {startDate} إلى {endDate}</span>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="space-y-2 border-b border-slate-700 pb-3">
                      <div className="flex justify-between font-bold text-slate-200">
                        <span>إجمالي إيراد المبيعات</span>
                        <span className="font-mono">{pnlData.sales.grossSalesRevenue.toLocaleString()} ج.م</span>
                      </div>
                      
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>يُخصم: مرتجعات المبيعات</span>
                        <span className="font-mono text-rose-400">-{pnlData.sales.totalReturnsRevenue.toLocaleString()} ج.م</span>
                      </div>

                      {/* ✅ إظهار استقطاع الخصم المسموح به تحت المبيعات مباشرة */}
                      {pnlData.sales.totalDiscountsAllowed > 0 && (
                        <div className="flex justify-between text-xs font-bold text-amber-300 bg-amber-500/10 p-2 rounded-lg border border-amber-500/30">
                          <span>يُخصم: الخصم المسموح به للعملاء (-)</span>
                          <span className="font-mono text-rose-400">-{pnlData.sales.totalDiscountsAllowed.toLocaleString()} ج.م</span>
                        </div>
                      )}

                      <div className="flex justify-between font-black text-blue-400 text-lg pt-1">
                        <span>صافي إيرادات المبيعات (1)</span>
                        <span className="font-mono">{pnlData.sales.netSalesRevenue.toLocaleString()} ج.م</span>
                      </div>
                    </div>

                    <div className="space-y-2 border-b border-slate-700 pb-3">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>تكلفة البضاعة المباعة (بالفواتير)</span>
                        <span className="font-mono">{pnlData.cogs.grossCOGS.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>يُستنزل: تكلفة بضاعة المرتجعات</span>
                        <span className="font-mono text-emerald-400">+{pnlData.cogs.totalReturnsCost.toLocaleString()} ج.م</span>
                      </div>
                      {pnlData.cogs.totalDiscountsReceived > 0 && (
                        <div className="flex justify-between text-xs text-emerald-300 font-bold">
                          <span>يُستنزل: الخصم المكتسب من الموردين</span>
                          <span className="font-mono text-emerald-400">+{pnlData.cogs.totalDiscountsReceived.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-amber-400 text-base pt-1">
                        <span>صافي تكلفة المبيعات - COGS (2)</span>
                        <span className="font-mono">-{pnlData.cogs.netCOGS.toLocaleString()} ج.م</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-black text-xl text-purple-300 bg-slate-950 p-4 rounded-xl border border-purple-500/30">
                      <span>مجمل الربح التجاري (1 - 2)</span>
                      <span className="font-mono">{pnlData.profitability.grossProfit.toLocaleString()} ج.م</span>
                    </div>

                    <div className="space-y-2 border-b border-slate-700 pb-3 pt-2">
                      <div className="text-xs font-bold text-slate-400 mb-1">المصروفات التشغيلية والعمومية والرواتب:</div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>المصروفات العامة والنثريات والإيجارات</span>
                        <span className="font-mono text-rose-400">-{pnlData.profitability.totalOperatingExpenses.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>رواتب وسلف ومسحوبات الموظفين</span>
                        <span className="font-mono text-rose-400">-{pnlData.profitability.totalSalariesExpenses.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-300 pt-1">
                        <span>إجمالي المصروفات (3)</span>
                        <span className="font-mono text-rose-400">-{pnlData.profitability.totalExpenses.toLocaleString()} ج.م</span>
                      </div>
                    </div>

                    <div className={`flex justify-between font-black text-2xl p-5 rounded-2xl border ${
                      pnlData.profitability.netProfit >= 0 
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400' 
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-400'
                    }`}>
                      <span>صافي الربح الفعلي للنشاط</span>
                      <span className="font-mono">{pnlData.profitability.netProfit.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. المركز المالي والميزانية العمومية */}
            {activeReport === 'BALANCE_SHEET' && balanceSheetData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-800 border-2 border-blue-500/50 p-6 rounded-2xl shadow-xl">
                    <span className="text-xs text-slate-400 block mb-1">إجمالي الأصول (سيولة وممتلكات ومخزون)</span>
                    <span className="text-3xl font-black text-blue-400 font-mono">
                      {balanceSheetData.assets.totalAssets.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">خزن + بنوك + عملاء + بضاعة + أصول ثابتة</span>
                  </div>

                  <div className="bg-slate-800 border-2 border-purple-500/50 p-6 rounded-2xl shadow-xl">
                    <span className="text-xs text-slate-400 block mb-1">إجمالي الالتزامات وحقوق الملكية</span>
                    <span className="text-3xl font-black text-purple-400 font-mono">
                      {balanceSheetData.equity.totalLiabilitiesAndEquity.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-emerald-400 font-bold block mt-1">✓ الميزانية متطابقة محاسبياً 100%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 space-y-4">
                    <h3 className="font-black text-blue-400 text-lg border-b border-slate-700 pb-3 flex items-center gap-2">
                      <span>🏛️</span>
                      <span>الأصول (Assets)</span>
                    </h3>

                    <div className="space-y-2.5 text-sm">
                      <div className="text-xs font-bold text-slate-400">الأصول المتداولة:</div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">النقدية بالخزن السائلة</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.cashInSafes.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">أرصدة الحسابات البنكية</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.bankBalances.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/80 p-3 rounded-xl border border-blue-500/30">
                        <span className="text-slate-200 font-bold">مديونية العملاء</span>
                        <span className="font-mono font-black text-blue-400 text-base">{balanceSheetData.assets.receivables.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">المخزون السلعي (بالتكلفة)</span>
                        <span className="font-mono font-bold text-amber-400">{balanceSheetData.assets.inventoryAtCost.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">مدينون وعهد طرف الغير</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.debtorsReceivables.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">أرصدة موردين مدينة (لنا عندهم)</span>
                        <span className="font-mono font-bold text-emerald-400">{balanceSheetData.assets.vendorDebtors.toLocaleString()} ج.م</span>
                      </div>

                      <div className="text-xs font-bold text-slate-400 pt-2">الأصول غير المتداولة:</div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-slate-300">الأصول الثابتة الرأسمالية ({balanceSheetData.breakdowns.fixedAssetsCount} أصل)</span>
                        <span className="font-mono font-bold text-emerald-400">{balanceSheetData.assets.fixedAssets.toLocaleString()} ج.م</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-black text-xl text-blue-400 bg-slate-950 p-4 rounded-xl border border-blue-500/30 pt-3">
                      <span>إجمالي الأصول الكلية</span>
                      <span className="font-mono">{balanceSheetData.assets.totalAssets.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 space-y-4">
                    <h3 className="font-black text-purple-400 text-lg border-b border-slate-700 pb-3 flex items-center gap-2">
                      <span>🤝</span>
                      <span>الالتزامات وحقوق الملكية (Liabilities & Equity)</span>
                    </h3>

                    <div className="space-y-2.5 text-sm">
                      <div className="text-xs font-bold text-slate-400">الالتزامات المتداولة:</div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">مستحقات الموردين التجارية (لهم علينا)</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.vendorPayables.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">شيكات دفع صادرة تحت الصرف</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.checksPayable.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">قروض وسلف الدائنين</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.creditorsLiability.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">أرصدة عملاء دائنة مقدماً</span>
                        <span className="font-mono font-bold text-amber-400">{balanceSheetData.liabilities.customerCredits.toLocaleString()} ج.م</span>
                      </div>

                      <div className="text-xs font-bold text-slate-400 pt-2">حقوق الملكية ورأس المال:</div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">جاري الشركاء ورأس المال</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.equity.partnersCapital.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-slate-300">الأرباح المرحلة ورأس المال العامل</span>
                        <span className="font-mono font-bold text-emerald-400">{balanceSheetData.equity.retainedEarnings.toLocaleString()} ج.م</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-black text-xl text-purple-400 bg-slate-950 p-4 rounded-xl border border-purple-500/30 pt-3">
                      <span>إجمالي الالتزامات وحقوق الملكية</span>
                      <span className="font-mono">{balanceSheetData.equity.totalLiabilitiesAndEquity.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. قائمة التدفقات النقدية */}
            {activeReport === 'CASH_FLOW' && cashFlowData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">صافي التدفق التشغيلي</span>
                    <span className={`text-2xl font-black font-mono ${cashFlowData.operating.netOperatingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {cashFlowData.operating.netOperatingCashFlow.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">حركة البيع والشراء والمصروفات</span>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">صافي التدفق الاستثماري</span>
                    <span className={`text-2xl font-black font-mono ${cashFlowData.investing.netInvestingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {cashFlowData.investing.netInvestingCashFlow.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">شراء وتجهيز الأصول الرأسمالية</span>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-slate-400 block mb-1">صافي التدفق التمويلي</span>
                    <span className={`text-2xl font-black font-mono ${cashFlowData.financing.netFinancingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {cashFlowData.financing.netFinancingCashFlow.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">سلف وقروض وجاري الشركاء</span>
                  </div>

                  <div className="bg-slate-800 border-2 border-amber-500/50 p-5 rounded-2xl shadow-lg">
                    <span className="text-xs text-amber-300 block mb-1 font-bold">صافي التغير الكلي في السيولة</span>
                    <span className={`text-2xl font-black font-mono ${cashFlowData.summary.netCashChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {cashFlowData.summary.netCashChange.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-1">نقدية الخزن والبنوك الحالية</span>
                  </div>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-black text-white text-base">قائمة التدفقات النقدية التفصيلية (Cash Flow Statement)</h3>
                    <span className="text-xs text-slate-400 font-mono">الفترة: من {startDate} إلى {endDate}</span>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="space-y-2 border-b border-slate-700 pb-4">
                      <h4 className="text-sm font-black text-blue-400 flex items-center gap-1.5">
                        <span>1️⃣</span>
                        <span>التدفقات النقدية من الأنشطة التشغيلية (Operating Activities)</span>
                      </h4>
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>مقبوضات نقدية محصلة من العملاء (كاش + شيكات)</span>
                        <span className="font-mono text-emerald-400">+{cashFlowData.operating.cashFromCustomers.toLocaleString()} ج.م</span>
                      </div>
                      {cashFlowData.operating.cashRefundFromVendors > 0 && (
                        <div className="flex justify-between text-xs text-slate-300 pr-4">
                          <span>استردادات نقدية واردة من الموردين</span>
                          <span className="font-mono text-emerald-400">+{cashFlowData.operating.cashRefundFromVendors.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>مدفوعات نقدية مسددة للموردين (سداد مشتريات)</span>
                        <span className="font-mono text-rose-400">-{cashFlowData.operating.cashPaidToVendors.toLocaleString()} ج.م</span>
                      </div>
                      {cashFlowData.operating.cashPaidToCustomers > 0 && (
                        <div className="flex justify-between text-xs text-slate-300 pr-4">
                          <span>نقدية منصرفة / مستردة للعملاء</span>
                          <span className="font-mono text-rose-400">-{cashFlowData.operating.cashPaidToCustomers.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>مصروفات تشغيلية ونثريات مسددة نقداً</span>
                        <span className="font-mono text-rose-400">-{cashFlowData.operating.operatingExpensesPaid.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>رواتب وسلف ومسحوبات موظفين مسددة</span>
                        <span className="font-mono text-rose-400">-{cashFlowData.operating.salariesPaid.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-slate-100 bg-slate-900/60 p-2.5 rounded-xl mt-2">
                        <span>صافي التدفق النقدي من الأنشطة التشغيلية</span>
                        <span className={`font-mono font-black ${cashFlowData.operating.netOperatingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {cashFlowData.operating.netOperatingCashFlow.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 border-b border-slate-700 pb-4">
                      <h4 className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                        <span>2️⃣</span>
                        <span>التدفقات النقدية من الأنشطة الاستثمارية (Investing Activities)</span>
                      </h4>
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>مدفوعات نقدية لشراء وتجهيز أصول ثابتة رأسمالية</span>
                        <span className="font-mono text-rose-400">-{cashFlowData.investing.cashPaidForFixedAssets.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-slate-100 bg-slate-900/60 p-2.5 rounded-xl mt-2">
                        <span>صافي التدفق النقدي من الأنشطة الاستثمارية</span>
                        <span className={`font-mono font-black ${cashFlowData.investing.netInvestingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {cashFlowData.investing.netInvestingCashFlow.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 border-b border-slate-700 pb-4">
                      <h4 className="text-sm font-black text-purple-400 flex items-center gap-1.5">
                        <span>3️⃣</span>
                        <span>التدفقات النقدية من الأنشطة التمويلية (Financing Activities)</span>
                      </h4>
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>استلام قروض وسلف نقدية من الدائنين والغير</span>
                        <span className="font-mono text-emerald-400">+{cashFlowData.financing.loansReceived.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-300 pr-4">
                        <span>رد وسداد قروض وسلف للدائنين</span>
                        <span className="font-mono text-rose-400">-{cashFlowData.financing.loansRepaid.toLocaleString()} ج.م</span>
                      </div>
                      {cashFlowData.financing.partnersCapitalIn > 0 && (
                        <div className="flex justify-between text-xs text-slate-300 pr-4">
                          <span>تمويل وضخ أموال جديدة من الشركاء</span>
                          <span className="font-mono text-emerald-400">+{cashFlowData.financing.partnersCapitalIn.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      {cashFlowData.financing.partnersDrawings > 0 && (
                        <div className="flex justify-between text-xs text-slate-300 pr-4">
                          <span>مسحوبات الشركاء النقدية</span>
                          <span className="font-mono text-rose-400">-{cashFlowData.financing.partnersDrawings.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm text-slate-100 bg-slate-900/60 p-2.5 rounded-xl mt-2">
                        <span>صافي التدفق النقدي من الأنشطة التمويلية</span>
                        <span className={`font-mono font-black ${cashFlowData.financing.netFinancingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {cashFlowData.financing.netFinancingCashFlow.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-700 space-y-3">
                      <div className="flex justify-between font-black text-lg text-amber-400 border-b border-slate-800 pb-2">
                        <span>صافي التغير في النقدية خلال الفترة (1 + 2 + 3)</span>
                        <span className="font-mono">{cashFlowData.summary.netCashChange.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between text-xs text-slate-400">
                        <span>رصيد السيولة النقدية المقدر في أول الفترة:</span>
                        <span className="font-mono font-bold text-slate-200">{cashFlowData.summary.openingLiquidity.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between text-sm font-black text-emerald-400 pt-1">
                        <span>إجمالي رصيد السيولة الفعلي آخر الفترة (خزن وبنوك):</span>
                        <span className="font-mono text-xl">{cashFlowData.summary.totalClosingLiquidity.toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. شجرة الحسابات المحاسبية مع إمكانية إضافة وحذف حسابات فرعية */}
            {activeReport === 'CHART_OF_ACCOUNTS' && (
              <div className="space-y-4">
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-slate-400">
                  <div>
                    <span className="font-black text-white text-sm block">
                      🌳 الدليل المحاسبي الشامل (شجرة الحسابات الموحدة)
                    </span>
                    <span>يمكنك إنشاء حساب فرعي تحت أي مجموعة (مثل إيجار، دعاية، خصم مسموح به...)</span>
                  </div>

                  <button
                    onClick={() => setShowAddSubAccountModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>إضافة حساب فرعي جديد</span>
                  </button>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden p-6 space-y-6">
                  {chartData.map((mainGroup: any) => (
                    <div key={mainGroup.code} className="border border-slate-700/80 rounded-2xl overflow-hidden bg-slate-950/40">
                      <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-600/30 text-blue-300 border border-blue-500/40">
                            {mainGroup.code}
                          </span>
                          <span className="font-black text-base md:text-lg text-white">
                            {mainGroup.name}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            mainGroup.type === 'DEBIT' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            {mainGroup.type === 'DEBIT' ? 'طبيعة مدينة' : 'طبيعة دائنة'}
                          </span>
                        </div>

                        <span className="font-mono font-black text-lg text-emerald-400">
                          {Math.abs(mainGroup.balance).toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        {mainGroup.children?.map((subGroup: any) => (
                          <div key={subGroup.code} className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {subGroup.code}
                                </span>
                                <span className="font-bold text-sm text-slate-200">
                                  {subGroup.name}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-sm text-blue-400">
                                {Math.abs(subGroup.balance).toLocaleString()} ج.م
                              </span>
                            </div>

                            {/* الحسابات التفصيلية التابعة */}
                            {subGroup.children && subGroup.children.length > 0 && (
                              <div className="pr-6 space-y-1.5 pt-2 border-t border-slate-800/80">
                                {subGroup.children.map((item: any) => (
                                  <div key={item.code} className={`flex justify-between items-center text-xs p-2 rounded-lg ${
                                    item.isCustom ? 'bg-indigo-950/40 border border-indigo-500/30' : 'bg-slate-950/40 text-slate-400'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] text-slate-500">{item.code}</span>
                                      <span className={`font-medium ${item.isCustom ? 'text-indigo-200 font-bold' : 'text-slate-300'}`}>
                                        {item.name}
                                      </span>
                                      {item.isCustom && (
                                        <span className="text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                                          فرعي مخصص
                                        </span>
                                      )}
                                      {item.details && <span className="text-[10px] text-slate-500">({item.details})</span>}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-slate-200">
                                        {Math.abs(item.balance).toLocaleString()} ج.م
                                      </span>

                                      {item.isCustom && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSubAccount(item.id, item.name)}
                                          className="text-red-400 hover:text-red-300 p-1"
                                          title="حذف الحساب الفرعي"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. تحليل أرباح الأصناف */}
            {activeReport === 'PRODUCT_PROFIT' && pnlData && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                  <h3 className="font-black text-white text-base">تحليل أرباح ومبيعات الأصناف المباعة</h3>
                  <span className="text-xs text-slate-400 font-mono">مرتبة حسب مجمل الربح المحقق</span>
                </div>

                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-950 text-slate-400 text-xs font-bold sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-3.5">الموديل</th>
                        <th className="p-3.5">اللون</th>
                        <th className="p-3.5 text-center">الكمية المباعة</th>
                        <th className="p-3.5 text-center">إجمالي الإيراد</th>
                        <th className="p-3.5 text-center">إجمالي التكلفة</th>
                        <th className="p-3.5 text-center">مجمل الربح</th>
                        <th className="p-3.5 text-center">هامش الربح</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {pnlData.productsAnalysis.map((prod: any, idx: number) => {
                        const margin = prod.revenue > 0 ? (prod.grossProfit / prod.revenue) * 100 : 0
                        return (
                          <tr key={idx} className="hover:bg-slate-700/30 transition">
                            <td className="p-3.5 font-bold text-white text-base">{prod.modelNo}</td>
                            <td className="p-3.5 text-slate-300">{prod.color}</td>
                            <td className="p-3.5 text-center font-mono font-bold text-blue-400">{prod.quantitySold} قطعة</td>
                            <td className="p-3.5 text-center font-mono font-bold text-white">{prod.revenue.toLocaleString()} ج.م</td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-400">{prod.totalCost.toLocaleString()} ج.م</td>
                            <td className="p-3.5 text-center font-mono font-black text-emerald-400">{prod.grossProfit.toLocaleString()} ج.م</td>
                            <td className="p-3.5 text-center font-mono font-bold">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                margin >= 30 ? 'bg-emerald-500/20 text-emerald-300' :
                                margin >= 15 ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* مودال إنشاء حساب فرعي جديد */}
      {showAddSubAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">➕ إضافة حساب فرعي جديد في الشجرة</h3>
              <button onClick={() => setShowAddSubAccountModal(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveSubAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الحساب الأب (المجموعة التابع لها) *</label>
                <select
                  value={newAccountForm.parentCode}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, parentCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-indigo-500"
                >
                  <optgroup label="الإيرادات والمبيعات (4)">
                    <option value="42">42 - مردودات ومسموحات المبيعات (خصم مسموح به)</option>
                    <option value="41">41 - إيرادات المبيعات</option>
                    <option value="4">4 - إيرادات أخرى متنوعة (خصم مكتسب، فوائد...)</option>
                  </optgroup>
                  <optgroup label="المصروفات والتكاليف (5)">
                    <option value="52">52 - المصروفات العامة والتشغيلية (إيجار، كهرباء، صيانة...)</option>
                    <option value="51">51 - تكلفة البضاعة المباعة</option>
                    <option value="53">53 - الأجور والرواتب</option>
                  </optgroup>
                  <optgroup label="الأصول (1)">
                    <option value="11">11 - الأصول المتداولة (نقدية، عهد، مدينون...)</option>
                    <option value="12">12 - الأصول غير المتداولة (أصول ثابتة)</option>
                  </optgroup>
                  <optgroup label="الالتزامات وحقوق الملكية (2 & 3)">
                    <option value="21">21 - الالتزامات المتداولة (دائنون، التزامات)</option>
                    <option value="3">3 - حقوق الملكية وجاري الشركاء</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم الحساب الفرعي *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: خصم مسموح به، إيجار المعرض، دعاية وتسويق..."
                  value={newAccountForm.name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">كود الحساب (تلقائي لو فارغ)</label>
                  <input
                    type="text"
                    placeholder="تلقائي..."
                    value={newAccountForm.code}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-300 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رصيد افتتاحي</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newAccountForm.initialBalance}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, initialBalance: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-emerald-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات توضيحية</label>
                <input
                  type="text"
                  placeholder="وصف مختصر لطبيعة الحساب..."
                  value={newAccountForm.description}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSubAccountModal(false)}
                  className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAccount}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmittingAccount ? 'جاري الإنشاء...' : 'حفظ وإنشاء الحساب ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}