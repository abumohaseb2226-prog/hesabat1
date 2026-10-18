'use client'

import { useState, useEffect, useRef } from 'react';
import { 
  getCustomers, 
  getSafes, 
  createPayment, 
  searchCustomers, 
  checkCustomerPhone, 
  getEmployees, 
  createEmployeePayment,
  checkHrConnection
} from '@/app/actions/index'; // 👈 استيراد صريح ومباشر من index.ts لمنع أي تداخل
import { getVendors } from '@/app/vendor-actions';
import { addCustomer } from '@/app/admin-actions';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Safe { id: string; name: string; }
interface Customer { id: string; name: string; phone?: string; code?: string; source?: string; }
interface Vendor { id: string; name: string; code: string; phone?: string | null; phone2?: string | null; address?: string | null; notes?: string | null; source?: string; _count?: { products: number }; }
interface Employee { id: string; name: string; }

export default function CashManagementPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN');
  const [payoutType, setPayoutType] = useState<'VENDOR' | 'EXPENSE' | 'EMPLOYEE'>('VENDOR');

  const [safes, setSafes] = useState<Safe[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EGP'); 
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingHr, setIsTestingHr] = useState(false);

  const [selectedSafeId, setSelectedSafeId] = useState('');       
  const [targetSafeId, setTargetSafeId] = useState('');           

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const customerListRef = useRef<HTMLDivElement>(null);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [showVendorList, setShowVendorList] = useState(false);
  const vendorListRef = useRef<HTMLDivElement>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', phone2: '', code: '', address: '' });
  const [isSavingCust, setIsSavingCust] = useState(false);

  useEffect(() => {
    getCustomers().then(setCustomerResults);
    getSafes().then((data: Safe[]) => {
      setSafes(data);
      if (data.length > 0) {
        const mainSafe = data.find(safe => safe.name === 'الخزنة الرئيسية');
        setSelectedSafeId(mainSafe?.id || data[0].id);
        if (data.length > 1) {
            const secondSafe = data.find(s => s.id !== (mainSafe ? mainSafe.id : data[0].id));
            if(secondSafe) setTargetSafeId(secondSafe.id);
        }
      }
    });
    getVendors().then(setVendors);
    getEmployees().then(res => {
      if (res.success && res.data) {
        setEmployees(res.data);
      }
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (customerListRef.current && !customerListRef.current.contains(event.target as Node)) setShowCustomerList(false);
      if (vendorListRef.current && !vendorListRef.current.contains(event.target as Node)) setShowVendorList(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      const delayDebounceFn = setTimeout(async () => {
        if (customerSearchTerm.length > 0) {
            setIsSearchingCustomer(true);
            const results = await searchCustomers(customerSearchTerm);
            setCustomerResults(results);
            setIsSearchingCustomer(false);
        } else { getCustomers().then(setCustomerResults); }
      }, 300);
      return () => clearTimeout(delayDebounceFn);
  }, [customerSearchTerm]);

  // فحص الاتصال المباشر بتطبيق الحضور والانصراف
  const handleTestHr = async () => {
    setIsTestingHr(true);
    const test = await checkHrConnection();
    setIsTestingHr(false);

    if (test.success) {
      alert(`✅ الاتصال ناجح ومباشر بسوبابيز الحضور (amrhh)!\n- عدد الموظفين المسجلين هناك: ${test.employeesCount} موظف.\n- آخر حركة مسجلة برقم #${test.lastTransaction?.id || 0}`);
    } else {
      alert(`❌ فشل الاتصال بقاعدة بيانات الحضور:\n${test.error}\n(تأكد من تثبيت مكتبة pg وإعادة تشغيل السيرفر).`);
    }
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newCust.name) return alert('الاسم مطلوب');
      setIsSavingCust(true);
      if (newCust.phone || newCust.phone2) {
          const checkRes = await checkCustomerPhone(newCust.phone || newCust.phone2);
          if (checkRes.exists && !window.confirm(`⚠️ رقم الهاتف مسجل للعميل: ${checkRes.name}. هل تريد الاستمرار؟`)) {
              setIsSavingCust(false);
              return;
          }
      }
      const res = await addCustomer({ ...newCust, source: 'QUICK' });
      if(res.success) {
          setSelectedCustomerId(res.customer.id);
          setCustomerSearchTerm(res.customer.name);
          setIsQuickAddOpen(false);
          setNewCust({ name: '', phone: '', phone2: '', code: '', address: '' });
      } else { alert("خطأ: " + res.error); }
      setIsSavingCust(false);
  };

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) return alert('المبلغ يجب أن يكون أكبر من صفر');
    if (!selectedSafeId) return alert('يجب اختيار الخزنة');
    
    setIsSaving(true);
    let res: { success: boolean; error?: string; message?: string };

    if (activeTab === 'OUT' && payoutType === 'EMPLOYEE') {
        if (!selectedEmployeeId) { setIsSaving(false); return alert('يجب اختيار الموظف'); }
        if (!description) { setIsSaving(false); return alert('يجب كتابة بيان الصرف للموظف'); }
        
        res = await createEmployeePayment({
            employeeId: selectedEmployeeId,
            amount: parseFloat(amount),
            description: description,
            safeId: selectedSafeId,
            transactionDate: new Date(paymentDate)
        }, session?.user?.image as string);
    
    } else {
        if (activeTab === 'IN' && !selectedCustomerId) { setIsSaving(false); return alert('يجب اختيار العميل'); }
        if (activeTab === 'OUT' && payoutType === 'VENDOR' && !selectedVendorId) { setIsSaving(false); return alert('يجب اختيار المورد'); }
        if (activeTab === 'OUT' && payoutType === 'EXPENSE' && !description) { setIsSaving(false); return alert('يجب كتابة بيان المصروف'); }
        if (activeTab === 'TRANSFER' && selectedSafeId === targetSafeId) { setIsSaving(false); return alert('لا يمكن التحويل لنفس الخزنة'); }
        if (activeTab === 'TRANSFER' && !description) { setIsSaving(false); return alert('يجب كتابة بيان التحويل'); }
        
        let finalDescription = description;
        if (!finalDescription) {
            if (activeTab === 'IN') finalDescription = `تحصيل من العميل: ${customerResults.find(c => c.id === selectedCustomerId)?.name || ''}`;
            else if (activeTab === 'OUT' && payoutType === 'VENDOR') finalDescription = `دفع للمورد: ${vendors.find(v => v.id === selectedVendorId)?.name || ''}`;
        }

        res = await createPayment({
            type: activeTab,
            customerId: activeTab === 'IN' ? selectedCustomerId : undefined,
            vendorId: activeTab === 'OUT' && payoutType === 'VENDOR' ? selectedVendorId : undefined,
            amount: parseFloat(amount),
            currency: currency, 
            safeId: selectedSafeId,
            targetSafeId: activeTab === 'TRANSFER' ? targetSafeId : undefined,
            description: finalDescription,
            isExpense: activeTab === 'OUT' && payoutType === 'EXPENSE',
            paymentDate: paymentDate,
        }, session?.user?.image as string);
    }

    if (res.success) { 
      alert(res.message || '✅ تمت العملية بنجاح'); 
      setAmount('');
      setDescription('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setSelectedCustomerId('');
      setCustomerSearchTerm('');
      setSelectedVendorId('');
      setVendorSearchTerm('');
      setSelectedEmployeeId('');
    } else {
      alert('❌ خطأ: ' + (res.error || 'حدث خطأ أثناء الحفظ'));
    }
    setIsSaving(false);
  };

  const selectedVendor = vendors.find(v => v.id === selectedVendorId);
  const selectedCustomer = customerResults.find(c => c.id === selectedCustomerId);

  const getButtonColor = () => {
    if (activeTab === 'IN') return 'bg-green-600 hover:bg-green-700';
    if (activeTab === 'OUT') {
      if (payoutType === 'EMPLOYEE') return 'bg-teal-600 hover:bg-teal-700';
      if (payoutType === 'VENDOR') return 'bg-purple-600 hover:bg-purple-700';
      return 'bg-orange-500 hover:bg-orange-600';
    }
    return 'bg-blue-600 hover:bg-blue-700';
  };

  const getButtonLabel = () => {
    if (isSaving) return 'جاري الحفظ والترحيل...';
    if (activeTab === 'IN') return '💾 حفظ سند قبض';
    if (activeTab === 'OUT') {
      if (payoutType === 'VENDOR') return '💾 حفظ سند دفع للمورد';
      if (payoutType === 'EMPLOYEE') return '💾 حفظ وترحيل صرف لموظف 🔗';
      return '💾 حفظ سند مصروفات';
    }
    return '💾 حفظ عملية التحويل';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans" dir="rtl">
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">💰 إدارة النقدية والخزينة</h1>
            
            <div className="flex gap-2 mb-6 bg-white p-2 rounded-xl shadow-sm">
                <button onClick={() => setActiveTab('IN')} className={`flex-1 py-3 font-bold rounded-lg transition ${ activeTab === 'IN' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200' }`}>📥 قبض</button>
                <button onClick={() => setActiveTab('OUT')} className={`flex-1 py-3 font-bold rounded-lg transition ${ activeTab === 'OUT' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200' }`}>📤 صرف</button>
                <button onClick={() => setActiveTab('TRANSFER')} className={`flex-1 py-3 font-bold rounded-lg transition ${ activeTab === 'TRANSFER' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200' }`}>🔄 تحويل</button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm space-y-6">
                
                {activeTab === 'IN' && (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                    <h3 className="text-green-800 font-bold mb-3 flex items-center gap-2"><span className="text-2xl">📥</span><span>سند قبض من عميل</span></h3>
                    <div className="relative animate-fade-in" ref={customerListRef}>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-sm font-bold text-green-800">العميل</label>
                            <button onClick={() => setIsQuickAddOpen(true)} className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded font-bold hover:bg-green-300">➕ عميل جديد</button>
                        </div>
                        <input type="text" placeholder="ابحث باسم العميل أو الهاتف..." value={customerSearchTerm} onChange={(e) => { setCustomerSearchTerm(e.target.value); setShowCustomerList(true); }} onFocus={() => setShowCustomerList(true)} className="w-full p-3 border-2 border-green-300 rounded-lg bg-white text-lg outline-none focus:border-green-500" />
                        {isSearchingCustomer && <span className="absolute left-3 top-10 text-gray-400 text-xs">جاري البحث...</span>}
                        {showCustomerList && (
                            <div className="absolute top-full left-0 right-0 bg-white border-2 border-green-200 z-50 max-h-60 overflow-y-auto shadow-xl rounded-b-lg">
                                {customerResults.map(c => (
                                    <div key={c.id} onClick={() => { setSelectedCustomerId(c.id); setCustomerSearchTerm(c.name); setShowCustomerList(false); }} className={`p-3 hover:bg-green-50 cursor-pointer border-b ${c.source === 'QUICK' ? 'bg-purple-50' : ''}`}><div className="font-bold">{c.name} {c.source === 'QUICK' && '✨'}</div><div className="text-xs text-gray-500">{c.phone} | {c.code}</div></div>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedCustomer && <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded-lg text-sm"><span className="font-bold text-green-800">✓ العميل: </span><span>{selectedCustomer.name}</span><span className="text-xs text-gray-600 mr-2">({selectedCustomer.code})</span></div>}
                  </div>
                )}

                {activeTab === 'OUT' && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-red-800 font-bold flex items-center gap-2"><span className="text-2xl">📤</span><span>سند صرف</span></h3>
                    <div>
                      <label className="text-sm font-bold text-red-800 block mb-2">نوع الصرف:</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => { setPayoutType('VENDOR'); setDescription(''); }} className={`p-3 rounded-lg font-bold text-sm transition ${ payoutType === 'VENDOR' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border' }`}>🏪 دفع لمورد</button>
                        <button type="button" onClick={() => { setPayoutType('EMPLOYEE'); setDescription(''); }} className={`p-3 rounded-lg font-bold text-sm transition ${ payoutType === 'EMPLOYEE' ? 'bg-teal-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border' }`}>👨‍💼 صرف لموظف (مربوط)</button>
                        <button type="button" onClick={() => { setPayoutType('EXPENSE'); setDescription(''); }} className={`p-3 rounded-lg font-bold text-sm transition ${ payoutType === 'EXPENSE' ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border' }`}>💸 مصروفات</button>
                      </div>
                    </div>

                    {payoutType === 'VENDOR' && (
                      <div className="relative animate-fade-in" ref={vendorListRef}>
                          <div className="flex justify-between items-center mb-1"><label className="text-sm font-bold text-purple-800">🏪 المورد</label><button onClick={() => router.push('/admin/vendors')} className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-bold hover:bg-purple-300">➕ مورد جديد</button></div>
                          <input type="text" placeholder="ابحث باسم المورد أو الكود..." value={vendorSearchTerm} onChange={(e) => { setVendorSearchTerm(e.target.value); setShowVendorList(true); if (e.target.value === '') setSelectedVendorId(''); }} onFocus={() => setShowVendorList(true)} className="w-full p-3 border-2 border-purple-300 rounded-lg bg-white text-lg outline-none focus:border-purple-500" />
                          {showVendorList && (
                              <div className="absolute top-full left-0 right-0 bg-white border-2 border-purple-200 z-50 max-h-60 overflow-y-auto shadow-xl rounded-b-lg">
                                  {vendors.filter(v => v.name.includes(vendorSearchTerm)).map(v => <div key={v.id} onClick={() => { setSelectedVendorId(v.id); setVendorSearchTerm(v.name); setShowVendorList(false); }} className="p-3 hover:bg-purple-50 cursor-pointer border-b"><div className="font-bold flex justify-between"><span>{v.name}</span><span className="text-xs text-gray-500">{v.code}</span></div><div className="text-xs text-gray-500">{v.phone || 'لا يوجد هاتف'}</div></div>)}
                              </div>
                          )}
                          {selectedVendor && <div className="mt-2 p-2 bg-purple-100 border border-purple-300 rounded-lg text-sm flex justify-between items-center"><div><span className="font-bold text-purple-800">✓ المورد: </span><span>{selectedVendor.name}</span><span className="text-xs text-gray-600 mr-2">({selectedVendor.code})</span></div><button onClick={() => { setSelectedVendorId(''); setVendorSearchTerm(''); }} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs font-bold">✕</button></div>}
                      </div>
                    )}

                    {payoutType === 'EMPLOYEE' && (
                        <div className="bg-teal-50 border-2 border-teal-200 rounded-lg p-3 animate-fade-in space-y-3">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                              <label className="text-sm font-bold text-teal-800 block">اختر الموظف *</label>
                              
                              {/* زر فحص الاتصال التفاعلي */}
                              <button
                                type="button"
                                onClick={handleTestHr}
                                disabled={isTestingHr}
                                className="text-[11px] bg-teal-200 hover:bg-teal-300 text-teal-900 font-bold px-3 py-1 rounded-lg border border-teal-400 transition flex items-center gap-1 shadow-sm"
                                title="اضغط للتأكد من الاتصال بسوبابيز الحضور وعرض عدد موظفيها"
                              >
                                <span>{isTestingHr ? '⏳' : '🔍'}</span>
                                <span>{isTestingHr ? 'جاري الفحص...' : 'فحص الاتصال بـ amrhh'}</span>
                              </button>
                            </div>

                            <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-full p-3 border-2 border-teal-300 rounded-lg bg-white text-lg font-bold outline-none focus:border-teal-500">
                                <option value="">-- اختر موظف --</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </select>
                            <label className="text-sm font-bold text-teal-800 block">البيان (مطلوب)</label>
                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: سلفة نقدية على الراتب..." className="w-full p-3 border-2 border-teal-300 rounded-lg outline-none h-20 focus:border-teal-500" />
                        </div>
                    )}

                    {payoutType === 'EXPENSE' && (
                      <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3">
                        <label className="text-sm font-bold text-orange-800 block mb-2">💸 بيان المصروف (مطلوب)</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: إيجار المحل، فاتورة كهرباء، بوفيه..." className="w-full p-3 border-2 border-orange-300 rounded-lg bg-white outline-none focus:border-orange-500 h-24"/>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'TRANSFER' && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                    <h3 className="text-blue-800 font-bold mb-3 flex items-center gap-2"><span className="text-2xl">🔄</span><span>تحويل بين الخزنات</span></h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-blue-800 text-sm mb-1 font-bold">من خزنة</label><select value={selectedSafeId} onChange={(e) => setSelectedSafeId(e.target.value)} className="w-full p-3 border-2 border-blue-300 rounded-lg bg-white text-sm font-bold">{safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                      <div><label className="block text-blue-800 text-sm mb-1 font-bold">إلى خزنة</label><select value={targetSafeId} onChange={(e) => setTargetSafeId(e.target.value)} className="w-full p-3 border-2 border-blue-300 rounded-lg bg-white text-sm font-bold">{safes.filter(s => s.id !== selectedSafeId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    </div>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="بيان التحويل (مطلوب)" className="w-full mt-4 p-3 border-2 border-blue-300 rounded-lg outline-none h-20 focus:border-blue-500" />
                  </div>
                )}

                <div><label className="block text-gray-500 text-sm mb-1 font-bold">📅 التاريخ</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full p-3 border-2 rounded-lg bg-gray-50 text-lg font-bold outline-none focus:border-blue-500" /></div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2"><label className="block text-gray-500 text-sm mb-1 font-bold">💵 المبلغ</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full p-3 border-2 rounded-lg text-2xl font-bold outline-none focus:border-blue-500" /></div>
                    <div><label className="block text-gray-500 text-sm mb-1 font-bold">💱 العملة</label><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full p-3 border-2 rounded-lg bg-blue-50 text-lg font-bold outline-none"><option value="EGP">جنيه مصري</option><option value="USD">دولار أمريكي</option><option value="SAR">ريال سعودي</option><option value="KWD">دينار كويتي</option></select></div>
                </div>

                {activeTab !== 'TRANSFER' && (<div><label className="block text-gray-500 text-sm mb-1 font-bold">🏦 الخزنة</label><select value={selectedSafeId} onChange={(e) => setSelectedSafeId(e.target.value)} className="w-full p-3 border-2 rounded-lg bg-gray-50 text-lg">{safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>)}

                {activeTab !== 'TRANSFER' && payoutType !== 'EXPENSE' && payoutType !== 'EMPLOYEE' && (<div><label className="block text-gray-500 text-sm mb-1 font-bold">📝 البيان (اختياري)</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={ activeTab === 'IN' ? 'مثال: دفعة عن فاتورة رقم...' : 'مثال: دفعة عن فاتورة شراء رقم...' } className="w-full p-3 border-2 rounded-lg outline-none h-20 focus:border-blue-500" /></div>)}

                <button onClick={handleSave} disabled={isSaving} className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg text-white transition ${getButtonColor()} disabled:bg-gray-400 disabled:cursor-not-allowed`}>{getButtonLabel()}</button>
            </div>
        </div>

        {isQuickAddOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex justify-center items-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slide-up">
                  <h3 className="font-bold text-lg mb-4 border-b pb-2 text-center text-blue-900">➕ إضافة عميل جديد</h3>
                  <form onSubmit={handleQuickAddCustomer} className="space-y-4">
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">الاسم (مطلوب)</label><input type="text" value={newCust.name} onChange={e => setNewCust({...newCust, name: e.target.value})} className="w-full border-2 p-3 rounded-xl shadow-sm" required /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">الكود (تلقائي لو فارغ)</label><input type="text" value={newCust.code} onChange={e => setNewCust({...newCust, code: e.target.value})} className="w-full border-2 p-3 rounded-xl bg-gray-50" /></div>
                      <div className="grid grid-cols-2 gap-2"><div><label className="block text-xs font-bold text-gray-500 mb-1">هاتف 1</label><input type="text" value={newCust.phone} onChange={e => setNewCust({...newCust, phone: e.target.value})} className="w-full border-2 p-3 rounded-xl shadow-sm" /></div><div><label className="block text-xs font-bold text-gray-500 mb-1">هاتف 2</label><input type="text" value={newCust.phone2} onChange={e => setNewCust({...newCust, phone2: e.target.value})} className="w-full border-2 p-3 rounded-xl shadow-sm bg-yellow-50" /></div></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">العنوان</label><input type="text" value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} className="w-full border-2 p-3 rounded-xl" /></div>
                      <div className="flex gap-2 pt-2"><button type="button" onClick={() => setIsQuickAddOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-lg font-bold hover:bg-gray-200">إلغاء</button><button type="submit" disabled={isSavingCust} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700">حفظ واختيار ✅</button></div>
                  </form>
              </div>
          </div>
        )}
    </div>
  );
}