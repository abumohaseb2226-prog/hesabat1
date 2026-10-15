'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { 
  getChecks, 
  getBankAccounts, 
  searchParties, 
  createBankAccount, 
  createCheck, 
  clearAndCollectCheck, 
  bounceCheck, 
  deleteCheck 
} from '@/app/financial-paper-actions'
import { getSafesList } from '@/app/report-actions'

export default function FinancialPapersPage() {
  const [activeTab, setActiveTab] = useState<'RECEIVABLE' | 'PAYABLE' | 'BANKS' | 'ALL'>('RECEIVABLE')
  const [checks, setChecks] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [safes, setSafes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // مودال إنشاء شيك (قبض / دفع)
  const [showCheckModal, setShowCheckModal] = useState(false)
  const [checkType, setCheckType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE')
  const [checkForm, setCheckForm] = useState({
    checkNo: '',
    amount: '',
    currency: 'EGP',
    drawnBank: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    notes: ''
  })

  // اختيار الطرف (عميل أو مورد) مع البحث الحي
  const [partySearch, setPartySearch] = useState('')
  const [partiesList, setPartiesList] = useState<any[]>([])
  const [selectedParty, setSelectedParty] = useState<any>(null)
  const [showPartyDropdown, setShowPartyDropdown] = useState(false)
  const partyRef = useRef<HTMLDivElement>(null)

  // مودال إنشاء حساب بنكي
  const [showBankModal, setShowBankModal] = useState(false)
  const [bankForm, setBankForm] = useState({
    bankName: '',
    accountNumber: '',
    branch: '',
    currency: 'EGP',
    initialBalance: ''
  })

  // مودال تحصيل الشيك
  const [showCollectModal, setShowCollectModal] = useState(false)
  const [targetCheck, setTargetCheck] = useState<any>(null)
  const [collectForm, setCollectForm] = useState({
    destinationType: 'BANK' as 'BANK' | 'SAFE',
    destinationId: '',
    collectedDate: new Date().toISOString().split('T')[0],
    notes: ''
  })

  // مودال رفض الشيك
  const [showBounceModal, setShowBounceModal] = useState(false)
  const [bounceReason, setBounceReason] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // تحميل البيانات الأولية
  const loadData = async () => {
    setLoading(true)
    const [resChecks, resBanks, resSafes] = await Promise.all([
      getChecks(),
      getBankAccounts(),
      getSafesList()
    ])

    if (resChecks.success) setChecks(resChecks.checks || [])
    if (resBanks.success) setBanks(resBanks.banks || [])
    if (resSafes) setSafes(resSafes || [])

    setLoading(false)
  }

  useEffect(() => {
    loadData()

    const handleClickOutside = (e: MouseEvent) => {
      if (partyRef.current && !partyRef.current.contains(e.target as Node)) {
        setShowPartyDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // البحث الحي عن الأطراف (عملاء وموردين)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (partySearch.trim().length >= 1) {
        const res = await searchParties(partySearch)
        if (res.success) setPartiesList(res.parties || [])
      } else {
        setPartiesList([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [partySearch])

  // فلترة الشيكات في الجدول
  const filteredChecks = useMemo(() => {
    return checks.filter(c => {
      if (activeTab === 'RECEIVABLE' && c.type !== 'RECEIVABLE') return false
      if (activeTab === 'PAYABLE' && c.type !== 'PAYABLE') return false

      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false

      if (startDate && new Date(c.dueDate) < new Date(startDate)) return false
      if (endDate && new Date(c.dueDate) > new Date(endDate + 'T23:59:59.999')) return false

      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim()
        const partyName = c.customer?.name?.toLowerCase() || c.vendor?.name?.toLowerCase() || ''
        const matchNo = c.checkNo?.toLowerCase().includes(q)
        const matchBank = c.drawnBank?.toLowerCase().includes(q)
        const matchParty = partyName.includes(q)
        const matchAmount = c.amount?.toString().includes(q)

        if (!matchNo && !matchBank && !matchParty && !matchAmount) return false
      }

      return true
    })
  }, [checks, activeTab, statusFilter, startDate, endDate, searchTerm])

  // الإحصائيات العامة
  const stats = useMemo(() => {
    const receivablePending = checks.filter(c => c.type === 'RECEIVABLE' && c.status === 'PORTFOLIO')
    const payablePending = checks.filter(c => c.type === 'PAYABLE' && c.status === 'PORTFOLIO')
    const collected = checks.filter(c => c.status === 'COLLECTED')
    const bounced = checks.filter(c => c.status === 'BOUNCED')
    const totalBankBalance = banks.reduce((sum, b) => sum + (Number(b.balance) || 0), 0)

    return {
      receivableTotal: receivablePending.reduce((s, c) => s + c.amount, 0),
      receivableCount: receivablePending.length,
      payableTotal: payablePending.reduce((s, c) => s + c.amount, 0),
      payableCount: payablePending.length,
      collectedTotal: collected.reduce((s, c) => s + c.amount, 0),
      bouncedTotal: bounced.reduce((s, c) => s + c.amount, 0),
      bouncedCount: bounced.length,
      totalBankBalance
    }
  }, [checks, banks])

  // فتح مودال إضافة شيك
  const handleOpenAddCheck = (type: 'RECEIVABLE' | 'PAYABLE') => {
    setCheckType(type)
    setCheckForm({
      checkNo: '',
      amount: '',
      currency: 'EGP',
      drawnBank: '',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      notes: ''
    })
    setSelectedParty(null)
    setPartySearch('')
    setShowCheckModal(true)
  }

  // حفظ الشيك
  const handleSaveCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedParty) {
      alert('يرجى اختيار العميل أو المورد المستفيد')
      return
    }

    setIsSubmitting(true)
    const res = await createCheck({
      checkNo: checkForm.checkNo,
      type: checkType,
      amount: parseFloat(checkForm.amount) || 0,
      currency: checkForm.currency,
      drawnBank: checkForm.drawnBank,
      issueDate: checkForm.issueDate,
      dueDate: checkForm.dueDate,
      partyType: selectedParty.partyType,
      partyId: selectedParty.id,
      notes: checkForm.notes
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowCheckModal(false)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // حفظ الحساب البنكي الجديد
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const res = await createBankAccount({
      bankName: bankForm.bankName,
      accountNumber: bankForm.accountNumber,
      branch: bankForm.branch,
      currency: bankForm.currency,
      initialBalance: parseFloat(bankForm.initialBalance) || 0
    })
    setIsSubmitting(false)

    if (res.success) {
      alert('✅ تم إنشاء الحساب البنكي بنجاح')
      setShowBankModal(false)
      setBankForm({ bankName: '', accountNumber: '', branch: '', currency: 'EGP', initialBalance: '' })
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // فتح نافذة التحصيل والتسوية
  const handleOpenCollect = (check: any) => {
    setTargetCheck(check)
    setCollectForm({
      destinationType: banks.length > 0 ? 'BANK' : 'SAFE',
      destinationId: banks.length > 0 ? banks[0].id : (safes[0]?.id || ''),
      collectedDate: new Date().toISOString().split('T')[0],
      notes: ''
    })
    setShowCollectModal(true)
  }

  // اعتماد تحصيل الشيك
  const handleConfirmCollect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetCheck || !collectForm.destinationId) {
      alert('يرجى تحديد البنك أو الخزنة')
      return
    }

    setIsSubmitting(true)
    const res = await clearAndCollectCheck({
      checkId: targetCheck.id,
      destinationType: collectForm.destinationType,
      destinationId: collectForm.destinationId,
      collectedDate: collectForm.collectedDate,
      notes: collectForm.notes
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowCollectModal(false)
      setTargetCheck(null)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // فتح نافذة رفض الشيك
  const handleOpenBounce = (check: any) => {
    setTargetCheck(check)
    setBounceReason('')
    setShowBounceModal(true)
  }

  // اعتماد رفض الشيك
  const handleConfirmBounce = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetCheck) return

    setIsSubmitting(true)
    const res = await bounceCheck(targetCheck.id, bounceReason)
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowBounceModal(false)
      setTargetCheck(null)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // حذف الشيك
  const handleDeleteCheck = async (checkId: string, checkNo: string) => {
    if (!confirm(`هل أنت متأكد من حذف الشيك رقم (#${checkNo}) نهائياً؟`)) return

    const res = await deleteCheck(checkId)
    if (res.success) {
      alert(res.message)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      
      {/* رأس الصفحة */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📑</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">إدارة الأوراق المالية والشيكات والبنوك</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            إدارة أوراق القبض (الشيكات الواردة) وأوراق الدفع (الصادرة) ومتابعة محافظ الشيكات والتسوية البنكية
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => handleOpenAddCheck('RECEIVABLE')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>استلام ورقة قبض (شيك وارد)</span>
          </button>

          <button
            onClick={() => handleOpenAddCheck('PAYABLE')}
            className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>📤</span>
            <span>إصدار ورقة دفع (شيك صادر)</span>
          </button>

          <button
            onClick={() => setShowBankModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>🏛️</span>
            <span>+ حساب بنكي جديد</span>
          </button>

          <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition">
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* 1. كروت الملخص الإحصائي */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">شيكات قبض بالمحفظة (وارد)</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {stats.receivableTotal.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">{stats.receivableCount} شيك تحت التحصيل</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">شيكات دفع مستحقة (صادر)</span>
            <span className="text-2xl font-black text-rose-400 font-mono">
              {stats.payableTotal.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">{stats.payableCount} شيك واجب السداد</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">إجمالي الأرصدة البنكية</span>
            <span className="text-2xl font-black text-blue-400 font-mono">
              {stats.totalBankBalance.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">في {banks.length} حساب بنكي مسجل</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">شيكات مرفوضة / مرتدة</span>
            <span className="text-2xl font-black text-amber-400 font-mono">
              {stats.bouncedTotal.toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">{stats.bouncedCount} شيك مرتد</span>
          </div>
        </div>

        {/* 2. تبويبات التنقل الرئيسية */}
        <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('RECEIVABLE')}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition flex items-center gap-2 ${
              activeTab === 'RECEIVABLE' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span>📥</span>
            <span>أوراق القبض (الشيكات الواردة)</span>
          </button>

          <button
            onClick={() => setActiveTab('PAYABLE')}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition flex items-center gap-2 ${
              activeTab === 'PAYABLE' ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span>📤</span>
            <span>أوراق الدفع (الشيكات الصادرة)</span>
          </button>

          <button
            onClick={() => setActiveTab('BANKS')}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition flex items-center gap-2 ${
              activeTab === 'BANKS' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span>🏛️</span>
            <span>الحسابات البنكية والتسوية ({banks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition flex items-center gap-2 ${
              activeTab === 'ALL' ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <span>📋</span>
            <span>كل الشيكات ({checks.length})</span>
          </button>
        </div>

        {/* 3. شريط الفلاتر والبحث (يظهر عند عرض الشيكات) */}
        {activeTab !== 'BANKS' && (
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="🔍 ابحث برقم الشيك، البنك المسحوب عليه، اسم العميل أو المورد..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white font-bold outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-teal-500"
                >
                  <option value="ALL">جميع الحالات</option>
                  <option value="PORTFOLIO">بالمحفظة (تحت التحصيل)</option>
                  <option value="COLLECTED">تم التحصيل والتسوية</option>
                  <option value="BOUNCED">مرفوض / مرتد</option>
                  <option value="CANCELLED">ملغي</option>
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-1/2 bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
                  title="استحقاق من"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-1/2 bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none"
                  title="استحقاق إلى"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. عرض الحسابات البنكية إن كان التبويب هو BANKS */}
        {activeTab === 'BANKS' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {banks.map((bank) => (
              <div key={bank.id} className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex justify-between items-start border-b border-slate-700 pb-3">
                  <div>
                    <h3 className="text-xl font-black text-white">{bank.bankName}</h3>
                    <span className="text-xs text-slate-400 font-mono">حساب: {bank.accountNumber}</span>
                  </div>
                  <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {bank.currency}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-slate-400 block">الرصيد الدفتري الحالي:</span>
                  <span className="text-3xl font-black font-mono text-emerald-400">
                    {Number(bank.balance).toLocaleString()} <small className="text-xs text-slate-400">{bank.currency}</small>
                  </span>
                </div>

                <div className="text-xs text-slate-400 pt-2 border-t border-slate-700 flex justify-between">
                  <span>الفرع: {bank.branch || 'الرئيسي'}</span>
                  <span>{bank._count.transactions} حركة مسجلة</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 5. جدول الشيكات المفلترة */
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                  <tr>
                    <th className="p-3.5">النوع</th>
                    <th className="p-3.5">رقم الشيك</th>
                    <th className="p-3.5">المستفيد / الساحب</th>
                    <th className="p-3.5">البنك المسحوب عليه</th>
                    <th className="p-3.5 text-center">المبلغ</th>
                    <th className="p-3.5 text-center">تاريخ التحرير</th>
                    <th className="p-3.5 text-center">تاريخ الاستحقاق</th>
                    <th className="p-3.5 text-center">الحالة</th>
                    <th className="p-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">جاري تحميل الشيكات...</td>
                    </tr>
                  ) : filteredChecks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">لا توجد أوراق مالية مسجلة مطابقة للبحث</td>
                    </tr>
                  ) : (
                    filteredChecks.map((chk) => {
                      const isReceivable = chk.type === 'RECEIVABLE'
                      const partyName = chk.partyType === 'CUSTOMER' ? chk.customer?.name : chk.vendor?.name

                      return (
                        <tr key={chk.id} className="hover:bg-slate-700/30 transition">
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isReceivable ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}>
                              {isReceivable ? '📥 قبض وارد' : '📤 دفع صادر'}
                            </span>
                          </td>

                          <td className="p-3.5 font-bold font-mono text-purple-300 text-base">
                            #{chk.checkNo}
                          </td>

                          <td className="p-3.5">
                            <div className="font-bold text-white">{partyName || '-'}</div>
                            <span className="text-[10px] text-slate-400">
                              {chk.partyType === 'CUSTOMER' ? '👤 عميل' : '🏪 مورد'}
                            </span>
                          </td>

                          <td className="p-3.5 text-slate-300 font-medium">
                            {chk.drawnBank}
                          </td>

                          <td className="p-3.5 text-center font-black font-mono text-emerald-400 text-base">
                            {chk.amount.toLocaleString()} <small className="text-xs text-slate-400 font-normal">{chk.currency}</small>
                          </td>

                          <td className="p-3.5 text-center font-mono text-xs text-slate-400">
                            {new Date(chk.issueDate).toLocaleDateString('ar-EG')}
                          </td>

                          <td className="p-3.5 text-center font-mono text-xs font-bold text-amber-300">
                            {new Date(chk.dueDate).toLocaleDateString('ar-EG')}
                          </td>

                          <td className="p-3.5 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              chk.status === 'COLLECTED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : chk.status === 'BOUNCED'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {chk.status === 'COLLECTED' ? '✅ تم التحصيل' : chk.status === 'BOUNCED' ? '❌ مرفوض/مرتد' : '⏳ بالمحفظة'}
                            </span>

                            {chk.status === 'COLLECTED' && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {chk.collectedBank ? `🏦 ${chk.collectedBank.bankName}` : `💰 ${chk.collectedSafe?.name}`}
                              </div>
                            )}

                            {chk.status === 'BOUNCED' && chk.bouncedReason && (
                              <div className="text-[10px] text-red-400 mt-0.5">
                                {chk.bouncedReason}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="flex justify-center items-center gap-1.5">
                              {chk.status === 'PORTFOLIO' && (
                                <>
                                  <button
                                    onClick={() => handleOpenCollect(chk)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shadow"
                                    title="تحصيل وتسوية بالبنك أو الخزنة"
                                  >
                                    💵 تحصيل
                                  </button>

                                  <button
                                    onClick={() => handleOpenBounce(chk)}
                                    className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shadow"
                                    title="تسجيل رفض / ارتداد الشيك"
                                  >
                                    ❌ رفض
                                  </button>

                                  <button
                                    onClick={() => handleDeleteCheck(chk.id, chk.checkNo)}
                                    className="bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white p-1 rounded-lg text-xs font-bold transition border border-red-500/30"
                                    title="حذف الشيك"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}

                              {chk.status !== 'PORTFOLIO' && (
                                <span className="text-slate-500 text-xs">تمت المعالجة</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* مودال استلام / إصدار الشيك */}
      {showCheckModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <span>{checkType === 'RECEIVABLE' ? '📥 استلام ورقة قبض (شيك وارد)' : '📤 إصدار ورقة دفع (شيك صادر)'}</span>
            </h3>

            <form onSubmit={handleSaveCheck} className="space-y-4">
              
              {/* البحث الحي عن الطرف مع بيان (عميل) أو (مورد) */}
              <div className="relative" ref={partyRef}>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  المستفيد / الساحب (عميل أو مورد) *
                </label>
                
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الكود أو الهاتف..."
                  value={partySearch}
                  onChange={(e) => {
                    setPartySearch(e.target.value)
                    setShowPartyDropdown(true)
                  }}
                  onFocus={() => setShowPartyDropdown(true)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold focus:border-teal-500 outline-none"
                  required={!selectedParty}
                />

                {selectedParty && (
                  <div className="mt-1.5 p-2 bg-teal-950/40 border border-teal-500/40 rounded-lg text-xs flex justify-between items-center text-teal-200">
                    <span>✓ تم اختيار: <b>{selectedParty.label}</b></span>
                    <button type="button" onClick={() => { setSelectedParty(null); setPartySearch(''); }} className="text-red-400 font-bold">✕</button>
                  </div>
                )}

                {showPartyDropdown && partiesList.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl mt-1 max-h-52 overflow-y-auto">
                    {partiesList.map((p) => (
                      <div
                        key={`${p.partyType}-${p.id}`}
                        onClick={() => {
                          setSelectedParty(p)
                          setPartySearch(p.name)
                          setShowPartyDropdown(false)
                        }}
                        className="p-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">{p.name}</span>
                          <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.partyType === 'CUSTOMER' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            {p.partyType === 'CUSTOMER' ? 'عميل' : 'مورد'}
                          </span>
                        </div>
                        <span className="text-slate-400 font-mono text-[11px]">{p.phone || p.code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رقم الشيك *</label>
                  <input
                    type="text"
                    required
                    value={checkForm.checkNo}
                    onChange={(e) => setCheckForm({ ...checkForm, checkNo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm outline-none focus:border-teal-500"
                    placeholder="مثال: 004821"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">المبلغ *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={checkForm.amount}
                    onChange={(e) => setCheckForm({ ...checkForm, amount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-emerald-400 font-mono font-bold text-base outline-none focus:border-teal-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">البنك المسحوب عليه الشيك *</label>
                <input
                  type="text"
                  required
                  value={checkForm.drawnBank}
                  onChange={(e) => setCheckForm({ ...checkForm, drawnBank: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-sm outline-none focus:border-teal-500"
                  placeholder="مثال: البنك الأهلي المصري - فرع المهندسين"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ تحرير الشيك *</label>
                  <input
                    type="date"
                    required
                    value={checkForm.issueDate}
                    onChange={(e) => setCheckForm({ ...checkForm, issueDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ الاستحقاق (الصرف) *</label>
                  <input
                    type="date"
                    required
                    value={checkForm.dueDate}
                    onChange={(e) => setCheckForm({ ...checkForm, dueDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-amber-300 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={checkForm.notes}
                  onChange={(e) => setCheckForm({ ...checkForm, notes: e.target.value })}
                  placeholder="رقم الفاتورة المقابلة، بيان..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ وتسجيل الشيك ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال إنشاء حساب بنكي */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <span>🏛️ إضافة حساب بنكي جديد</span>
            </h3>

            <form onSubmit={handleSaveBank} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم البنك *</label>
                <input
                  type="text"
                  required
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  placeholder="مثال: البنك الأهلي المصري (NBE)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رقم الحساب البنكي (أو الـ IBAN) *</label>
                <input
                  type="text"
                  required
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  placeholder="EG..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الفرع</label>
                  <input
                    type="text"
                    value={bankForm.branch}
                    onChange={(e) => setBankForm({ ...bankForm, branch: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="0.01"
                    value={bankForm.initialBalance}
                    onChange={(e) => setBankForm({ ...bankForm, initialBalance: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-emerald-400 font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ الحساب البنكي ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال تحصيل الشيك والتسوية */}
      {showCollectModal && targetCheck && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-3 border-b border-slate-800 pb-2">
              💵 تحصيل وتسوية الشيك #{targetCheck.checkNo}
            </h3>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">المبلغ:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">{targetCheck.amount.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">البنك المسحوب عليه:</span>
                <span className="font-bold text-white">{targetCheck.drawnBank}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmCollect} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">وجهة التحصيل والتسوية</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setCollectForm({ ...collectForm, destinationType: 'BANK', destinationId: banks[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs transition ${
                      collectForm.destinationType === 'BANK' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    🏛️ حساب بنكي
                  </button>

                  <button
                    type="button"
                    onClick={() => setCollectForm({ ...collectForm, destinationType: 'SAFE', destinationId: safes[0]?.id || '' })}
                    className={`py-2 rounded-lg font-bold text-xs transition ${
                      collectForm.destinationType === 'SAFE' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    🏦 خزنة نقدية
                  </button>
                </div>

                {collectForm.destinationType === 'BANK' ? (
                  <select
                    value={collectForm.destinationId}
                    onChange={(e) => setCollectForm({ ...collectForm, destinationId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs font-bold outline-none"
                    required
                  >
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={collectForm.destinationId}
                    onChange={(e) => setCollectForm({ ...collectForm, destinationId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs font-bold outline-none"
                    required
                  >
                    {safes.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ التحصيل الفعلي</label>
                <input
                  type="date"
                  required
                  value={collectForm.collectedDate}
                  onChange={(e) => setCollectForm({ ...collectForm, collectedDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات التسوية</label>
                <input
                  type="text"
                  value={collectForm.notes}
                  onChange={(e) => setCollectForm({ ...collectForm, notes: e.target.value })}
                  placeholder="رقم إشعار الإيداع البنكي..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmitting ? 'جاري التحصيل...' : 'تأكيد التحصيل والتسوية ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال رفض الشيك */}
      {showBounceModal && targetCheck && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-2">
              ❌ رفض وارتداد الشيك #{targetCheck.checkNo}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              سيتم تسجيل الشيك كمرتد وإعادة المديونية لحساب الطرف تلقائياً.
            </p>

            <form onSubmit={handleConfirmBounce} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">سبب الرفض البنكي *</label>
                <input
                  type="text"
                  required
                  value={bounceReason}
                  onChange={(e) => setBounceReason(e.target.value)}
                  placeholder="عدم كفاية الرصيد، توقيع غير مطابق..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBounceModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSubmitting ? 'جاري التسجيل...' : 'تأكيد الرفض وعكس الأثر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}