'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  getCustomers, 
  getSafes, 
  checkCustomerPhone, 
  getEmployees 
} from '@/app/actions/index';
import { getVendors } from '@/app/vendor-actions';
import { addCustomer, recordUnifiedPayment } from '@/app/admin-actions';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Safe { id: string; name: string; }
interface Customer { id: string; name: string; phone?: string | null; code?: string; }
interface Vendor { id: string; name: string; code: string; phone?: string | null; }
interface Employee { id: string; name: string; phone?: string | null; }

interface UnifiedParty {
  id: string;
  name: string;
  code?: string;
  phone?: string | null;
  partyType: 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE';
  typeLabel: 'عميل' | 'مورد' | 'موظف';
  badgeClass: string;
}

export default function CashManagementPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // نوع السند الأساسي: قبض أو صرف أو تحويل
  const [activeTab, setActiveTab] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN');

  // الخزائن
  const [safes, setSafes] = useState<Safe[]>([]);
  const [selectedSafeId, setSelectedSafeId] = useState('');       
  const [targetSafeId, setTargetSafeId] = useState('');           

  // البيانات المالية
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EGP'); 
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  // الكيانات الخام
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // الطرف المختار الموحد
  const [selectedParty, setSelectedParty] = useState<UnifiedParty | null>(null);
  const [partySearchTerm, setPartySearchTerm] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partyFilterType, setPartyFilterType] = useState<'ALL' | 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE'>('ALL');
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  // خيار المصروفات العامة (في حالة الصرف فقط بدون طرف محدد)
  const [isGeneralExpense, setIsGeneralExpense] = useState(false);

  // مودال الإضافة السريعة لعميل جديد
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', phone2: '', code: '', address: '' });
  const [isSavingCust, setIsSavingCust] = useState(false);

  useEffect(() => {
    Promise.all([
      getCustomers(),
      getVendors(),
      getEmployees(),
      getSafes()
    ]).then(([custs, vends, emps, safesData]) => {
      setCustomers(custs || []);
      setVendors(vends || []);
      if (emps?.success && emps.data) setEmployees(emps.data);
      else if (Array.isArray(emps)) setEmployees(emps);

      if (safesData && safesData.length > 0) {
        setSafes(safesData);
        const mainSafe = safesData.find((s: Safe) => s.name === 'الخزنة الرئيسية');
        setSelectedSafeId(mainSafe?.id || safesData[0].id);
        if (safesData.length > 1) {
          const secondSafe = safesData.find((s: Safe) => s.id !== (mainSafe ? mainSafe.id : safesData[0].id));
          if (secondSafe) setTargetSafeId(secondSafe.id);
        }
      }
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setShowPartyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // دمج كل الأطراف في قائمة واحدة موحدة بتمييز بصري
  const allParties = useMemo<UnifiedParty[]>(() => {
    const list: UnifiedParty[] = [];

    customers.forEach(c => {
      list.push({
        id: c.id,
        name: c.name,
        code: c.code,
        phone: c.phone,
        partyType: 'CUSTOMER',
        typeLabel: 'عميل',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300'
      });
    });

    vendors.forEach(v => {
      list.push({
        id: v.id,
        name: v.name,
        code: v.code,
        phone: v.phone,
        partyType: 'VENDOR',
        typeLabel: 'مورد',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300'
      });
    });

    employees.forEach(e => {
      list.push({
        id: e.id,
        name: e.name,
        phone: e.phone,
        partyType: 'EMPLOYEE',
        typeLabel: 'موظف',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-300'
      });
    });

    return list;
  }, [customers, vendors, employees]);

  // نتائج البحث الحي المصفاة
  const filteredParties = useMemo(() => {
    const q = partySearchTerm.trim().toLowerCase();
    return allParties.filter(p => {
      if (partyFilterType !== 'ALL' && p.partyType !== partyFilterType) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      );
    }).slice(0, 30);
  }, [allParties, partySearchTerm, partyFilterType]);

  const handleSelectParty = (party: UnifiedParty) => {
    setSelectedParty(party);
    setIsGeneralExpense(false);
    setShowPartyDropdown(false);
    setPartySearchTerm('');
  };

  const handleClearParty = () => {
    setSelectedParty(null);
    setPartySearchTerm('');
  };

  // تبديل نوع السند وإعادة ضبط الحقول
  const handleTabSwitch = (tab: 'IN' | 'OUT' | 'TRANSFER') => {
    setActiveTab(tab);
    setIsGeneralExpense(false);
  };

  // حفظ السند
  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return alert('المبلغ يجب أن يكون أكبر من صفر');
    }
    if (!selectedSafeId) {
      return alert('يجب تحديد الخزنة');
    }

    if (activeTab === 'TRANSFER') {
      if (!targetSafeId || selectedSafeId === targetSafeId) {
        return alert('يرجى اختيار خزنة مستهدفة مختلفة للتحويل');
      }
    } else {
      if (!selectedParty && !isGeneralExpense) {
        return alert('يرجى تحديد الطرف (عميل، مورد، أو موظف) أو اختيار مصروفات عامة');
      }
    }

    setIsSaving(true);

    const res = await recordUnifiedPayment({
      type: activeTab,
      partyType: isGeneralExpense ? 'EXPENSE' : (selectedParty ? selectedParty.partyType : 'EXPENSE'),
      partyId: selectedParty?.id,
      partyName: selectedParty?.name,
      amount: numAmount,
      currency,
      safeId: selectedSafeId,
      targetSafeId: activeTab === 'TRANSFER' ? targetSafeId : undefined,
      description: description.trim() || undefined,
      date: paymentDate
    }, session?.user?.image as string);

    setIsSaving(false);

    if (res.success) {
      alert(res.message);
      setAmount('');
      setDescription('');
      setSelectedParty(null);
      setIsGeneralExpense(false);
    } else {
      alert('❌ خطأ: ' + res.error);
    }
  };

  // حفظ عميل جديد سريع
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCust.name) return alert('الاسم مطلوب');
    setIsSavingCust(true);
    if (newCust.phone || newCust.phone2) {
      const checkRes = await checkCustomerPhone(newCust.phone || newCust.phone2);
      if (checkRes.exists && !window.confirm(`⚠️ رقم الهاتف مسجل للعميل: ${checkRes.name}. هل تريد الاستمرار؟`)) {
        setIsSavingCust(false);
        return;
      }
    }
    const res = await addCustomer({ ...newCust, source: 'QUICK' });
    if (res.success && res.customer) {
      const addedParty: UnifiedParty = {
        id: res.customer.id,
        name: res.customer.name,
        code: res.customer.code,
        phone: res.customer.phone,
        partyType: 'CUSTOMER',
        typeLabel: 'عميل',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300'
      };
      setCustomers(prev => [res.customer, ...prev]);
      setSelectedParty(addedParty);
      setIsQuickAddOpen(false);
      setNewCust({ name: '', phone: '', phone2: '', code: '', address: '' });
    } else {
      alert("خطأ: " + res.error);
    }
    setIsSavingCust(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans pb-32" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 flex items-center gap-2">
              <span>💰</span>
              <span>إدارة النقدية والخزينة</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">سندات القبض والدفع الموحدة للعملاء والموردين والموظفين</p>
          </div>

          <Link href="/admin/cash-management" className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl border border-blue-200 transition">
            ← سجل الخزينة
          </Link>
        </div>
        
        {/* أزرار التبديل الرئيسية: قبض / صرف / تحويل */}
        <div className="flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
          <button 
            onClick={() => handleTabSwitch('IN')} 
            className={`flex-1 py-3.5 font-black text-base rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'IN' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>📥</span>
            <span>قبض وارد</span>
          </button>

          <button 
            onClick={() => handleTabSwitch('OUT')} 
            className={`flex-1 py-3.5 font-black text-base rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'OUT' 
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>📤</span>
            <span>صرف صادر</span>
          </button>

          <button 
            onClick={() => handleTabSwitch('TRANSFER')} 
            className={`flex-1 py-3.5 font-black text-base rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'TRANSFER' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>🔄</span>
            <span>تحويل بين الخزن</span>
          </button>
        </div>

        {/* الصندوق التفاعلي للبيانات */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            
            {/* في حال القبض (IN) أو الصرف (OUT): اختيار الطرف الموحد */}
            {activeTab !== 'TRANSFER' && (
              <div className={`p-4 rounded-2xl border-2 transition-all ${
                activeTab === 'IN' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
              }`}>
                
                <div className="flex justify-between items-center mb-2">
                  <h3 className={`font-black text-sm flex items-center gap-1.5 ${
                    activeTab === 'IN' ? 'text-emerald-900' : 'text-rose-900'
                  }`}>
                    <span>{activeTab === 'IN' ? '📥' : '📤'}</span>
                    <span>
                      {activeTab === 'IN' 
                        ? 'سند قبض من (عميل / مورد / موظف)' 
                        : 'سند صرف إلى (مورد / عميل / موظف / مصروفات)'
                      }
                    </span>
                  </h3>

                  <div className="flex gap-1.5 items-center">
                    {activeTab === 'OUT' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsGeneralExpense(!isGeneralExpense);
                          setSelectedParty(null);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                          isGeneralExpense 
                            ? 'bg-orange-600 text-white border-orange-500' 
                            : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
                        }`}
                      >
                        {isGeneralExpense ? '✓ مصروفات عامة' : '💸 مصروفات عامة ونثريات'}
                      </button>
                    )}

                    <button 
                      type="button"
                      onClick={() => setIsQuickAddOpen(true)} 
                      className="text-xs bg-white text-blue-700 border border-blue-300 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-50 transition"
                    >
                      ➕ عميل جديد
                    </button>
                  </div>
                </div>

                {/* لو اختار مصروفات عامة بدون طرف */}
                {isGeneralExpense ? (
                  <div className="p-3 bg-orange-100/70 border border-orange-300 rounded-xl text-xs text-orange-950 font-bold flex justify-between items-center">
                    <span>💡 تم اختيار: <b>سند مصروفات عامة ونثريات (بدون ربط بطرف)</b></span>
                    <button 
                      type="button" 
                      onClick={() => setIsGeneralExpense(false)} 
                      className="text-red-600 hover:underline font-bold"
                    >
                      إلغاء ✕
                    </button>
                  </div>
                ) : (
                  /* البحث الموحد في كل الأطراف */
                  <div className="relative" ref={partyDropdownRef}>
                    
                    {/* فلاتر تصفية سريعة داخل البحث */}
                    <div className="flex gap-1 mb-2">
                      <button
                        type="button"
                        onClick={() => setPartyFilterType('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          partyFilterType === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'
                        }`}
                      >
                        الكل ({allParties.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartyFilterType('CUSTOMER')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          partyFilterType === 'CUSTOMER' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200'
                        }`}
                      >
                        العملاء ({customers.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartyFilterType('VENDOR')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          partyFilterType === 'VENDOR' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-200'
                        }`}
                      >
                        الموردين ({vendors.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartyFilterType('EMPLOYEE')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          partyFilterType === 'EMPLOYEE' ? 'bg-teal-600 text-white' : 'bg-white text-teal-700 border border-teal-200'
                        }`}
                      >
                        الموظفين ({employees.length})
                      </button>
                    </div>

                    {/* حقل البحث */}
                    <input 
                      type="text" 
                      placeholder="🔍 ابحث بالاسم، الكود، أو رقم الهاتف (عميل، مورد، موظف)..." 
                      value={partySearchTerm} 
                      onChange={(e) => { 
                        setPartySearchTerm(e.target.value); 
                        setShowPartyDropdown(true); 
                      }} 
                      onFocus={() => setShowPartyDropdown(true)} 
                      className="w-full p-3 border-2 border-gray-300 rounded-xl bg-white text-sm font-bold outline-none focus:border-blue-500 transition" 
                    />

                    {/* القائمة المنسدلة للنتائج مع الأوسمة الواضحة */}
                    {showPartyDropdown && filteredParties.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border-2 border-gray-200 z-50 max-h-64 overflow-y-auto shadow-2xl rounded-xl mt-1 divide-y divide-gray-100">
                        {filteredParties.map(party => (
                          <div 
                            key={`${party.partyType}-${party.id}`} 
                            onClick={() => handleSelectParty(party)} 
                            className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${party.badgeClass}`}>
                                {party.typeLabel}
                              </span>
                              <span className="font-bold text-gray-900 text-sm">{party.name}</span>
                            </div>

                            <div className="text-xs text-gray-500 font-mono">
                              {party.phone || party.code || '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* الطرف المختار مع وسامه */}
                    {selectedParty && (
                      <div className="mt-2.5 p-3 bg-white border-2 border-gray-300 rounded-xl shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${selectedParty.badgeClass}`}>
                            {selectedParty.typeLabel}
                          </span>
                          <div>
                            <span className="font-black text-gray-900 text-base">{selectedParty.name}</span>
                            {selectedParty.code && (
                              <span className="text-xs text-gray-500 font-mono mr-2">({selectedParty.code})</span>
                            )}
                          </div>
                        </div>

                        <button 
                          type="button" 
                          onClick={handleClearParty}
                          className="text-red-600 hover:bg-red-50 p-1 rounded-lg text-xs font-bold transition"
                          title="إلغاء الاختيار"
                        >
                          ✕ تغيير الطرف
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* في حال التحويل (TRANSFER): اختيار الخزنتين */}
            {activeTab === 'TRANSFER' && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-blue-900 font-black text-sm flex items-center gap-2">
                  <span>🔄</span>
                  <span>تحويل رصيد بين الخزن</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-blue-900 text-xs mb-1 font-bold">من خزنة (المصدر)</label>
                    <select 
                      value={selectedSafeId} 
                      onChange={(e) => setSelectedSafeId(e.target.value)} 
                      className="w-full p-2.5 border-2 border-blue-300 rounded-xl bg-white text-xs font-bold outline-none"
                    >
                      {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-blue-900 text-xs mb-1 font-bold">إلى خزنة (المستهدفة)</label>
                    <select 
                      value={targetSafeId} 
                      onChange={(e) => setTargetSafeId(e.target.value)} 
                      className="w-full p-2.5 border-2 border-blue-300 rounded-xl bg-white text-xs font-bold outline-none"
                    >
                      {safes.filter(s => s.id !== selectedSafeId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* تاريخ السند */}
            <div>
              <label className="block text-gray-600 text-xs mb-1 font-bold">📅 تاريخ العملية</label>
              <input 
                type="date" 
                value={paymentDate} 
                onChange={(e) => setPaymentDate(e.target.value)} 
                className="w-full p-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-base font-bold outline-none focus:border-blue-500" 
              />
            </div>
            
            {/* المبلغ والعملة */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-gray-600 text-xs mb-1 font-bold">💵 المبلغ</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0.00" 
                  className="w-full p-3 border-2 border-gray-200 rounded-xl text-2xl font-black font-mono outline-none focus:border-blue-500" 
                />
              </div>

              <div>
                <label className="block text-gray-600 text-xs mb-1 font-bold">💱 العملة</label>
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)} 
                  className="w-full p-3.5 border-2 border-gray-200 rounded-xl bg-gray-50 text-sm font-bold outline-none"
                >
                  <option value="EGP">جنيه مصري</option>
                  <option value="USD">دولار أمريكي</option>
                  <option value="SAR">ريال سعودي</option>
                  <option value="KWD">دينار كويتي</option>
                </select>
              </div>
            </div>

            {/* الخزنة (للقبض والصرف) */}
            {activeTab !== 'TRANSFER' && (
              <div>
                <label className="block text-gray-600 text-xs mb-1 font-bold">🏦 الخزنة المعنية</label>
                <select 
                  value={selectedSafeId} 
                  onChange={(e) => setSelectedSafeId(e.target.value)} 
                  className="w-full p-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-sm font-bold outline-none"
                >
                  {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* البيان والوصف */}
            <div>
              <label className="block text-gray-600 text-xs mb-1 font-bold">
                📝 البيان / ملاحظات (اختياري - سيتم التوليد تلقائياً إن تركته فارغاً)
              </label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="اكتب تفاصيل أو سبب العملية..." 
                className="w-full p-3 border-2 border-gray-200 rounded-xl outline-none text-xs focus:border-blue-500" 
                rows={2}
              />
            </div>

            {/* زر الحفظ التفاعلي */}
            <button 
              type="button"
              onClick={handleSave} 
              disabled={isSaving} 
              className={`w-full py-4 rounded-xl font-black text-lg shadow-xl text-white transition disabled:bg-gray-400 disabled:cursor-not-allowed ${
                activeTab === 'IN' 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' 
                  : activeTab === 'OUT' 
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' 
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
              }`}
            >
              {isSaving ? 'جاري تسجيل وترحيل الحركة...' : (
                activeTab === 'IN' ? '💾 حفظ وتأكيد سند قبض' :
                activeTab === 'OUT' ? '💾 حفظ وتأكيد سند صرف' :
                '💾 حفظ وتأكيد التحويل'
              )}
            </button>
        </div>
      </div>

      {/* Modal إضافة عميل سريع */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <h3 className="font-black text-base mb-4 border-b pb-2 text-center text-blue-900">
              ➕ إضافة عميل جديد
            </h3>
            <form onSubmit={handleQuickAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الاسم (مطلوب) *</label>
                <input 
                  type="text" 
                  value={newCust.name} 
                  onChange={e => setNewCust({...newCust, name: e.target.value})} 
                  className="w-full border-2 p-2.5 rounded-xl text-xs font-bold outline-none" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">الكود (تلقائي لو تركته فارغاً)</label>
                <input 
                  type="text" 
                  value={newCust.code} 
                  onChange={e => setNewCust({...newCust, code: e.target.value})} 
                  className="w-full border-2 p-2.5 rounded-xl bg-gray-50 text-xs font-mono" 
                  placeholder="تلقائي..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">هاتف 1</label>
                  <input 
                    type="text" 
                    value={newCust.phone} 
                    onChange={e => setNewCust({...newCust, phone: e.target.value})} 
                    className="w-full border-2 p-2 rounded-xl text-xs font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">هاتف 2</label>
                  <input 
                    type="text" 
                    value={newCust.phone2} 
                    onChange={e => setNewCust({...newCust, phone2: e.target.value})} 
                    className="w-full border-2 p-2 rounded-xl bg-yellow-50 text-xs font-mono" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">العنوان</label>
                <input 
                  type="text" 
                  value={newCust.address} 
                  onChange={e => setNewCust({...newCust, address: e.target.value})} 
                  className="w-full border-2 p-2 rounded-xl text-xs" 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsQuickAddOpen(false)} 
                  className="flex-1 bg-gray-100 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingCust} 
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-blue-700"
                >
                  حفظ واختيار ✅
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}