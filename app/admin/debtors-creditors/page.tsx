'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  getOtherAccounts, 
  createOtherAccount, 
  recordLoanReceipt, 
  recordLoanRepayment, 
  recordDirectVendorSettlement,
  getOtherAccountLedger
} from '@/app/debtor-creditor-actions'
import { getVendors } from '@/app/vendor-actions'
import { getSafesList } from '@/app/report-actions'
import { getBankAccounts } from '@/app/financial-paper-actions'

export default function DebtorsCreditorsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [safes, setSafes] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // التبويب والبحث
  const [activeTab, setActiveTab] = useState<'ALL' | 'CREDITOR' | 'DEBTOR' | 'PARTNER'>('CREDITOR')
  const [searchTerm, setSearchTerm] = useState('')

  // مودال إنشاء حساب جديد
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    code: '',
    phone: '',
    type: 'CREDITOR' as 'CREDITOR' | 'DEBTOR' | 'PARTNER',
    initialBalance: '',
    notes: ''
  })

  // مودال استلام قرض / سلفة
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptForm, setReceiptForm] = useState({
    accountId: '',
    amount: '',
    destination: 'SAFE' as 'SAFE' | 'BANK',
    destinationId: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  })

  // مودال سداد قرض / سلفة
  const [showRepaymentModal, setShowRepaymentModal] = useState(false)
  const [repayForm, setRepayForm] = useState({
    accountId: '',
    amount: '',
    source: 'SAFE' as 'SAFE' | 'BANK',
    sourceId: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  })

  // مودال سداد مباشر لمورد من القرض
  const [showVendorDirectModal, setShowVendorDirectModal] = useState(false)
  const [directForm, setDirectForm] = useState({
    accountId: '',
    vendorId: '',
    amount: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  })

  // مودال كشف الحساب التفصيلي
  const [showLedgerModal, setShowLedgerModal] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [loadingLedger, setLoadingLedger] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [resAccs, resVendors, resSafes, resBanks] = await Promise.all([
      getOtherAccounts(),
      getVendors(),
      getSafesList(),
      getBankAccounts()
    ])

    if (resAccs.success) setAccounts(resAccs.accounts || [])
    if (resVendors) setVendors(resVendors || [])
    if (resSafes) setSafes(resSafes || [])
    if (resBanks.success) setBanks(resBanks.banks || [])

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (activeTab !== 'ALL' && acc.type !== activeTab) return false
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim()
        const matchName = acc.name.toLowerCase().includes(q)
        const matchCode = acc.code.toLowerCase().includes(q)
        const matchPhone = acc.phone?.toLowerCase().includes(q)
        if (!matchName && !matchCode && !matchPhone) return false
      }
      return true
    })
  }, [accounts, activeTab, searchTerm])

  // الإحصائيات
  const summary = useMemo(() => {
    const totalCreditorLiability = accounts
      .filter(a => a.type === 'CREDITOR' && a.balance > 0)
      .reduce((s, a) => s + a.balance, 0)

    const totalDebtorReceivables = accounts
      .filter(a => a.type === 'DEBTOR' || a.balance < 0)
      .reduce((s, a) => s + Math.abs(a.balance), 0)

    const totalPartnerCapital = accounts
      .filter(a => a.type === 'PARTNER')
      .reduce((s, a) => s + a.balance, 0)

    return { totalCreditorLiability, totalDebtorReceivables, totalPartnerCapital }
  }, [accounts])

  // فتح كشف الحساب
  const openLedger = async (accountId: string) => {
    setLoadingLedger(true)
    setShowLedgerModal(true)
    const res = await getOtherAccountLedger(accountId)
    if (res.success) {
      setSelectedLedger(res)
    } else {
      alert(res.error || 'فشل جلب كشف الحساب')
      setShowLedgerModal(false)
    }
    setLoadingLedger(false)
  }

  // 1. حفظ حساب جديد
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const res = await createOtherAccount({
      name: addForm.name,
      code: addForm.code,
      phone: addForm.phone,
      type: addForm.type,
      initialBalance: parseFloat(addForm.initialBalance) || 0,
      notes: addForm.notes
    })
    setIsSubmitting(false)

    if (res.success) {
      alert('✅ تم إنشاء الحساب بنجاح')
      setShowAddModal(false)
      setAddForm({ name: '', code: '', phone: '', type: 'CREDITOR', initialBalance: '', notes: '' })
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // 2. استلام سلفة
  const handleLoanReceipt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!receiptForm.destinationId) return alert('يرجى اختيار الخزنة أو البنك')

    setIsSubmitting(true)
    const res = await recordLoanReceipt({
      accountId: receiptForm.accountId,
      amount: parseFloat(receiptForm.amount) || 0,
      destination: receiptForm.destination,
      destinationId: receiptForm.destinationId,
      description: receiptForm.description,
      date: receiptForm.date
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowReceiptModal(false)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // 3. سداد سلفة
  const handleLoanRepayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repayForm.sourceId) return alert('يرجى اختيار الخزنة أو البنك')

    setIsSubmitting(true)
    const res = await recordLoanRepayment({
      accountId: repayForm.accountId,
      amount: parseFloat(repayForm.amount) || 0,
      source: repayForm.source,
      sourceId: repayForm.sourceId,
      description: repayForm.description,
      date: repayForm.date
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowRepaymentModal(false)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // 4. سداد مباشر لمورد من القرض
  const handleDirectVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!directForm.vendorId) return alert('يرجى اختيار المورد المستفيد')

    setIsSubmitting(true)
    const res = await recordDirectVendorSettlement({
      accountId: directForm.accountId,
      vendorId: directForm.vendorId,
      amount: parseFloat(directForm.amount) || 0,
      notes: directForm.notes,
      date: directForm.date
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowVendorDirectModal(false)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤝</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">إدارة الدائنون والمدينون والقروض</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            متابعة السلف، القروض الشخصية، العهد، جاري الشركاء، والسداد المباشر للموردين (خاص بالمحاسب والإدارة)
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>حساب جديد</span>
          </button>

          <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition">
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* 1. الكروت الإحصائية */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">إجمالي قروض وسلف مستحقة (علينا للدائنين)</span>
            <span className="text-3xl font-black text-rose-400 font-mono">
              {summary.totalCreditorLiability.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">التزامات واجبة الرد</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">إجمالي عهد ومدينون (مستحقات لنا عند الغير)</span>
            <span className="text-3xl font-black text-emerald-400 font-mono">
              {summary.totalDebtorReceivables.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">أموال مستحقة للشركة</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">صافي جاري الشركاء</span>
            <span className="text-3xl font-black text-blue-400 font-mono">
              {summary.totalPartnerCapital.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">تمويل وضخ أموال الشركاء</span>
          </div>
        </div>

        {/* 2. شريط التبويبات والبحث */}
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('CREDITOR')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
                activeTab === 'CREDITOR' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              🤝 دائنون (سلف وقروض لنا عندهم)
            </button>

            <button
              onClick={() => setActiveTab('DEBTOR')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
                activeTab === 'DEBTOR' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              💼 مدينون (عهد وسلف عليهم)
            </button>

            <button
              onClick={() => setActiveTab('PARTNER')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
                activeTab === 'PARTNER' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              👥 جاري الشركاء
            </button>

            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
                activeTab === 'ALL' ? 'bg-slate-700 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              📋 الكل ({accounts.length})
            </button>
          </div>

          <div className="w-full md:w-72">
            <input
              type="text"
              placeholder="🔍 ابحث بالاسم أو الكود..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-bold"
            />
          </div>
        </div>

        {/* 3. جدول الحسابات */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3.5">الكود</th>
                  <th className="p-3.5">اسم الحساب / الشخص</th>
                  <th className="p-3.5">التصنيف</th>
                  <th className="p-3.5">الهاتف</th>
                  <th className="p-3.5 text-center">الرصيد الدفتري الحالي</th>
                  <th className="p-3.5 text-center">العمليات السريعة</th>
                  <th className="p-3.5 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">جاري تحميل الحسابات...</td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">لا توجد حسابات مسجلة</td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => {
                    const isCreditor = acc.balance > 0
                    const isDebtor = acc.balance < 0

                    return (
                      <tr key={acc.id} className="hover:bg-slate-700/30 transition">
                        <td className="p-3.5 font-mono text-xs font-bold text-indigo-400">
                          {acc.code}
                        </td>

                        <td className="p-3.5 font-bold text-white text-base">
                          {acc.name}
                        </td>

                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            acc.type === 'CREDITOR' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                            acc.type === 'DEBTOR' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {acc.type === 'CREDITOR' ? 'دائن (سلف/قرض)' : acc.type === 'DEBTOR' ? 'مدين (عهدة)' : 'شريك'}
                          </span>
                        </td>

                        <td className="p-3.5 text-slate-400 font-mono text-xs">
                          {acc.phone || '-'}
                        </td>

                        <td className="p-3.5 text-center font-black font-mono text-lg">
                          <span className={isCreditor ? 'text-rose-400' : isDebtor ? 'text-emerald-400' : 'text-slate-400'}>
                            {Math.abs(acc.balance).toLocaleString()} ج.م
                          </span>
                          <span className="text-[10px] text-slate-500 block font-normal">
                            {isCreditor ? '(له علينا)' : isDebtor ? '(عليه لنا)' : '(خالص)'}
                          </span>
                        </td>

                        {/* العمليات السريعة */}
                        <td className="p-3.5 text-center">
                          <div className="flex justify-center items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => {
                                setReceiptForm({ ...receiptForm, accountId: acc.id, destinationId: safes[0]?.id || '' })
                                setShowReceiptModal(true)
                              }}
                              className="bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white px-2 py-1 rounded text-xs font-bold border border-emerald-500/30 transition"
                              title="استلام قرض/سلفة نقدية"
                            >
                              + استلام سلفة
                            </button>

                            <button
                              onClick={() => {
                                setRepayForm({ ...repayForm, accountId: acc.id, sourceId: safes[0]?.id || '' })
                                setShowRepaymentModal(true)
                              }}
                              className="bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white px-2 py-1 rounded text-xs font-bold border border-rose-500/30 transition"
                              title="سداد ورد سلفة"
                            >
                              - رد سلفة
                            </button>

                            {/* زر السداد المباشر للمورد */}
                            <button
                              onClick={() => {
                                setDirectForm({ ...directForm, accountId: acc.id, vendorId: vendors[0]?.id || '' })
                                setShowVendorDirectModal(true)
                              }}
                              className="bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white px-2 py-1 rounded text-xs font-bold border border-purple-500/30 transition"
                              title="سداد مورد مباشرة من هذا الدائن"
                            >
                              🏪 سداد لمورد
                            </button>
                          </div>
                        </td>

                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => openLedger(acc.id)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow"
                          >
                            📊 كشف الحساب
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* مودال إضافة حساب جديد */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2">➕ إضافة حساب مالي جديد</h3>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم الشخص / جهة التعامل *</label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="مثال: الحاج أحمد (سلف)، عهدة محمد..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">التصنيف المحاسبي</label>
                  <select
                    value={addForm.type}
                    onChange={(e: any) => setAddForm({ ...addForm, type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs font-bold outline-none"
                  >
                    <option value="CREDITOR">دائن (سلف/قرض له علينا)</option>
                    <option value="DEBTOR">مدين (عهدة/فلوس عليه)</option>
                    <option value="PARTNER">جاري شريك</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الرصيد الافتتاحي (إن وجد)</label>
                <input
                  type="number"
                  step="0.01"
                  value={addForm.initialBalance}
                  onChange={(e) => setAddForm({ ...addForm, initialBalance: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-emerald-400 font-mono text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="ملاحظات توضيحية..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ الحساب ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال استلام قرض / سلفة */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2">💵 استلام قرض / سلفة نقدية</h3>

            <form onSubmit={handleLoanReceipt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ المستلم *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={receiptForm.amount}
                  onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono font-bold text-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">جهة الإيداع</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setReceiptForm({ ...receiptForm, destination: 'SAFE', destinationId: safes[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs ${receiptForm.destination === 'SAFE' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    🏦 خزنة نقدية
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptForm({ ...receiptForm, destination: 'BANK', destinationId: banks[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs ${receiptForm.destination === 'BANK' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    🏛️ حساب بنكي
                  </button>
                </div>

                {receiptForm.destination === 'SAFE' ? (
                  <select
                    value={receiptForm.destinationId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, destinationId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                  >
                    {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <select
                    value={receiptForm.destinationId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, destinationId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                  >
                    {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">البيان / الوصف</label>
                <input
                  type="text"
                  value={receiptForm.description}
                  onChange={(e) => setReceiptForm({ ...receiptForm, description: e.target.value })}
                  placeholder="سلفة لشراء بضاعة شتوي..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowReceiptModal(false)} className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition">تأكيد الإيداع والاستلام ✅</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال سداد سلفة */}
      {showRepaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2">💸 سداد ورد سلفة / قرض</h3>

            <form onSubmit={handleLoanRepayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ المسدد *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={repayForm.amount}
                  onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-rose-400 font-mono font-bold text-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">جهة الصرف</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setRepayForm({ ...repayForm, source: 'SAFE', sourceId: safes[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs ${repayForm.source === 'SAFE' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    🏦 خزنة نقدية
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepayForm({ ...repayForm, source: 'BANK', sourceId: banks[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs ${repayForm.source === 'BANK' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    🏛️ حساب بنكي
                  </button>
                </div>

                {repayForm.source === 'SAFE' ? (
                  <select
                    value={repayForm.sourceId}
                    onChange={(e) => setRepayForm({ ...repayForm, sourceId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                  >
                    {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <select
                    value={repayForm.sourceId}
                    onChange={(e) => setRepayForm({ ...repayForm, sourceId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                  >
                    {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">البيان</label>
                <input
                  type="text"
                  value={repayForm.description}
                  onChange={(e) => setRepayForm({ ...repayForm, description: e.target.value })}
                  placeholder="رد جزء من سلفة..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowRepaymentModal(false)} className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition">تأكيد الصرف والسداد ✅</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال سداد مباشر لمورد من القرض */}
      {showVendorDirectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-2 border-b border-slate-800 pb-2">
              🏪 سداد مباشر لمورد من القرض
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              سيقوم النظام بخصم المبلغ من كشف حساب المورد مباشرة وإثباته كمديونية على الشركة للدائن دون المرور بالخزنة.
            </p>

            <form onSubmit={handleDirectVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المورد المستفيد *</label>
                <select
                  value={directForm.vendorId}
                  onChange={(e) => setDirectForm({ ...directForm, vendorId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                  required
                >
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ المسدد للمورد *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={directForm.amount}
                  onChange={(e) => setDirectForm({ ...directForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-purple-400 font-mono font-bold text-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات / رقم الفاتورة</label>
                <input
                  type="text"
                  value={directForm.notes}
                  onChange={(e) => setDirectForm({ ...directForm, notes: e.target.value })}
                  placeholder="سداد فاتورة قماش..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowVendorDirectModal(false)} className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition">تأكيد السداد المباشر ✅</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال كشف الحساب التفصيلي */}
      {showLedgerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-xl font-black text-white">كشف حساب: {selectedLedger?.account?.name}</h3>
                <span className="text-xs text-slate-400 font-mono">كود: {selectedLedger?.account?.code}</span>
              </div>
              <button onClick={() => setShowLedgerModal(false)} className="text-slate-400 hover:text-white text-2xl font-bold">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingLedger ? (
                <div className="p-12 text-center text-slate-400">جاري تحميل كشف الحساب...</div>
              ) : selectedLedger?.ledger?.length === 0 ? (
                <div className="p-12 text-center text-slate-500">لا توجد حركات مسجلة لهذا الحساب</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-950 text-slate-400 text-xs font-bold sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">البيان</th>
                      <th className="p-3 text-center">مدين (سددنا له)</th>
                      <th className="p-3 text-center">دائن (له علينا)</th>
                      <th className="p-3 text-center">الرصيد التراكمي</th>
                      <th className="p-3 text-center">القناة / المورد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {selectedLedger?.ledger?.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-800/40">
                        <td className="p-3 text-xs font-mono text-slate-400">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3 font-medium text-white">{row.description}</td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-400">{row.debit > 0 ? row.debit.toLocaleString() : '-'}</td>
                        <td className="p-3 text-center font-mono font-bold text-rose-400">{row.credit > 0 ? row.credit.toLocaleString() : '-'}</td>
                        <td className="p-3 text-center font-mono font-black text-white">{Math.abs(row.balance).toLocaleString()} {row.balance >= 0 ? '(له)' : '(عليه)'}</td>
                        <td className="p-3 text-center text-xs text-slate-400">{row.safeName || row.bankName || row.vendorName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">الرصيد النهائي: <b className="text-white font-mono text-base">{Math.abs(selectedLedger?.account?.balance || 0).toLocaleString()} ج.م</b></span>
              <button onClick={() => setShowLedgerModal(false)} className="bg-slate-800 text-white px-5 py-2 rounded-xl font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}