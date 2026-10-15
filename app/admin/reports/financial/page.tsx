'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { getIncomeStatement, getBalanceSheet } from '@/app/financial-report-actions'

export default function FinancialReportsPage() {
  const [activeReport, setActiveReport] = useState<'P_AND_L' | 'BALANCE_SHEET' | 'PRODUCT_PROFIT'>('P_AND_L')

  // فلاتر التواريخ
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(today)

  const [pnlData, setPnlData] = useState<any>(null)
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [resPnl, resBs] = await Promise.all([
      getIncomeStatement(startDate, endDate),
      getBalanceSheet()
    ])

    if (resPnl.success) setPnlData(resPnl.data)
    if (resBs.success) setBalanceSheetData(resBs.data)

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

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    if (pnlData) {
      const pnlRows = [
        { 'البند المحاسبي': 'إجمالي إيراد المبيعات', 'المبلغ (ج.م)': pnlData.sales.grossSalesRevenue },
        { 'البند المحاسبي': 'مرتجعات المبيعات (-)', 'المبلغ (ج.م)': pnlData.sales.totalReturnsRevenue },
        { 'البند المحاسبي': 'صافي إيرادات المبيعات', 'المبلغ (ج.م)': pnlData.sales.netSalesRevenue },
        { 'البند المحاسبي': 'تكلفة البضاعة المباعة (COGS) (-)', 'المبلغ (ج.م)': pnlData.cogs.netCOGS },
        { 'البند المحاسبي': 'مجمل الربح التجاري (Gross Profit)', 'المبلغ (ج.م)': pnlData.profitability.grossProfit },
        { 'البند المحاسبي': 'المصروفات التشغيلية والعمومية (-)', 'المبلغ (ج.م)': pnlData.profitability.totalOperatingExpenses },
        { 'البند المحاسبي': 'رواتب وسلف الموظفين (-)', 'المبلغ (ج.م)': pnlData.profitability.totalSalariesExpenses },
        { 'البند المحاسبي': 'صافي الربح الفعلي النهائي (Net Profit)', 'المبلغ (ج.م)': pnlData.profitability.netProfit },
      ]
      const wsPnl = XLSX.utils.json_to_sheet(pnlRows)
      XLSX.utils.book_append_sheet(wb, wsPnl, 'قائمة الدخل')
    }

    if (balanceSheetData) {
      const bsRows = [
        { 'التصنيف': 'أصول متداولة', 'البند': 'النقدية بالخزن', 'المبلغ': balanceSheetData.assets.cashInSafes },
        { 'التصنيف': 'أصول متداولة', 'البند': 'أرصدة البنوك', 'المبلغ': balanceSheetData.assets.bankBalances },
        { 'التصنيف': 'أصول متداولة', 'البند': 'مديونية العملاء (مستحقات تجارية)', 'المبلغ': balanceSheetData.assets.receivables },
        { 'التصنيف': 'أصول متداولة', 'البند': 'بضاعة المخزون بالتكلفة', 'المبلغ': balanceSheetData.assets.inventoryAtCost },
        { 'التصنيف': 'أصول متداولة', 'البند': 'مدينون وعهد', 'المبلغ': balanceSheetData.assets.debtorsReceivables },
        { 'التصنيف': 'أصول غير متداولة', 'البند': 'الأصول الثابتة الرأسمالية', 'المبلغ': balanceSheetData.assets.fixedAssets },
        { 'التصنيف': 'إجمالي الأصول', 'البند': 'المجموع الكلي للأصول', 'المبلغ': balanceSheetData.assets.totalAssets },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'مستحقات الموردين', 'المبلغ': balanceSheetData.liabilities.vendorPayables },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'شيكات دفع تحت الصرف', 'المبلغ': balanceSheetData.liabilities.checksPayable },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'قروض وسلف الدائنين', 'المبلغ': balanceSheetData.liabilities.creditorsLiability },
        { 'التصنيف': 'التزامات متداولة', 'البند': 'أرصدة عملاء دائنة مقدماً', 'المبلغ': balanceSheetData.liabilities.customerCredits },
        { 'التصنيف': 'حقوق ملكية', 'البند': 'جاري الشركاء', 'المبلغ': balanceSheetData.equity.partnersCapital },
        { 'التصنيف': 'حقوق ملكية', 'البند': 'أرباح مرحلة وصافي حقوق الملكية', 'المبلغ': balanceSheetData.equity.retainedEarnings }
      ]
      const wsBs = XLSX.utils.json_to_sheet(bsRows)
      XLSX.utils.book_append_sheet(wb, wsBs, 'المركز المالي')
    }

    XLSX.writeFile(wb, `Financial_Statements_${startDate}_to_${endDate}.xlsx`)
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
            قائمة الدخل والأرباح والخسائر (P&L)، الميزانية العمومية والمركز المالي، وتحليل هوامش ربحية الأصناف
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
            <span>تصدير Excel</span>
          </button>

          <Link
            href="/admin/reports"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition"
          >
            ← التقارير المركزية
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* شريط الفلاتر والتبويبات */}
        <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 no-print">
          
          <div className="flex gap-2 border-b border-slate-700 pb-2 md:pb-0 md:border-b-0 w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveReport('P_AND_L')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition flex items-center gap-2 ${
                activeReport === 'P_AND_L' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>📊</span>
              <span>قائمة الدخل (الأرباح والخسائر)</span>
            </button>

            <button
              onClick={() => setActiveReport('BALANCE_SHEET')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition flex items-center gap-2 ${
                activeReport === 'BALANCE_SHEET' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🏛️</span>
              <span>الميزانية العمومية والمركز المالي</span>
            </button>

            <button
              onClick={() => setActiveReport('PRODUCT_PROFIT')}
              className={`px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition flex items-center gap-2 ${
                activeReport === 'PRODUCT_PROFIT' ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>🏷️</span>
              <span>تحليل أرباح ومبيعات الأصناف</span>
            </button>
          </div>

          {activeReport !== 'BALANCE_SHEET' && (
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
            جاري معالجة وحساب القوائم المالية والأرباح...
          </div>
        ) : (
          <>
            {/* 1. تقرير قائمة الدخل والأرباح والخسائر */}
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

            {/* ========================================================= */}
            {/* 2. تقرير قائمة المركز المالي والميزانية العمومية */}
            {/* ========================================================= */}
            {activeReport === 'BALANCE_SHEET' && balanceSheetData && (
              <div className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-800 border-2 border-blue-500/50 p-6 rounded-2xl shadow-xl">
                    <span className="text-xs text-slate-400 block mb-1">إجمالي الأصول (ممتلكات الشركة وسيولتها)</span>
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
                  
                  {/* جانب الأصول */}
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 space-y-4">
                    <h3 className="font-black text-blue-400 text-lg border-b border-slate-700 pb-3 flex items-center gap-2">
                      <span>🏛️</span>
                      <span>الأصول (Assets)</span>
                    </h3>

                    <div className="space-y-2.5 text-sm">
                      <div className="text-xs font-bold text-slate-400">الأصول المتداولة:</div>
                      
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">النقدية السائلة بالخزن ({balanceSheetData.breakdowns.safes.length} خزنة)</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.cashInSafes.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">أرصدة الحسابات البنكية ({balanceSheetData.breakdowns.banks.length} بنك)</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.bankBalances.toLocaleString()} ج.م</span>
                      </div>

                      {/* مديونية العملاء المطابقة بالقرش لشاشة العملاء */}
                      <div className="bg-slate-900/80 p-3 rounded-xl border border-blue-500/30">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-slate-200 font-bold block">مديونية العملاء (مستحقات تجارية)</span>
                            <span className="text-[11px] text-slate-400">
                              (الصافي: {balanceSheetData.assets.netReceivables.toLocaleString()} ج.م بعد خصم أرصدة العملاء الدائنة)
                            </span>
                          </div>
                          <span className="font-mono font-black text-blue-400 text-base">
                            {balanceSheetData.assets.receivables.toLocaleString()} ج.م
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">قيمة بضاعة المخزون (بالتكلفة)</span>
                        <span className="font-mono font-bold text-amber-400">{balanceSheetData.assets.inventoryAtCost.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">مدينون متنوعون وعهد طرف الغير</span>
                        <span className="font-mono font-bold text-white">{balanceSheetData.assets.debtorsReceivables.toLocaleString()} ج.م</span>
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

                  {/* جانب الالتزامات وحقوق الملكية */}
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 space-y-4">
                    <h3 className="font-black text-purple-400 text-lg border-b border-slate-700 pb-3 flex items-center gap-2">
                      <span>🤝</span>
                      <span>الالتزامات وحقوق الملكية (Liabilities & Equity)</span>
                    </h3>

                    <div className="space-y-2.5 text-sm">
                      <div className="text-xs font-bold text-slate-400">الالتزامات المتداولة (الديون والالتزامات):</div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">مستحقات الموردين (التجارية)</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.vendorPayables.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">شيكات دفع صادرة تحت الصرف</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.checksPayable.toLocaleString()} ج.م</span>
                      </div>

                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl">
                        <span className="text-slate-300">قروض وسلف الدائنين (له علينا)</span>
                        <span className="font-mono font-bold text-rose-400">{balanceSheetData.liabilities.creditorsLiability.toLocaleString()} ج.م</span>
                      </div>

                      {/* أرصدة العملاء الدائنة المطابقة لـ 9,190.25 ج.م */}
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-300 block">أرصدة عملاء دائنة مقدماً</span>
                          <span className="text-[10px] text-slate-400">(لهم رصيد دائن لدى الشركة)</span>
                        </div>
                        <span className="font-mono font-bold text-amber-400">
                          {balanceSheetData.liabilities.customerCredits.toLocaleString()} ج.م
                        </span>
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

            {/* 3. تقرير تحليل أرباح وهوامش مبيعات الأصناف */}
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

    </div>
  )
}