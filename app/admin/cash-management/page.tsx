'use client'

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  getPayments, 
  updatePayment, 
  deletePayment, 
  getSafesWithBalances, 
  createSafe 
} from '@/app/admin-actions';
import { getCustomers } from '@/app/actions';
import { 
  PencilIcon, 
  TrashIcon, 
  LockClosedIcon 
} from '@heroicons/react/24/solid';
import { 
  BanknotesIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon, 
  ArrowPathRoundedSquareIcon,
  PlusCircleIcon
} from '@heroicons/react/24/outline';

const typeStyles: { [key: string]: { badge: string; text: string; icon: React.ElementType } } = {
    IN: { badge: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40", text: "قبض وارد", icon: ArrowDownTrayIcon },
    PAYMENT_COLLECTION: { badge: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40", text: "تحصيل أوردر", icon: ArrowDownTrayIcon },
    OUT: { badge: "bg-rose-500/20 text-rose-300 border border-rose-500/40", text: "صرف صادر", icon: ArrowUpTrayIcon },
    TRANSFER: { badge: "bg-blue-500/20 text-blue-300 border border-blue-500/40", text: "تحويل بين خزن", icon: ArrowPathRoundedSquareIcon },
};

export default function CashManagementPage() {
    const [payments, setPayments] = useState<any[]>([]);
    const [safes, setSafes] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // الفلاتر
    const [selectedSafeId, setSelectedSafeId] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // مودال إنشاء خزنة جديدة
    const [showCreateSafeModal, setShowCreateSafeModal] = useState(false);
    const [newSafeName, setNewSafeName] = useState('');
    const [isCreatingSafe, setIsCreatingSafe] = useState(false);

    // مودال تعديل الحركة
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

    useEffect(() => {
        fetchData();
        getCustomers().then(setCustomers);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [resPayments, resSafes] = await Promise.all([
          getPayments(),
          getSafesWithBalances()
        ]);

        if (resPayments.success) setPayments(resPayments.data || []);
        if (resSafes.success) setSafes(resSafes.safes || []);

        setLoading(false);
    };

    // إنشاء خزنة جديدة
    const handleCreateSafe = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newSafeName.trim()) return alert('اسم الخزنة مطلوب');

      setIsCreatingSafe(true);
      const res = await createSafe(newSafeName.trim());
      setIsCreatingSafe(false);

      if (res.success && res.safe) {
        alert('✅ تم إنشاء الخزنة بنجاح');
        setShowCreateSafeModal(false);
        setNewSafeName('');
        setSelectedSafeId(res.safe.id);
        fetchData();
      } else {
        alert('❌ خطأ: ' + res.error);
      }
    };

    // تعديل حركة نقدية
    const handleEdit = (payment: any) => {
        if (payment.isDownPayment) return;
        setEditingPayment({ ...payment });
    };

    const handleDelete = async (id: string, isDownPayment: boolean) => {
        if (isDownPayment) return;
        if (confirm('هل أنت متأكد من حذف هذه الحركة النقدية؟')) {
            await deletePayment(id);
            fetchData();
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPayment) return;

        setIsUpdatingPayment(true);
        await updatePayment(editingPayment.id, {
            amount: editingPayment.amount,
            description: editingPayment.description,
            type: editingPayment.type,
            currency: editingPayment.currency,
            safeId: editingPayment.safeId,
            targetSafeId: editingPayment.targetSafeId,
            customerId: editingPayment.customerId,
        });
        setIsUpdatingPayment(false);
        setEditingPayment(null);
        fetchData();
    };

    // فلترة السجلات لايف (بحث فوري + خزنة + نوع + تواريخ)
    const filteredPayments = useMemo(() => {
      return payments.filter(p => {
        // 1. فلتر الخزنة
        if (selectedSafeId !== 'ALL') {
          const matchSource = p.safeId === selectedSafeId;
          const matchTarget = p.targetSafeId === selectedSafeId;
          if (!matchSource && !matchTarget) return false;
        }

        // 2. فلتر نوع الحركة
        if (typeFilter !== 'ALL') {
          if (typeFilter === 'IN' && p.type !== 'IN' && p.type !== 'PAYMENT_COLLECTION') return false;
          if (typeFilter === 'OUT' && p.type !== 'OUT') return false;
          if (typeFilter === 'TRANSFER' && p.type !== 'TRANSFER') return false;
        }

        // 3. فلتر التواريخ
        if (startDate) {
          const pDate = new Date(p.createdAt);
          if (pDate < new Date(startDate + 'T00:00:00')) return false;
        }
        if (endDate) {
          const pDate = new Date(p.createdAt);
          if (pDate > new Date(endDate + 'T23:59:59.999')) return false;
        }

        // 4. البحث اللايف
        if (searchTerm.trim() !== '') {
          const q = searchTerm.toLowerCase().trim();
          const matchReceipt = p.receiptNo?.toString().includes(q);
          const matchDesc = p.description?.toLowerCase().includes(q);
          const matchCust = p.customer?.name?.toLowerCase().includes(q);
          const matchVendor = p.vendor?.name?.toLowerCase().includes(q);
          const matchUser = p.user?.name?.toLowerCase().includes(q);
          const matchSafe = p.safe?.name?.toLowerCase().includes(q);
          const matchTarget = p.targetSafe?.name?.toLowerCase().includes(q);
          const matchAmt = p.amount?.toString().includes(q);

          if (!matchReceipt && !matchDesc && !matchCust && !matchVendor && !matchUser && !matchSafe && !matchTarget && !matchAmt) {
            return false;
          }
        }

        return true;
      });
    }, [payments, selectedSafeId, typeFilter, startDate, endDate, searchTerm]);

    // حساب إجماليات السجلات المعروضة
    const displayTotals = useMemo(() => {
      let totalIn = 0;
      let totalOut = 0;

      filteredPayments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') {
          totalIn += (Number(p.amount) || 0);
        } else if (p.type === 'OUT') {
          totalOut += (Number(p.amount) || 0);
        } else if (p.type === 'TRANSFER') {
          // إذا كانت التصفية لخزنة معينة
          if (selectedSafeId !== 'ALL') {
            if (p.safeId === selectedSafeId) totalOut += p.amount;
            if (p.targetSafeId === selectedSafeId) totalIn += p.amount;
          }
        }
      });

      return {
        totalIn: Math.round(totalIn * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
        netCash: Math.round((totalIn - totalOut) * 100) / 100
      };
    }, [filteredPayments, selectedSafeId]);

    // مسح الفلاتر
    const handleResetFilters = () => {
      setSelectedSafeId('ALL');
      setTypeFilter('ALL');
      setSearchTerm('');
      setStartDate('');
      setEndDate('');
    };

    const hasActiveFilters = selectedSafeId !== 'ALL' || typeFilter !== 'ALL' || searchTerm !== '' || startDate !== '' || endDate !== '';

    if (loading) {
        return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold text-lg">
            جاري تحميل سجلات الخزينة والسيولة النقدية...
          </div>
        );
    }

    return (
        <div dir="rtl" className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans pb-36">
            
            {/* Header */}
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🏦</span>
                    <h1 className="text-2xl md:text-3xl font-black text-white">إدارة الخزينة وحركات النقدية</h1>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">
                    إنشاء الخزن، متابعة الأرصدة، البحث المباشر في السجلات وتصفية سندات القبض والصرف
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => setShowCreateSafeModal(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>إنشاء خزنة جديدة</span>
                  </button>

                  <Link
                    href="/payments/new"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5"
                  >
                    <span>💰</span>
                    <span>سند قبض / صرف جديد</span>
                  </Link>

                  <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition">
                    ← لوحة التحكم
                  </Link>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-6">

                {/* 1. كروت الخزائن المسجلة وأرصدتها الحالية (تحديد الخزنة) */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                      <span>🏦 الخزائن والمحافظ المسجلة</span>
                      <span className="text-xs text-slate-500">(اضغط على أي خزنة لتصفية سجلاتها فوراً)</span>
                    </h2>
                    
                    <button
                      onClick={() => setSelectedSafeId('ALL')}
                      className={`text-xs px-3 py-1 rounded-lg font-bold transition border ${
                        selectedSafeId === 'ALL'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      عرض جميع الخزن ({safes.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {safes.map(s => {
                      const isSelected = selectedSafeId === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSafeId(isSelected ? 'ALL' : s.id)}
                          className={`p-4 rounded-2xl cursor-pointer transition border relative shadow-md ${
                            isSelected
                              ? 'bg-slate-800 border-amber-500 ring-2 ring-amber-500/30'
                              : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-700/50 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-sm text-white truncate max-w-[120px]">{s.name}</span>
                            {isSelected && <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded">محددة</span>}
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 block">الرصيد الدفتري:</span>
                            <span className={`text-base font-black font-mono block ${s.balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {s.balance.toLocaleString()} <small className="text-[10px] font-normal text-slate-400">ج.م</small>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 2. شريط البحث والفلترة المتقدم (بحث لايف + فلتر التواريخ والنوع) */}
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg space-y-3">
                  
                  {/* البحث الحي */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="🔍 ابحث في حركات النقدية (برقم الإيصال، البيان، العميل، المورد، الموظف، المبلغ)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white font-bold focus:border-blue-500 outline-none"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="absolute left-3 top-3 text-slate-400 hover:text-white font-bold text-sm">✕</button>
                    )}
                  </div>

                  {/* الفلاتر */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    
                    {/* نوع الحركة */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">نوع الحركة:</label>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                      >
                        <option value="ALL">جميع الحركات</option>
                        <option value="IN">قبض وارد (تحصيلات)</option>
                        <option value="OUT">صرف صادر (مصروفات وسدادات)</option>
                        <option value="TRANSFER">تحويلات بين الخزن</option>
                      </select>
                    </div>

                    {/* من تاريخ */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">من تاريخ:</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                      />
                    </div>

                    {/* إلى تاريخ */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">إلى تاريخ:</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                      />
                    </div>

                    {/* تفريغ الفلاتر */}
                    <div>
                      <button
                        onClick={handleResetFilters}
                        disabled={!hasActiveFilters}
                        className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-xs transition"
                      >
                        إلغاء الفلاتر ↺
                      </button>
                    </div>

                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-400 pt-1 border-t border-slate-700/60">
                    <span>
                      الحركات المعروضة: <b className="text-amber-400">{filteredPayments.length}</b> من أصل {payments.length}
                    </span>
                    {selectedSafeId !== 'ALL' && (
                      <span className="text-amber-300 font-bold">
                        تصفية خاصة بـ: {safes.find(s => s.id === selectedSafeId)?.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. عرض الموبايل (Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
                  {filteredPayments.map(p => {
                    const TypeIcon = typeStyles[p.type]?.icon || BanknotesIcon;
                    return (
                      <div key={p.id} className={`bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3 shadow-md ${p.isDownPayment ? 'opacity-85' : ''}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-slate-400 block mb-1">#{p.receiptNo}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${typeStyles[p.type]?.badge || 'bg-slate-700 text-slate-300'}`}>
                              {typeStyles[p.type]?.text || p.type}
                            </span>
                          </div>
                          <span className="font-black font-mono text-xl text-white">
                            {Number(p.amount).toLocaleString()} <small className="text-xs text-slate-400">{p.currency || 'EGP'}</small>
                          </span>
                        </div>

                        <p className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                          {p.isDownPayment && <LockClosedIcon className='w-3.5 h-3.5 text-amber-400'/>}
                          <span>{p.description || 'بدون بيان'}</span>
                        </p>

                        <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-700/60">
                          <div>الخزنة: <b className="text-white">{p.safe?.name} {p.type === 'TRANSFER' && p.targetSafe ? `➔ ${p.targetSafe.name}` : ''}</b></div>
                          {p.customer && <div>العميل: <b className="text-blue-300">{p.customer.name}</b></div>}
                          {p.vendor && <div>المورد: <b className="text-purple-300">{p.vendor.name}</b></div>}
                          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            <span>بواسطة: {p.user?.name}</span>
                            <span>{new Date(p.createdAt).toLocaleDateString('ar-EG')}</span>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-700/60">
                          <button onClick={() => handleEdit(p)} disabled={p.isDownPayment} className="p-1.5 rounded-lg bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white disabled:opacity-40 text-xs font-bold">
                            تعديل ✏️
                          </button>
                          <button onClick={() => handleDelete(p.id, p.isDownPayment)} disabled={p.isDownPayment} className="p-1.5 rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-40 text-xs font-bold">
                            حذف 🗑️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 4. عرض الديسكتوب (Table) */}
                <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                  <table className="min-w-full text-right text-sm">
                    <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                      <tr>
                        <th className="p-3.5 w-20 text-center">الإيصال</th>
                        <th className="p-3.5 w-28">النوع</th>
                        <th className="p-3.5">البيان والتفاصيل</th>
                        <th className="p-3.5 text-center w-36">المبلغ</th>
                        <th className="p-3.5 w-40">الخزنة</th>
                        <th className="p-3.5 w-40">الطرف (عميل / مورد)</th>
                        <th className="p-3.5 w-32">الموظف</th>
                        <th className="p-3.5 w-28 text-center">التاريخ</th>
                        <th className="p-3.5 w-24 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {filteredPayments.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                            لا توجد حركات نقدية مطابقة للبحث أو الفلتر المحدد
                          </td>
                        </tr>
                      ) : (
                        filteredPayments.map(p => (
                          <tr key={p.id} className="hover:bg-slate-700/30 transition">
                            <td className="p-3.5 text-center font-mono font-bold text-xs text-slate-400">
                              #{p.receiptNo}
                            </td>

                            <td className="p-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${typeStyles[p.type]?.badge || 'bg-slate-700 text-slate-300'}`}>
                                {typeStyles[p.type]?.text || p.type}
                              </span>
                            </td>

                            <td className="p-3.5 font-medium text-white flex items-center gap-1.5">
                              {p.isDownPayment && <LockClosedIcon className='w-4 h-4 text-amber-400'/>}
                              <span>{p.description || '-'}</span>
                            </td>

                            <td className="p-3.5 text-center font-mono font-black text-base text-white">
                              {Number(p.amount).toLocaleString()} <small className="text-xs text-slate-400 font-normal">{p.currency || 'EGP'}</small>
                            </td>

                            <td className="p-3.5 text-slate-300 text-xs">
                              {p.safe?.name} {p.type === 'TRANSFER' && p.targetSafe ? `➔ ${p.targetSafe.name}` : ''}
                            </td>

                            <td className="p-3.5 text-xs">
                              {p.customer ? (
                                <span className="text-blue-300 font-bold">👤 {p.customer.name}</span>
                              ) : p.vendor ? (
                                <span className="text-purple-300 font-bold">🏪 {p.vendor.name}</span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>

                            <td className="p-3.5 text-slate-400 text-xs">{p.user?.name}</td>

                            <td className="p-3.5 text-center font-mono text-xs text-slate-400">
                              {new Date(p.createdAt).toLocaleDateString('ar-EG')}
                            </td>

                            <td className="p-3.5 text-center">
                              <div className="flex justify-center items-center gap-1.5">
                                <button
                                  onClick={() => handleEdit(p)}
                                  disabled={p.isDownPayment}
                                  className="p-1.5 rounded-lg bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition disabled:opacity-30"
                                  title="تعديل الحركة"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(p.id, p.isDownPayment)}
                                  disabled={p.isDownPayment}
                                  className="p-1.5 rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600 hover:text-white transition disabled:opacity-30"
                                  title="حذف الحركة"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

            </div>

            {/* الشريط الإحصائي السفلي الثابت */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t-2 border-slate-700 p-3 sm:p-4 shadow-2xl z-40 text-white">
              <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
                
                <div className="flex flex-wrap items-center justify-between w-full md:w-auto gap-4 md:gap-8">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">إجمالي المقبوضات (الوارد):</span>
                    <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                      +{displayTotals.totalIn.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
                    </span>
                  </div>

                  <div className="border-r border-slate-800 pr-4 md:pr-6">
                    <span className="text-[10px] text-slate-400 block font-bold">إجمالي المدفوعات (الصادر):</span>
                    <span className="text-xl sm:text-2xl font-black font-mono text-rose-400">
                      -{displayTotals.totalOut.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
                    </span>
                  </div>

                  <div className="border-r border-slate-800 pr-4 md:pr-6">
                    <span className="text-[10px] text-amber-400 block font-bold">صافي حركة النقدية للفترة:</span>
                    <span className={`text-xl sm:text-2xl font-black font-mono ${displayTotals.netCash >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {displayTotals.netCash.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchData}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold border border-slate-700 transition"
                  >
                    تحديث السجلات ⟳
                  </button>
                </div>

              </div>
            </div>

            {/* مودال إنشاء خزنة جديدة */}
            {showCreateSafeModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <span>🏦 إنشاء خزنة نقدية أو محفظة جديدة</span>
                  </h3>

                  <form onSubmit={handleCreateSafe} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">اسم الخزنة / المحفظة *</label>
                      <input
                        type="text"
                        required
                        value={newSafeName}
                        onChange={(e) => setNewSafeName(e.target.value)}
                        placeholder="مثال: خزنة المعرض 2، فودافون كاش 2..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 font-bold"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateSafeModal(false)}
                        className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingSafe}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                      >
                        {isCreatingSafe ? 'جاري الإنشاء...' : 'حفظ وإنشاء الخزنة ✅'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* مودال تعديل الحركة */}
            {editingPayment && (
                 <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                     <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-xl shadow-2xl">
                         <h2 className="text-lg font-bold mb-4 text-white border-b border-slate-800 pb-2">تعديل الحركة النقدية</h2>
                         <form onSubmit={handleUpdate} className="space-y-4">
                             <div className="grid grid-cols-2 gap-3">
                                 <div>
                                     <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ</label>
                                     <input type="number" step="0.01" value={editingPayment.amount} onChange={(e) => setEditingPayment({ ...editingPayment, amount: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-base outline-none"/>
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-slate-300 mb-1">نوع الحركة</label>
                                     <select value={editingPayment.type} onChange={(e) => setEditingPayment({ ...editingPayment, type: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none">
                                         <option value="IN">قبض وارد</option>
                                         <option value="OUT">صرف صادر</option>
                                         <option value="TRANSFER">تحويل بين خزن</option>
                                     </select>
                                 </div>
                             </div>

                             <div>
                                 <label className="block text-xs font-bold text-slate-300 mb-1">البيان والوصف</label>
                                 <textarea value={editingPayment.description} onChange={(e) => setEditingPayment({ ...editingPayment, description: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" rows={2}></textarea>
                             </div>

                             <div className="grid grid-cols-2 gap-3">
                                 <div>
                                     <label className="block text-xs font-bold text-slate-300 mb-1">الخزنة</label>
                                     <select value={editingPayment.safeId || ''} onChange={(e) => setEditingPayment({ ...editingPayment, safeId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none">
                                         <option value="">اختر الخزنة</option>
                                         {safes.map(safe => <option key={safe.id} value={safe.id}>{safe.name}</option>)}
                                     </select>
                                 </div>

                                 {editingPayment.type === 'TRANSFER' && (
                                     <div>
                                         <label className="block text-xs font-bold text-slate-300 mb-1">الخزنة المستهدفة</label>
                                         <select value={editingPayment.targetSafeId || ''} onChange={(e) => setEditingPayment({ ...editingPayment, targetSafeId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none">
                                             <option value="">اختر الخزنة المستهدفة</option>
                                             {safes.map(safe => <option key={safe.id} value={safe.id}>{safe.name}</option>)}
                                         </select>
                                     </div>
                                 )}

                                 <div>
                                     <label className="block text-xs font-bold text-slate-300 mb-1">العميل (إن وجد)</label>
                                     <select value={editingPayment.customerId || ''} onChange={(e) => setEditingPayment({ ...editingPayment, customerId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none">
                                         <option value="">بدون عميل</option>
                                         {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                     </select>
                                 </div>
                             </div>

                             <div className="flex gap-2 pt-3 border-t border-slate-800">
                                 <button type="button" onClick={() => setEditingPayment(null)} className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs">إلغاء</button>
                                 <button type="submit" disabled={isUpdatingPayment} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition">تحديث الحركة ✅</button>
                             </div>
                         </form>
                     </div>
                 </div>
            )}
        </div>
    );
}