'use client'

import { useState, useEffect, useCallback } from 'react';
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
    <div className="min-h-screen print:min-h-0 bg-gray-50 p-4 md:p-6 print:p-0 print:bg-white" dir="rtl">
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

          * {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200 text-white">
            <span className="text-3xl">📊</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-gray-800 tracking-tight">التقارير والإحصائيات المركزية</h1>
            <p className="text-gray-400 text-sm mt-1 font-bold">مراقبة المخزون، التدفقات النقدية، وتقييم الموظفين</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto print:hidden">
            {/* رابط القوائم المالية والأرباح الختامية */}
            <Link
              href="/admin/reports/financial"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-2xl font-black shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="text-xl">📈</span>
              <span>القوائم المالية والأرباح</span>
            </Link>

            {/* رابط تقرير البازار */}
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
            المخزون وحركة الأصناف
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
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const [data, setData] = useState<any[]>([]); 
    const [summary, setSummary] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'COLOR' | 'MODEL'>('COLOR');
    const [showInitialStock, setShowInitialStock] = useState(true);
    const [showCurrentStock, setShowCurrentStock] = useState(true);
    const [isLinkedStagesActive, setIsLinkedStagesActive] = useState(false);
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
    
    useEffect(() => {
        getInventoryReport().then(res => {
            if(res.success && res.data) { 
                setData(res.data); 
                setSummary(res.summary || {}); 
            } else {
                setData([]);
                setSummary({});
            }
            setLoading(false);
        });
    }, []);

    const getGroupedData = () => {
        const groups: any = {};
        data.forEach(item => {
            if (!groups[item.modelNo]) {
                groups[item.modelNo] = {
                    id: item.modelNo, modelNo: item.modelNo, vendor: item.vendor,
                    colors: [], initialStock: 0, totalSold: 0, currentStock: 0, currentValue: 0, history: []
                };
            }
            const g = groups[item.modelNo];
            g.colors.push({ name: item.color, sold: item.totalSold, stock: item.currentStock });
            g.initialStock += item.initialStock;
            g.totalSold += item.totalSold;
            g.currentStock += item.currentStock;
            g.currentValue += item.currentValue;
            if (item.history) {
                g.history.push(...item.history)
            }
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
            return item.modelNo.toLowerCase().includes(term) || item.vendor?.toLowerCase().includes(term);
        });
    }

    if (sortConfig !== null) {
        displayData.sort((a: any, b: any) => {
            if (sortConfig.key === 'totalSold' || sortConfig.key === 'currentStock') {
                const valA = Number(a[sortConfig.key]) || 0;
                const valB = Number(b[sortConfig.key]) || 0;
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            if (sortConfig.key === 'modelNo') {
                const valA = String(a.modelNo || '');
                const valB = String(b.modelNo || '');
                
                let comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                
                if (comparison === 0) {
                    const vendorA = String(a.vendor || '');
                    const vendorB = String(b.vendor || '');
                    comparison = vendorA.localeCompare(vendorB, undefined, { numeric: true, sensitivity: 'base' });
                }

                return sortConfig.direction === 'asc' ? comparison : -comparison;
            }

            return 0;
        });
    }

    return (
        <div className="space-y-8 print:space-y-0 print:mt-0">
            <div className="flex flex-wrap gap-4 items-center justify-between print:hidden">
                <div className="flex gap-2 items-center flex-1 min-w-[300px]">
                    <input 
                        type="text" placeholder="ابحث بالموديل أو المورد..." 
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 p-4 border rounded-2xl outline-none"
                    />
                    <button 
                        onClick={() => setIsLinkedStagesActive(!isLinkedStagesActive)}
                        className={`px-4 py-4 rounded-2xl font-black border ${isLinkedStagesActive ? 'bg-indigo-600 text-white' : 'bg-white text-gray-400'}`}
                    >
                        {isLinkedStagesActive ? ' الربط مفعل' : '⛓️ ربط المراحل'}
                    </button>
                </div>

                <div className="bg-gray-100 p-2 rounded-2xl flex flex-wrap gap-2 items-center shadow-inner print:hidden">
                    <button onClick={() => setViewMode('COLOR')} className={`px-6 py-3 rounded-xl ${viewMode === 'COLOR' ? 'bg-white shadow text-blue-700 font-bold' : ''}`}>الألوان</button>
                    <button onClick={() => setViewMode('MODEL')} className={`px-6 py-3 rounded-xl ${viewMode === 'MODEL' ? 'bg-white shadow text-blue-700 font-bold' : ''}`}>الموديلات</button>
                    <button onClick={() => setShowInitialStock(!showInitialStock)} className={`px-4 py-3 rounded-xl text-xs font-black border transition-all ${showInitialStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showInitialStock ? '👁️ إخفاء الأولي' : '🙈 إظهار الأولي'}
                    </button>
                    <button onClick={() => setShowCurrentStock(!showCurrentStock)} className={`px-4 py-3 rounded-xl text-xs font-black border transition-all ${showCurrentStock ? 'bg-white shadow text-blue-700 border-blue-100' : 'bg-transparent text-gray-400 border-transparent'}`}>
                        {showCurrentStock ? '👁️ إخفاء الحالي' : '🙈 إظهار الحالي'}
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-gray-100">
                <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                        <tr>
                            <th 
                                className="p-5 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('modelNo')}
                            >
                                كود الموديل {sortConfig?.key === 'modelNo' && (sortConfig.direction === 'asc' ? ' ↓' : ' ↑')}
                            </th>
                            <th className="p-5">المورد</th>
                            <th className="p-5">{viewMode === 'COLOR' ? 'اللون' : 'الألوان'}</th>
                            {showInitialStock && <th className="p-5">أولي (قطعة)</th>}
                            <th 
                                className="p-5 text-yellow-500 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                onClick={() => handleSort('totalSold')}
                            >
                                المباع (قطعة) {sortConfig?.key === 'totalSold' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                            </th>
                            {showCurrentStock && 
                                <th 
                                    className="p-5 cursor-pointer hover:bg-slate-800 transition-colors select-none"
                                    onClick={() => handleSort('currentStock')}
                                >
                                    حالي (قطعة) {sortConfig?.key === 'currentStock' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                                </th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((item: any) => (
                            <tr key={item.id + item.color} className="border-b hover:bg-gray-50 transition-colors">
                                <td className="p-5 font-black text-xl">{item.modelNo}</td>
                                <td className="p-5 text-gray-400 font-bold text-sm">{item.vendor || '-'}</td>
                                <td className="p-5">
                                    {viewMode === 'COLOR' ? (
                                        <span className="font-bold text-gray-600">{item.color}</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {item.colors.map((c:any, i:number) => (
                                                <div key={i} className="bg-gray-50 border px-2 py-1 rounded-lg text-[10px] font-bold">
                                                    {c.name} ({c.sold} قطعة)
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                {showInitialStock && <td className="p-5 font-bold text-gray-400">{item.initialStock}</td>}
                                <td className="p-5 text-yellow-600 font-black text-lg">
                                    {item.totalSold > 0 ? (
                                        <button 
                                            onClick={() => openHistory(item)} 
                                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-xl shadow-lg transition-all active:scale-95 flex flex-col items-center"
                                            title="اضغط لعرض تفاصيل البيع"
                                        >
                                            <span className="text-lg leading-none">{item.totalSold}</span>
                                            <span className="text-[9px] font-bold">قطعة</span>
                                        </button>
                                    ) : (
                                        <span className="text-gray-300">0</span>
                                    )}
                                </td>
                                {showCurrentStock && <td className={`p-5 font-black text-xl ${item.currentStock < 0 ? 'text-red-500' : 'text-green-600'}`}>{item.currentStock}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedHistory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4" onClick={() => setSelectedHistory(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                            <h3 className="font-black text-xl">سجل حركة البيع: {selectedItemName}</h3>
                            <button onClick={() => setSelectedHistory(null)} className="text-2xl">✕</button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto font-sans">
                            <table className="w-full text-right">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                                    <tr>
                                        <th className="p-3 border-b">التاريخ</th>
                                        <th className="p-3 border-b text-center">العميل</th>
                                        <th className="p-3 border-b text-center bg-blue-50 text-blue-600 font-black">الكمية (قطعة)</th>
                                        <th className="p-3 border-b text-left">السعر</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedHistory.map((h: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-3 text-xs text-gray-400">{new Date(h.date).toLocaleDateString('ar-EG')}</td>
                                            <td className="p-3 font-bold text-gray-700 text-center">{h.customer}</td>
                                            <td className="p-3 text-center font-black text-xl text-blue-800 bg-blue-50/30">{h.quantity}</td>
                                            <td className="p-3 text-left font-mono font-bold text-green-600">{h.price}</td>
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