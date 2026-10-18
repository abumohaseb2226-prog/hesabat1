'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getInventoryReport, getSafesList, getSafeLedger, getEmployeePerformance } from '@/app/report-actions';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

const exportToExcel = (data: any[], fileName: string) => {
    if (data.length === 0) {
        alert('لا توجد بيانات حالية في الجدول لتصديرها.');
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'INVENTORY' | 'SAFE' | 'EMPLOYEES'>('INVENTORY');
  
  return (
    <div className="min-h-screen print:min-h-0 bg-gray-50 p-4 md:p-6 print:p-0 print:bg-white font-sans" dir="rtl">
        <style jsx global>{`
        @media print {
          @page { margin: 5mm; }
          html, body, #__next, main {
            height: max-content !important;
            min-height: 0 !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          nav, aside, header, footer, .print\:hidden { 
            display: none !important; 
          }
          * { box-shadow: none !important; }
        }
      `}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200 text-white">
            <span className="text-3xl">📊</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-gray-800 tracking-tight">التقارير والإحصائيات المركزية</h1>
            <p className="text-gray-400 text-sm mt-1 font-bold">مراقبة المخزون وكروت الأصناف، التدفقات النقدية، وتقييم الموظفين</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto print:hidden">
            <Link
              href="/admin/reports/financial"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-2xl font-black shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="text-xl">📈</span>
              <span>القوائم المالية والأرباح</span>
            </Link>

            <Link
              href="/admin/reports/bazaar"
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-4 rounded-2xl font-black shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="text-xl">🎪</span>
              <span>تقرير البازار</span>
            </Link>

            <button 
              onClick={() => {
                const event = new CustomEvent('download-excel');
                window.dispatchEvent(event);
              }}
              className="flex-1 md:flex-none bg-green-700 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-green-800 transition-all transform active:scale-95 flex items-center justify-center gap-3"
            >
                <span className="text-xl">📄</span>
                <span>تحميل Excel</span>
            </button>

            <button 
              onClick={() => window.print()} 
              className="flex-1 md:flex-none bg-slate-900 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-black transition-all transform active:scale-95 flex items-center justify-center gap-3"
            >
                <span className="text-xl">🖨️</span>
                <span>طباعة التقرير</span>
            </button>
        </div>
      </div>

      <div className="flex gap-2 mb-8 border-b border-gray-200 print:hidden overflow-x-auto pb-2 scrollbar-hide">
        <button 
            onClick={() => setActiveTab('INVENTORY')}
            className={`px-10 py-5 font-black whitespace-nowrap transition-all rounded-t-3xl flex items-center gap-3 ${activeTab === 'INVENTORY' ? 'bg-white border-t-4 border-blue-600 text-blue-700 shadow-[0_-4px_15px_rgba(0,0,0,0.08)]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}
        >
            <span className="text-2xl">📦</span>
            المخزون وحركة الأصناف (كروت الأصناف)
        </button>
        <button 
            onClick={() => setActiveTab('SAFE')}
            className={`px-10 py-5 font-black whitespace-nowrap transition-all rounded-t-3xl flex items-center gap-3 ${activeTab === 'SAFE' ? 'bg-white border-t-4 border-green-600 text-green-700 shadow-[0_-4px_15px_rgba(0,0,0,0.08)]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}
        >
            <span className="text-2xl">💰</span>
            دفتر أستاذ الخزينة
        </button>
        <button 
            onClick={() => setActiveTab('EMPLOYEES')}
            className={`px-10 py-5 font-black whitespace-nowrap transition-all rounded-t-3xl flex items-center gap-3 ${activeTab === 'EMPLOYEES' ? 'bg-white border-t-4 border-purple-600 text-purple-700 shadow-[0_-4px_15px_rgba(0,0,0,0.08)]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}
        >
            <span className="text-2xl">👥</span>
            أداء فريق المبيعات
        </button>
      </div>

      <div id="printable-area" className="bg-white p-4 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-50 print:min-h-0 print:border-none print:shadow-none print:p-0">
          {activeTab === 'INVENTORY' && <InventoryReportView />}
          {activeTab === 'SAFE' && <SafeLedgerView />}
          {activeTab === 'EMPLOYEES' && <EmployeePerformanceView />}
      </div>
    </div>
  );
}

function InventoryReportView() {
    const [data, setData] = useState<any[]>([]); 
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'COLOR' | 'MODEL'>('COLOR');
    const [showInitialStock, setShowInitialStock] = useState(true);
    const [showCurrentStock, setShowCurrentStock] = useState(true);
    const [isLinkedStagesActive, setIsLinkedStagesActive] = useState(false);
    
    // حالة كارت الصنف التفصيلي الكامل
    const [selectedStockCardItem, setSelectedStockCardItem] = useState<any | null>(null);

    // حالة تفاصيل البيع القديمة
    const [selectedHistory, setSelectedHistory] = useState<any[] | null>(null);
    const [selectedItemName, setSelectedItemName] = useState('');

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'modelNo', direction: 'asc' });

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const openHistory = (item: any) => {
        setSelectedHistory(item.history || []);
        setSelectedItemName(`${item.modelNo} (${item.color || 'تجميعي'})`);
    };

    const openStockCard = (item: any) => {
        setSelectedStockCardItem(item);
    };
    
    useEffect(() => {
        getInventoryReport().then(res => {
            if(res.success && res.data) { 
                setData(res.data); 
            } else {
                setData([]);
            }
            setLoading(false);
        });
    }, []);

    const getGroupedData = () => {
        const groups: any = {};
        data.forEach(item => {
            if (!groups[item.modelNo]) {
                groups[item.modelNo] = {
                    id: item.modelNo, 
                    modelNo: item.modelNo, 
                    vendor: item.vendor,
                    colors: [], 
                    initialStock: 0, 
                    totalPurchases: 0,
                    totalSold: 0, 
                    totalVendorReturns: 0,
                    currentStock: 0, 
                    totalCostValue: 0,
                    history: [],
                    movements: []
                };
            }
            const g = groups[item.modelNo];
            g.colors.push({ name: item.color, sold: item.totalSold, stock: item.currentStock });
            g.initialStock += item.initialStock;
            g.totalPurchases += item.totalPurchases || 0;
            g.totalSold += item.totalSold;
            g.totalVendorReturns += item.totalVendorReturns || 0;
            g.currentStock += item.currentStock;

            // حساب قيمة المخزون الحالي بالتكلفة لهذا الصنف
            const itemValue = (item.currentStock || 0) * (item.cost || 0);
            g.totalCostValue = (g.totalCostValue || 0) + itemValue;

            if (item.history) g.history.push(...item.history);
            if (item.movements) g.movements.push(...item.movements);
        });
        return Object.values(groups);
    };

    let displayData = viewMode === 'COLOR' ? [...data] : getGroupedData();

    if (searchTerm.trim() !== '') {
        displayData = displayData.filter((item: any) => {
            const term = searchTerm.toLowerCase();
            if (isLinkedStagesActive && !isNaN(Number(term))) {
                const num = parseInt(term);
                const suffix = (num % 100).toString().padStart(2, '0');
                let linked: string[] = [];
                if (num >= 300 && num <= 599) linked = ["3", "4", "5"].map(p => p + suffix);
                else if (num >= 600 && num <= 899) linked = ["6", "7", "8"].map(p => p + suffix);
                else if (num >= 1100 && num <= 1399) linked = ["11", "12", "13"].map(p => p + suffix);
                else if (num >= 2100 && num <= 2299) linked = ["21", "22"].map(p => p + suffix);
                else linked = [term];
                return linked.includes(item.modelNo.toString());
            }
            return item.modelNo.toLowerCase().includes(term) || item.vendor?.toLowerCase().includes(term) || (item.color && item.color.toLowerCase().includes(term));
        });
    }

    if (sortConfig !== null) {
        displayData.sort((a: any, b: any) => {
            if (sortConfig.key === 'totalSold' || sortConfig.key === 'currentStock' || sortConfig.key === 'totalPurchases') {
                const valA = Number(a[sortConfig.key]) || 0;
                const valB = Number(b[sortConfig.key]) || 0;
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (sortConfig.key === 'stockValue') {
                const valA = viewMode === 'COLOR' ? (a.currentStock * (a.cost || 0)) : (a.totalCostValue || 0);
                const valB = viewMode === 'COLOR' ? (b.currentStock * (b.cost || 0)) : (b.totalCostValue || 0);
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (sortConfig.key === 'modelNo') {
                const valA = String(a.modelNo || '');
                const valB = String(b.modelNo || '');
                let comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            }

            return 0;
        });
    }

    // الإجماليات اللحظية التي تتغير فورياً مع البحث اللايف
    const liveSummary = useMemo(() => {
        let initialStock = 0;
        let purchases = 0;
        let sales = 0;
        let vendorReturns = 0;
        let currentStock = 0;
        let currentStockValueAtCost = 0;

        displayData.forEach((item: any) => {
            initialStock += Number(item.initialStock) || 0;
            purchases += Number(item.totalPurchases) || 0;
            sales += Number(item.totalSold) || 0;
            vendorReturns += Number(item.totalVendorReturns) || 0;
            currentStock += Number(item.currentStock) || 0;

            if (viewMode === 'COLOR') {
                currentStockValueAtCost += (Number(item.currentStock) || 0) * (Number(item.cost) || 0);
            } else {
                currentStockValueAtCost += Number(item.totalCostValue) || 0;
            }
        });

        return {
            itemsCount: displayData.length,
            initialStock,
            purchases,
            sales,
            vendorReturns,
            currentStock,
            currentStockValueAtCost: Math.round(currentStockValueAtCost * 100) / 100
        };
    }, [displayData, viewMode]);

    return (
        <div className="space-y-6 print:space-y-0 print:mt-0 font-sans">
            
            {/* شريط الإحصائيات اللحظية التفاعلية */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">الرصيد الأولي (المعروض)</span>
                <span className="text-xl md:text-2xl font-black font-mono text-slate-200">
                  {liveSummary.initialStock.toLocaleString()} <small className="text-xs text-slate-400">قطعة</small>
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">{liveSummary.itemsCount} صنف مطابق</span>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">إجمالي المشتريات (وارد)</span>
                <span className="text-xl md:text-2xl font-black font-mono text-emerald-400">
                  +{liveSummary.purchases.toLocaleString()} <small className="text-xs text-slate-400">قطعة</small>
                </span>
                <span className="text-[10px] text-emerald-500/80 block mt-1">بضاعة واردة</span>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">صافي المبيعات (منصرف)</span>
                <span className="text-xl md:text-2xl font-black font-mono text-amber-400">
                  -{liveSummary.sales.toLocaleString()} <small className="text-xs text-slate-400">قطعة</small>
                </span>
                <span className="text-[10px] text-amber-500/80 block mt-1">مبيعات العملاء</span>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">الرصيد الفعلي الحالي</span>
                <span className={`text-xl md:text-2xl font-black font-mono ${liveSummary.currentStock < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {liveSummary.currentStock.toLocaleString()} <small className="text-xs text-slate-400">قطعة</small>
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">على الرف وبالمستودع</span>
              </div>

              <div className="bg-gradient-to-br from-purple-900/60 to-slate-900 text-white p-4 rounded-2xl shadow-sm border border-purple-500/40 col-span-2 md:col-span-1">
                <span className="text-[11px] text-purple-200 block mb-1 font-bold">قيمة المخزون الحالي (بالتكلفة)</span>
                <span className="text-xl md:text-2xl font-black font-mono text-purple-300">
                  {liveSummary.currentStockValueAtCost.toLocaleString()} <small className="text-xs text-purple-200 font-normal">ج.م</small>
                </span>
                <span className="text-[10px] text-purple-300/80 block mt-1">رأس مال البضاعة الحالية</span>
              </div>
            </div>

            {/* شريط الفلاتر والبحث */}
            <div className="flex flex-wrap gap-4 items-center justify-between print:hidden bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex gap-2 items-center flex-1 min-w-[300px]">
                    <input 
                        type="text" placeholder="🔍 بحث فوري (بالموديل، المورد، أو اللون) وتحديث الإجماليات لحظياً..." 
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 p-3 border-2 border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="bg-gray-100 text-gray-500 px-3 py-3 rounded-xl font-bold text-xs hover:bg-gray-200">مسح ✕</button>
                    )}
                    <button 
                        onClick={() => setIsLinkedStagesActive(!isLinkedStagesActive)}
                        className={`px-4 py-3 rounded-xl font-black border transition text-xs ${isLinkedStagesActive ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}
                    >
                        {isLinkedStagesActive ? 'الربط مفعل' : '⛓️ ربط المراحل'}
                    </button>
                </div>

                <div className="bg-gray-100 p-1.5 rounded-xl flex flex-wrap gap-1.5 items-center">
                    <button onClick={() => setViewMode('COLOR')} className={`px-4 py-2 rounded-lg font-bold text-xs transition ${viewMode === 'COLOR' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>الألوان</button>
                    <button onClick={() => setViewMode('MODEL')} className={`px-4 py-2 rounded-lg font-bold text-xs transition ${viewMode === 'MODEL' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>الموديلات</button>
                    <button onClick={() => setShowInitialStock(!showInitialStock)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${showInitialStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showInitialStock ? '👁️ إخفاء الأولي' : '🙈 إظهار الأولي'}
                    </button>
                    <button onClick={() => setShowCurrentStock(!showCurrentStock)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${showCurrentStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showCurrentStock ? '👁️ إخفاء الحالي' : '🙈 إظهار الحالي'}
                    </button>
                </div>
            </div>

            {/* الجدول الرئيسي الشامل لحركة الأصناف والمخزون */}
            <div className="overflow-x-auto rounded-[2rem] border border-gray-200 shadow-sm bg-white">
                <table className="w-full text-right border-collapse text-sm">
                    <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider">
                        <tr>
                            <th 
                                className="p-4 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('modelNo')}
                            >
                                كود الموديل {sortConfig?.key === 'modelNo' && (sortConfig.direction === 'asc' ? ' ↓' : ' ↑')}
                            </th>
                            <th className="p-4">المورد</th>
                            <th className="p-4">{viewMode === 'COLOR' ? 'اللون' : 'الألوان'}</th>
                            {showInitialStock && <th className="p-4 text-center">أولي (افتتاحي)</th>}
                            <th 
                                className="p-4 text-center cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('totalPurchases')}
                            >
                                وارد مشتريات (+)
                            </th>
                            <th 
                                className="p-4 text-center text-yellow-400 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('totalSold')}
                            >
                                صافي المباع (-)
                            </th>
                            <th className="p-4 text-center text-rose-400">مرتجع مورد (-)</th>
                            {showCurrentStock && 
                                <th 
                                    className="p-4 text-center cursor-pointer hover:bg-slate-800 transition-colors select-none bg-slate-800 text-emerald-400 font-bold"
                                    onClick={() => handleSort('currentStock')}
                                >
                                    الرصيد الفعلي الحالي {sortConfig?.key === 'currentStock' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                </th>
                            }
                            
                            {/* عمود قيمة المخزون الحالي بالتكلفة الجديد */}
                            <th 
                                className="p-4 text-center cursor-pointer hover:bg-slate-800 transition-colors select-none text-purple-300 font-bold bg-slate-950"
                                onClick={() => handleSort('stockValue')}
                            >
                                قيمة المخزون (بالتكلفة) {sortConfig?.key === 'stockValue' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                            </th>

                            <th className="p-4 text-center print:hidden">سجل الحركة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                          <tr><td colSpan={10} className="p-12 text-center text-gray-400 font-bold">جاري تحميل بيانات حركة المخزون...</td></tr>
                        ) : displayData.length === 0 ? (
                          <tr><td colSpan={10} className="p-12 text-center text-gray-400 font-bold">لا توجد أصناف مطابقة للبحث</td></tr>
                        ) : (
                          displayData.map((item: any) => {
                            const itemStockValue = viewMode === 'COLOR'
                              ? ((Number(item.currentStock) || 0) * (Number(item.cost) || 0))
                              : (Number(item.totalCostValue) || 0);

                            return (
                              <tr key={item.id + (item.color || '')} className="hover:bg-blue-50/40 transition-colors">
                                  <td className="p-4 font-black text-lg text-slate-900">{item.modelNo}</td>
                                  <td className="p-4 text-gray-500 font-bold text-xs">{item.vendor || '-'}</td>
                                  <td className="p-4">
                                      {viewMode === 'COLOR' ? (
                                          <span className="font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg text-xs">{item.color}</span>
                                      ) : (
                                          <div className="flex flex-wrap gap-1.5">
                                              {item.colors.map((c:any, i:number) => (
                                                  <div key={i} className="bg-gray-100 border px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                                      {c.name} ({c.stock} متاح)
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </td>

                                  {showInitialStock && <td className="p-4 text-center font-bold font-mono text-gray-400">{item.initialStock}</td>}
                                  
                                  {/* وارد المشتريات */}
                                  <td className="p-4 text-center font-bold font-mono text-emerald-600">
                                    {item.totalPurchases > 0 ? `+${item.totalPurchases}` : '-'}
                                  </td>

                                  {/* المباع */}
                                  <td className="p-4 text-center font-black">
                                      {item.totalSold > 0 ? (
                                          <button 
                                              onClick={() => openHistory(item)} 
                                              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-xl shadow-md transition active:scale-95 inline-flex items-center gap-1 font-mono text-sm"
                                              title="اضغط لعرض فواتير البيع"
                                          >
                                              <span>{item.totalSold}</span>
                                              <span className="text-[10px]">قطعة</span>
                                          </button>
                                      ) : (
                                          <span className="text-gray-300 font-mono">0</span>
                                      )}
                                  </td>

                                  {/* مرتجع الموردين */}
                                  <td className="p-4 text-center font-bold font-mono text-rose-500">
                                    {item.totalVendorReturns > 0 ? `-${item.totalVendorReturns}` : '-'}
                                  </td>

                                  {/* الرصيد الفعلي الحالي */}
                                  {showCurrentStock && (
                                    <td className={`p-4 text-center font-black font-mono text-xl bg-gray-50/60 ${item.currentStock < 0 ? 'text-red-500' : 'text-emerald-700'}`}>
                                      {item.currentStock}
                                    </td>
                                  )}

                                  {/* قيمة المخزون الحالي بسعر التكلفة */}
                                  <td className="p-4 text-center font-mono font-bold text-sm text-purple-900 bg-purple-50/40">
                                    {itemStockValue.toLocaleString()} ج.م
                                  </td>

                                  {/* زر كارت الصنف الكامل */}
                                  <td className="p-4 text-center print:hidden">
                                    <button
                                      onClick={() => openStockCard(item)}
                                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition shadow flex items-center justify-center gap-1 mx-auto"
                                      title="فتح كارت الصنف وتاريخ الحركة بالرصيد التراكمي"
                                    >
                                      <span>📋</span>
                                      <span>كارت الصنف</span>
                                    </button>
                                  </td>
                              </tr>
                            );
                          })
                        )}
                    </tbody>

                    {/* تذييل الجدول بالإجماليات المطابقة للبحث اللايف */}
                    {displayData.length > 0 && (
                      <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <tr>
                          <td colSpan={3} className="p-4 text-left font-black text-sm text-gray-800">
                            إجمالي الحركات المعروضة ({displayData.length} صنف):
                          </td>
                          {showInitialStock && (
                            <td className="p-4 text-center font-mono font-bold text-gray-600">
                              {liveSummary.initialStock.toLocaleString()}
                            </td>
                          )}
                          <td className="p-4 text-center font-mono font-bold text-emerald-600">
                            +{liveSummary.purchases.toLocaleString()}
                          </td>
                          <td className="p-4 text-center font-mono font-bold text-amber-600">
                            -{liveSummary.sales.toLocaleString()}
                          </td>
                          <td className="p-4 text-center font-mono font-bold text-rose-600">
                            -{liveSummary.vendorReturns.toLocaleString()}
                          </td>
                          {showCurrentStock && (
                            <td className="p-4 text-center font-mono font-black text-base text-emerald-700 bg-emerald-50/60">
                              {liveSummary.currentStock.toLocaleString()}
                            </td>
                          )}
                          <td className="p-4 text-center font-mono font-black text-base text-purple-900 bg-purple-100/60">
                            {liveSummary.currentStockValueAtCost.toLocaleString()} ج.م
                          </td>
                          <td className="p-4 print:hidden"></td>
                        </tr>
                      </tfoot>
                    )}
                </table>
            </div>

            {/* ========================================================================= */}
            {/* مودال كارت الصنف الكامل */}
            {/* ========================================================================= */}
            {selectedStockCardItem && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex justify-center items-center p-3 md:p-6" onClick={() => setSelectedStockCardItem(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-4xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col font-sans" onClick={e => e.stopPropagation()}>
                        
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">📋</span>
                                  <h3 className="font-black text-2xl">كارت صنف وسجل حركة المخزون</h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                                  <span className="bg-blue-600 px-3 py-1 rounded-lg font-bold">الموديل: {selectedStockCardItem.modelNo}</span>
                                  {selectedStockCardItem.color && <span className="bg-slate-800 border border-slate-700 px-3 py-1 rounded-lg font-bold">اللون: {selectedStockCardItem.color}</span>}
                                  <span className="text-slate-400">المورد: <b className="text-white">{selectedStockCardItem.vendor || '-'}</b></span>
                                  <span className="text-slate-400">التكلفة: <b className="text-emerald-400 font-mono">{selectedStockCardItem.cost} ج.م</b></span>
                                  <span className="text-slate-400">سعر البيع: <b className="text-amber-400 font-mono">{selectedStockCardItem.price} ج.م</b></span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedStockCardItem(null)} className="text-slate-400 hover:text-white text-3xl font-bold">✕</button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 bg-slate-100 border-b border-gray-200 text-xs">
                          <div className="bg-white p-3 rounded-xl border border-gray-200">
                            <span className="text-gray-500 block">رصيد أول المدة:</span>
                            <span className="font-mono font-black text-base text-gray-800">{selectedStockCardItem.initialStock} قطعة</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-gray-200">
                            <span className="text-gray-500 block">إجمالي الوارد (مشتريات):</span>
                            <span className="font-mono font-black text-base text-emerald-600">+{selectedStockCardItem.totalPurchases || 0} قطعة</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-gray-200">
                            <span className="text-gray-500 block">صافي المنصرف (مبيعات):</span>
                            <span className="font-mono font-black text-base text-amber-600">-{selectedStockCardItem.totalSold || 0} قطعة</span>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-xl text-white">
                            <span className="text-slate-400 block">الرصيد الفعلي الحالي:</span>
                            <span className="font-mono font-black text-lg text-emerald-400">{selectedStockCardItem.currentStock} قطعة</span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-900 text-slate-300 font-bold sticky top-0 uppercase">
                                    <tr>
                                        <th className="p-3">التاريخ والوقت</th>
                                        <th className="p-3">نوع الحركة</th>
                                        <th className="p-3">رقم المرجع / الفاتورة</th>
                                        <th className="p-3">الطرف (العميل / المورد)</th>
                                        <th className="p-3 text-center">السعر / التكلفة</th>
                                        <th className="p-3 text-center text-emerald-400 bg-slate-950 font-black">وارد (+)</th>
                                        <th className="p-3 text-center text-rose-400 bg-slate-950 font-black">منصرف (-)</th>
                                        <th className="p-3 text-center bg-blue-950 text-blue-300 font-black text-sm">الرصيد بعد الحركة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {selectedStockCardItem.movements?.map((m: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-blue-50/50 transition">
                                            <td className="p-3 text-gray-500 font-mono whitespace-nowrap">
                                              {new Date(m.date).toLocaleDateString('ar-EG')} - {new Date(m.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                            </td>

                                            <td className="p-3 font-bold">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                m.type.includes('وارد') || m.type.includes('افتتاحي') ? 'bg-emerald-100 text-emerald-800' :
                                                m.type.includes('مبيعات') ? 'bg-amber-100 text-amber-800' :
                                                m.type.includes('مرتجع لمورد') ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                                              }`}>
                                                {m.type}
                                              </span>
                                            </td>

                                            <td className="p-3 font-mono font-bold text-slate-800">{m.reference}</td>
                                            <td className="p-3 font-medium text-gray-700">{m.party}</td>
                                            <td className="p-3 text-center font-mono text-gray-600">{m.price ? `${m.price} ج.م` : '-'}</td>

                                            <td className="p-3 text-center font-mono font-black text-sm text-emerald-600 bg-emerald-50/40">
                                              {m.inQty > 0 ? `+${m.inQty}` : '-'}
                                            </td>

                                            <td className="p-3 text-center font-mono font-black text-sm text-rose-600 bg-rose-50/40">
                                              {m.outQty > 0 ? `-${m.outQty}` : '-'}
                                            </td>

                                            <td className={`p-3 text-center font-mono font-black text-base bg-blue-50/50 ${m.balanceAfter < 0 ? 'text-red-600' : 'text-blue-900'}`}>
                                              {m.balanceAfter}
                                            </td>
                                        </tr>
                                    ))}
                                    {(!selectedStockCardItem.movements || selectedStockCardItem.movements.length === 0) && (
                                      <tr><td colSpan={8} className="p-8 text-center text-gray-400">لا توجد حركات مسجلة لهذا الصنف</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs">
                          <span className="text-gray-500">إجمالي عدد الحركات المسجلة: <b>{selectedStockCardItem.movements?.length || 0}</b> حركة</span>
                          <button onClick={() => setSelectedStockCardItem(null)} className="bg-slate-900 hover:bg-black text-white px-6 py-2 rounded-xl font-bold transition">
                            إغلاق
                          </button>
                        </div>
                    </div>
                </div>
            )}

            {/* مودال تفاصيل البيع القديم */}
            {selectedHistory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4" onClick={() => setSelectedHistory(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl font-sans" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                            <h3 className="font-black text-xl">سجل فواتير مبيعات: {selectedItemName}</h3>
                            <button onClick={() => setSelectedHistory(null)} className="text-2xl">✕</button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-gray-50 text-gray-500 uppercase">
                                    <tr>
                                        <th className="p-3 border-b">التاريخ</th>
                                        <th className="p-3 border-b text-center">العميل</th>
                                        <th className="p-3 border-b text-center bg-blue-50 text-blue-600 font-black">الكمية المباعة</th>
                                        <th className="p-3 border-b text-left">سعر البيع</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedHistory.map((h: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-3 text-gray-400 font-mono">{new Date(h.date).toLocaleDateString('ar-EG')}</td>
                                            <td className="p-3 font-bold text-gray-700 text-center">{h.customer}</td>
                                            <td className="p-3 text-center font-black text-base text-blue-800 bg-blue-50/30">{h.quantity}</td>
                                            <td className="p-3 text-left font-mono font-bold text-emerald-600">{h.price} ج.م</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SafeLedgerView() {
    const getTodayDateString = () => new Date().toISOString().split('T')[0];
    const [safes, setSafes] = useState<any[]>([]);
    const [selectedSafe, setSelectedSafe] = useState('');
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [ledger, setLedger] = useState<any[]>([]);
    const [summaryGrouped, setSummaryGrouped] = useState<any>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getSafesList().then(data => { setSafes(data); if(data.length > 0) setSelectedSafe(data[0].id); });
    }, []);

    const fetchLedgerData = useCallback(async () => {
        if(!selectedSafe) return;
        setLoading(true);
        const res = await getSafeLedger(selectedSafe, startDate, endDate);
        if(res.success) { 
            setLedger(res.data || []); 
            setSummaryGrouped(res.summaryGrouped || {}); 
        }
        setLoading(false);
    }, [selectedSafe, startDate, endDate]);

    useEffect(() => { fetchLedgerData(); }, [fetchLedgerData]);

    useEffect(() => {
        const handleDownload = () => {
            const excelData = ledger.map(row => ({
                "التاريخ": new Date(row.date).toLocaleDateString('ar-EG'),
                "نوع الحركة": row.type,
                "البيان": row.description,
                "العملة": row.currency,
                "وارد": row.inAmount > 0 ? row.inAmount : '-',
                "صادر": row.outAmount > 0 ? row.outAmount : '-',
                "المستخدم": row.user
            }));
            exportToExcel(excelData, "Safe_Ledger_Report");
        };
        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [ledger]);

    const getCurrencyName = (code: string) => {
        const names: any = { 'EGP': 'جنيه مصري', 'USD': 'دولار أمريكي', 'SAR': 'ريال سعودي', 'KWD': 'دينار كويتي' };
        return names[code] || code;
    };

    return (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
            <h2 className="text-3xl font-black text-gray-800 border-b pb-6">دفتر الأستاذ الموحد للخزينة</h2>
            
            <div className="flex flex-wrap gap-4 items-end bg-slate-100/50 p-8 rounded-[2.5rem] border border-slate-200/50 shadow-inner print:hidden">
                <div className="flex-1 min-w-[250px]">
                    <label className="block text-[10px] font-black mb-3 text-slate-500 uppercase tracking-[0.2em]">اختر الخزنة المستهدفة</label>
                    <select value={selectedSafe} onChange={e => setSelectedSafe(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-[1.2rem] shadow-sm outline-none focus:ring-4 focus:ring-green-500/20 font-bold transition-all">
                        {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-slate-500">الفترة من</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-black mb-3 text-slate-500">الفترة إلى</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-[1.2rem] shadow-sm font-bold" />
                </div>
                <button onClick={fetchLedgerData} className="w-full sm:w-auto bg-green-600 text-white px-14 py-4 rounded-[1.2rem] font-black shadow-2xl shadow-green-200 hover:bg-green-700 hover:scale-105 transition-all flex items-center justify-center gap-3">
                    تحديث البيانات ⟳
                </button>
            </div>

            {loading ? (
              <div className="text-center py-32 text-gray-300 font-black text-xl animate-pulse italic">جاري جلب سجلات التدفق المالي...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                        {Object.entries(summaryGrouped).map(([curr, totals]: any) => (
                            <div key={curr} className="bg-white border-2 border-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl transform hover:-translate-y-2 transition-all duration-500">
                                <div className="bg-slate-900 text-white p-5 text-center font-black text-sm flex justify-center items-center gap-3">
                                    <span className="text-2xl">🏛️</span>
                                    <span>رصيد الـ {getCurrencyName(curr)}</span>
                                </div>
                                <div className="p-8 space-y-5">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-gray-400 uppercase tracking-widest">إجمالي الوارد:</span>
                                        <span className="text-green-600 font-black">+{totals.in.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-gray-400 uppercase tracking-widest">إجمالي الصادر:</span>
                                        <span className="text-red-600 font-black">-{totals.out.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-slate-50 pt-5 mt-3">
                                        <span className="font-black text-slate-800 uppercase text-[10px]">الصافي النهائي:</span>
                                        <span className="text-3xl font-black text-slate-900 tracking-tighter">{totals.balance.toLocaleString()} <small className="text-[10px] text-gray-400 font-normal">{curr}</small></span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="overflow-x-auto rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 bg-white">
                        <table className="w-full text-sm text-right border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="p-6 border-b border-slate-100">تاريخ السند</th>
                                    <th className="p-6 border-b border-slate-100">نوع الحركة</th>
                                    <th className="p-6 border-b border-slate-100">البيان والتفاصيل</th>
                                    <th className="p-6 border-b border-slate-100 text-center">العملة</th>
                                    <th className="p-6 border-b border-slate-100 text-green-700 bg-green-50/20">وارد (+)</th>
                                    <th className="p-6 border-b border-slate-100 text-red-700 bg-red-50/20">صادر (-)</th>
                                    <th className="p-6 border-b border-slate-100 text-slate-300 font-normal">المستلم</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {ledger.map((row: any) => (
                                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-6 whitespace-nowrap text-gray-400 font-mono text-xs">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-6 font-black text-xs">
                                            <span className={`px-4 py-2 rounded-2xl shadow-sm ${row.type.includes('وارد') || row.type.includes('قبض') ? 'bg-green-100 text-green-700 shadow-green-100' : 'bg-red-100 text-red-700 shadow-red-100'}`}>
                                                {row.type}
                                            </span>
                                        </td>
                                        <td className="p-6 text-slate-700 font-black max-w-[300px] truncate">{row.description}</td>
                                        <td className="p-6 text-center font-black text-blue-600 text-xl tracking-tighter">{row.currency}</td>
                                        <td className="p-6 font-black text-2xl text-green-700 bg-green-50/5">{row.inAmount > 0 ? row.inAmount.toLocaleString() : '-'}</td>
                                        <td className="p-6 font-black text-2xl text-red-700 bg-red-50/5">{row.outAmount > 0 ? row.outAmount.toLocaleString() : '-'}</td>
                                        <td className="p-6 text-xs text-slate-300 font-mono italic">{row.user}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function EmployeePerformanceView() {
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    useEffect(() => {
        getEmployeePerformance().then(res => {
            if (res.success) setData(res.data || []);
            setLoading(false);
        });
    }, []);

    const sortedData = [...data];
    if (sortConfig !== null) {
        sortedData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    useEffect(() => {
        const handleDownload = () => {
            const excelData = sortedData.map(emp => ({
                "اسم الموظف": emp.name,
                "كود الدخول": emp.code,
                "عدد الأوردرات": emp.orderCount,
                ...(userRole !== 'ACCOUNTANT' && { "إجمالي المبيعات": emp.totalSales }),
                "الخصومات الممنوحة": emp.totalDiscount
            }));
            exportToExcel(excelData, "Employees_Performance_Report");
        };
        window.addEventListener('download-excel', handleDownload);
        return () => window.removeEventListener('download-excel', handleDownload);
    }, [sortedData, userRole]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
    };

    if (loading) return <div className="text-center py-40 font-black text-slate-300 text-2xl animate-pulse italic">جاري تحليل كفاءة فريق المبيعات...</div>;

    return (
        <div className="space-y-12 animate-in zoom-in-95 duration-700">
            <div className="flex justify-between items-center border-b border-slate-50 pb-8">
                <h2 className="text-3xl font-black text-slate-700 tracking-tight">تقرير تقييم الكفاءة والإنتاجية</h2>
                <span className="bg-purple-100 text-purple-700 px-6 py-2 rounded-full text-xs font-black uppercase shadow-lg shadow-purple-50 tracking-[0.3em]">LIVE STATS</span>
            </div>
            
            <div className="overflow-x-auto rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 bg-white">
                <table className="w-full text-sm text-right border-collapse">
                    <thead className="bg-purple-600 text-white font-black uppercase text-[10px] tracking-widest">
                        <tr>
                            <th className="p-8">اسم الموظف</th>
                            <th className="p-8 text-purple-200">كود الدخول</th>
                            <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('orderCount')}>
                                عدد الأوردرات {sortConfig?.key === 'orderCount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            {userRole !== 'ACCOUNTANT' && 
                                <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('totalSales')}>
                                    إجمالي المبيعات {sortConfig?.key === 'totalSales' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                            }
                            <th className="p-8 cursor-pointer hover:bg-purple-700 transition-all" onClick={() => handleSort('totalDiscount')}>
                                الخصومات الممنوحة {sortConfig?.key === 'totalDiscount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {sortedData.map((emp: any) => (
                            <tr key={emp.id} className="hover:bg-purple-50 transition-all group border-b last:border-0">
                                <td className="p-8 font-black text-slate-900 text-2xl group-hover:text-purple-700 transition-colors">{emp.name}</td>
                                <td className="p-8 font-mono text-slate-300 text-xs tracking-tighter">{emp.code}</td>
                                <td className="p-8 text-center font-black text-4xl text-slate-800 tracking-tighter">{emp.orderCount}</td>
                                {userRole !== 'ACCOUNTANT' && 
                                    <td className="p-8 font-black text-green-700 text-3xl tracking-tighter">
                                        {emp.totalSales.toLocaleString()} <small className="text-xs font-normal">ج.م</small>
                                    </td>
                                }
                                <td className="p-8 font-black text-red-600 text-2xl tracking-tighter">
                                    {emp.totalDiscount.toLocaleString()} <small className="text-xs font-normal">ج.م</small>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}