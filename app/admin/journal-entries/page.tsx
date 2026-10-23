'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { getJournalPrerequisites, postJournalEntry, getJournalEntries, JournalLineInput } from '@/app/journal-actions'

export default function JournalEntriesPage() {
  const [activeTab, setActiveTab] = useState<'NEW_ENTRY' | 'ENTRIES_LOG'>('NEW_ENTRY')
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [prereqs, setPrereqs] = useState<{
    customers: any[]
    vendors: any[]
    safes: any[]
    banks: any[]
    employees: any[]
    otherAccounts: any[]
    chartAccounts: any[]
  }>({
    customers: [],
    vendors: [],
    safes: [],
    banks: [],
    employees: [],
    otherAccounts: [],
    chartAccounts: []
  })

  const [entries, setEntries] = useState<any[]>([])
  const [selectedEntryToPrint, setSelectedEntryToPrint] = useState<any | null>(null)

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [entryDescription, setEntryDescription] = useState('')
  const [entryReference, setEntryReference] = useState('')

  const [lines, setLines] = useState<JournalLineInput[]>([
    { accountType: 'SAFE', accountId: '', accountName: '', debit: 0, credit: 0, notes: '' },
    { accountType: 'CUSTOMER', accountId: '', accountName: '', debit: 0, credit: 0, notes: '' }
  ])

  const [activeSearchLineIndex, setActiveSearchLineIndex] = useState<number | null>(null)
  const [partySearchText, setPartySearchText] = useState('')
  const searchDropdownRef = useRef<HTMLDivElement>(null)

  const loadInitialData = async () => {
    setLoading(true)
    const [resPre, resEntries] = await Promise.all([
      getJournalPrerequisites(),
      getJournalEntries(100)
    ])

    if (resPre.success && resPre.data) {
      setPrereqs(resPre.data)
      if (resPre.data.safes.length > 0) {
        setLines(prev => [
          { ...prev[0], accountId: resPre.data.safes[0].id, accountName: `خزنة: ${resPre.data.safes[0].name}` },
          prev[1]
        ])
      }
    }
    if (resEntries.success && resEntries.entries) {
      setEntries(resEntries.entries)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInitialData()

    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setActiveSearchLineIndex(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines])
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines])
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100
  const isBalanced = isFinite(difference) && difference === 0 && totalDebit > 0

  const updateLine = (index: number, updates: Partial<JournalLineInput>) => {
    setLines(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...updates }
      return copy
    })
  }

  const addLine = () => {
    setLines(prev => [
      ...prev,
      { accountType: 'CUSTOMER', accountId: '', accountName: '', debit: 0, credit: 0, notes: '' }
    ])
  }

  const removeLine = (index: number) => {
    if (lines.length <= 2) return alert('يجب أن يتكون القيد من سطرين على الأقل')
    setLines(prev => prev.filter((_, i) => i !== index))
  }

  const handleAccountTypeChange = (index: number, newType: any) => {
    let defaultId = ''
    let defaultName = ''

    if (newType === 'SAFE' && prereqs.safes.length > 0) {
      defaultId = prereqs.safes[0].id
      defaultName = `خزنة: ${prereqs.safes[0].name}`
    } else if (newType === 'BANK' && prereqs.banks.length > 0) {
      defaultId = prereqs.banks[0].id
      defaultName = `بنك: ${prereqs.banks[0].bankName}`
    } else if (newType === 'EMPLOYEE' && prereqs.employees.length > 0) {
      defaultId = prereqs.employees[0].id
      defaultName = `موظف: ${prereqs.employees[0].name}`
    } else if (newType === 'OTHER_ACCOUNT' && prereqs.otherAccounts.length > 0) {
      defaultId = prereqs.otherAccounts[0].id
      defaultName = `${prereqs.otherAccounts[0].name} (${prereqs.otherAccounts[0].type})`
    } else if (newType === 'CHART_ACCOUNT' && prereqs.chartAccounts.length > 0) {
      defaultId = prereqs.chartAccounts[0].id
      defaultName = `${prereqs.chartAccounts[0].name} (${prereqs.chartAccounts[0].code})`
    } else if (newType === 'EXPENSE') {
      defaultName = 'مصروفات عمومية وتشغيلية'
    } else if (newType === 'REVENUE') {
      defaultName = 'إيرادات متنوعة'
    }

    updateLine(index, {
      accountType: newType,
      accountId: defaultId,
      accountName: defaultName
    })
  }

  const liveSearchResults = useMemo(() => {
    if (activeSearchLineIndex === null) return []
    const line = lines[activeSearchLineIndex]
    const q = partySearchText.trim().toLowerCase()

    if (line.accountType === 'CUSTOMER') {
      return prereqs.customers.filter(c =>
        !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.code && c.code.toLowerCase().includes(q))
      ).slice(0, 20)
    }

    if (line.accountType === 'VENDOR') {
      return prereqs.vendors.filter(v =>
        !q || v.name.toLowerCase().includes(q) || (v.phone && v.phone.includes(q)) || (v.code && v.code.toLowerCase().includes(q))
      ).slice(0, 20)
    }

    if (line.accountType === 'CHART_ACCOUNT') {
      return prereqs.chartAccounts.filter(ca =>
        !q || ca.name.toLowerCase().includes(q) || ca.code.toLowerCase().includes(q)
      ).slice(0, 20)
    }

    return []
  }, [activeSearchLineIndex, partySearchText, lines, prereqs])

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isBalanced) {
      return alert(`لا يمكن ترحيل القيد! القيد غير متزن والفرق الحالي: ${difference} ج.م`)
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.accountName.trim()) {
        return alert(`يرجى تحديد الحساب في السطر رقم (${i + 1})`)
      }
      if ((l.debit <= 0 && l.credit <= 0) || (l.debit > 0 && l.credit > 0)) {
        return alert(`يرجى كتابة القيمة في خانة واحدة فقط (إما مدين أو دائن) في السطر رقم (${i + 1})`)
      }
    }

    setIsSubmitting(true)
    const res = await postJournalEntry({
      date: entryDate,
      description: entryDescription,
      reference: entryReference,
      lines
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setEntryDescription('')
      setEntryReference('')
      setLines([
        { accountType: 'SAFE', accountId: prereqs.safes[0]?.id || '', accountName: `خزنة: ${prereqs.safes[0]?.name || ''}`, debit: 0, credit: 0, notes: '' },
        { accountType: 'CUSTOMER', accountId: '', accountName: '', debit: 0, credit: 0, notes: '' }
      ])
      loadInitialData()
      setActiveTab('ENTRIES_LOG')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans pb-36" dir="rtl">
      
      {/* الهيدر العلوي */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚖️</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">قيود اليومية العامة (Journal Entries)</h1>
              <p className="text-slate-400 text-xs mt-1">
                إنشاء قيود محاسبية متزنة للعملاء، الموردين، الخزن، والبنوك وحسابات الشجرة الفرعية
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-700 flex gap-1">
            <button
              onClick={() => setActiveTab('NEW_ENTRY')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'NEW_ENTRY' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>✏️</span>
              <span>إنشاء قيد جديد</span>
            </button>

            <button
              onClick={() => setActiveTab('ENTRIES_LOG')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'ENTRIES_LOG' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>📋</span>
              <span>سجل القيود المرحلة ({entries.length})</span>
            </button>
          </div>

          <Link href="/admin" className="text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 px-3.5 py-2 rounded-xl font-bold transition">
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">

        {/* نموذج القيد الجديد */}
        {activeTab === 'NEW_ENTRY' && (
          <form onSubmit={handleSaveEntry} className="space-y-6">
            
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">📅 تاريخ القيد *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-amber-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-300 mb-1">📝 البيان العام للقيد (شرح العملية) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: إثبات خصم مسموح به للعميل، سداد إيجار، تسوية مديونية..."
                  value={entryDescription}
                  onChange={(e) => setEntryDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-visible">
              <div className="p-4 bg-slate-850 bg-slate-900 border-b border-slate-700 flex justify-between items-center rounded-t-2xl">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>📑 بنود القيد المحاسبي المزدوج</span>
                  <span className="text-xs text-slate-400 font-normal">(حدد الحساب، واكتب القيمة في المدين أو الدائن)</span>
                </h3>

                <button
                  type="button"
                  onClick={addLine}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow"
                >
                  <span>➕</span>
                  <span>إضافة طرف للقيد</span>
                </button>
              </div>

              <div className="p-4 overflow-x-auto min-h-[300px]">
                <table className="w-full text-right text-sm">
                  <thead className="text-xs font-bold text-slate-300 uppercase border-b border-slate-700">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5 w-44">نوع الحساب</th>
                      <th className="p-2.5">اسم الحساب / الطرف (بحث لايف)</th>
                      <th className="p-2.5 text-center w-36 text-emerald-400">مدين (منه)</th>
                      <th className="p-2.5 text-center w-36 text-rose-400">دائن (له)</th>
                      <th className="p-2.5 w-48">البيان التفصيلي</th>
                      <th className="p-2.5 w-12 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {lines.map((line, idx) => {
                      const isCustomer = line.accountType === 'CUSTOMER'
                      const isVendor = line.accountType === 'VENDOR'
                      const isSafe = line.accountType === 'SAFE'
                      const isBank = line.accountType === 'BANK'
                      const isEmployee = line.accountType === 'EMPLOYEE'
                      const isOther = line.accountType === 'OTHER_ACCOUNT'
                      const isChart = line.accountType === 'CHART_ACCOUNT'
                      const isSearchingThisLine = activeSearchLineIndex === idx

                      return (
                        <tr key={idx} className="hover:bg-slate-700/30 transition">
                          <td className="p-2.5 text-center font-bold text-xs text-slate-500">{idx + 1}</td>

                          <td className="p-2">
                            <select
                              value={line.accountType}
                              onChange={(e) => handleAccountTypeChange(idx, e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-amber-500"
                            >
                              <option value="CUSTOMER">👤 حساب عميل</option>
                              <option value="VENDOR">🏪 حساب مورد</option>
                              <option value="SAFE">🏦 حساب خزينة</option>
                              <option value="BANK">🏛️ حساب بنكي</option>
                              <option value="EMPLOYEE">👨‍💼 حساب موظف</option>
                              <option value="OTHER_ACCOUNT">🤝 دائنون / مدينون / شركاء</option>
                              <option value="CHART_ACCOUNT">🌳 حساب من شجرة الحسابات</option>
                              <option value="EXPENSE">💸 مصروف تشغيلي</option>
                              <option value="REVENUE">📈 إيراد متنوع</option>
                            </select>
                          </td>

                          <td className="p-2 relative">
                            {(isCustomer || isVendor || isChart) ? (
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder={
                                    isCustomer ? '🔍 ابحث باسم أو كود العميل...' :
                                    isVendor ? '🔍 ابحث باسم أو كود المورد...' :
                                    '🔍 ابحث في حسابات الشجرة (كود أو اسم)...'
                                  }
                                  value={isSearchingThisLine ? partySearchText : (line.accountName || '')}
                                  onFocus={() => {
                                    setActiveSearchLineIndex(idx)
                                    setPartySearchText('')
                                  }}
                                  onChange={(e) => setPartySearchText(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none focus:border-blue-500"
                                />

                                {isSearchingThisLine && (
                                  <div
                                    ref={searchDropdownRef}
                                    className="absolute top-full right-0 left-0 z-50 bg-slate-950 border-2 border-blue-500 rounded-xl shadow-2xl mt-1 max-h-52 overflow-y-auto divide-y divide-slate-800"
                                  >
                                    {liveSearchResults.length === 0 ? (
                                      <div className="p-3 text-center text-xs text-slate-500">لا توجد نتائج مطابقة</div>
                                    ) : (
                                      liveSearchResults.map((item) => (
                                        <div
                                          key={item.id}
                                          onClick={() => {
                                            updateLine(idx, {
                                              accountId: item.id,
                                              accountName: `${item.name} (${item.code || item.phone || ''})`
                                            })
                                            setActiveSearchLineIndex(null)
                                          }}
                                          className="p-2.5 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-xs"
                                        >
                                          <span className="font-bold text-white">{item.name}</span>
                                          <span className="text-slate-400 font-mono text-[11px]">{item.code || item.phone}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : isSafe ? (
                              <select
                                value={line.accountId}
                                onChange={(e) => {
                                  const safeObj = prereqs.safes.find(s => s.id === e.target.value)
                                  updateLine(idx, {
                                    accountId: e.target.value,
                                    accountName: safeObj ? `خزنة: ${safeObj.name}` : ''
                                  })
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                              >
                                {prereqs.safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            ) : isBank ? (
                              <select
                                value={line.accountId}
                                onChange={(e) => {
                                  const bankObj = prereqs.banks.find(b => b.id === e.target.value)
                                  updateLine(idx, {
                                    accountId: e.target.value,
                                    accountName: bankObj ? `بنك: ${bankObj.bankName}` : ''
                                  })
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                              >
                                {prereqs.banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                              </select>
                            ) : isEmployee ? (
                              <select
                                value={line.accountId}
                                onChange={(e) => {
                                  const empObj = prereqs.employees.find(emp => emp.id === e.target.value)
                                  updateLine(idx, {
                                    accountId: e.target.value,
                                    accountName: empObj ? `موظف: ${empObj.name}` : ''
                                  })
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                              >
                                {prereqs.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                              </select>
                            ) : isOther ? (
                              <select
                                value={line.accountId}
                                onChange={(e) => {
                                  const accObj = prereqs.otherAccounts.find(a => a.id === e.target.value)
                                  updateLine(idx, {
                                    accountId: e.target.value,
                                    accountName: accObj ? `${accObj.name} (${accObj.type})` : ''
                                  })
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                              >
                                {prereqs.otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="اسم المصروف أو الإيراد..."
                                value={line.accountName}
                                onChange={(e) => updateLine(idx, { accountName: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                              />
                            )}
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={line.debit || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                updateLine(idx, { debit: val, ...(val > 0 && { credit: 0 }) })
                              }}
                              className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-2.5 text-center font-mono font-bold text-emerald-400 text-sm outline-none focus:border-emerald-400"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={line.credit || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                updateLine(idx, { credit: val, ...(val > 0 && { debit: 0 }) })
                              }}
                              className="w-full bg-slate-950 border border-rose-500/50 rounded-xl p-2.5 text-center font-mono font-bold text-rose-400 text-sm outline-none focus:border-rose-400"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="ملاحظات البند..."
                              value={line.notes || ''}
                              onChange={(e) => updateLine(idx, { notes: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none"
                            />
                          </td>

                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-red-400 hover:text-red-300 p-1 font-bold text-base"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-950 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 rounded-b-2xl">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block font-bold">إجمالي المدين:</span>
                    <span className="text-xl font-black font-mono text-emerald-400">
                      {totalDebit.toLocaleString()} <small className="text-xs text-slate-400 font-normal">ج.م</small>
                    </span>
                  </div>

                  <div className="border-r border-slate-800 pr-6">
                    <span className="text-xs text-slate-400 block font-bold">إجمالي الدائن:</span>
                    <span className="text-xl font-black font-mono text-rose-400">
                      {totalCredit.toLocaleString()} <small className="text-xs text-slate-400 font-normal">ج.م</small>
                    </span>
                  </div>

                  <div className="border-r border-slate-800 pr-6">
                    <span className="text-xs text-slate-400 block font-bold">حالة التوازن:</span>
                    {isBalanced ? (
                      <span className="text-sm font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full inline-block">
                        ✓ القيد متزن تماماً
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-full inline-block">
                        ⚠️ غير متزن (الفرق: {difference.toLocaleString()} ج.م)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={!isBalanced || isSubmitting}
                    className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-black text-sm shadow-xl transition flex items-center gap-2"
                  >
                    <span>{isSubmitting ? 'جاري الترحيل...' : '💾 ترحيل وحفظ قيد اليومية'}</span>
                  </button>
                </div>
              </div>

            </div>

          </form>
        )}

        {/* سجل القيود المرحلة */}
        {activeTab === 'ENTRIES_LOG' && (
          <div className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-white text-base">سجل قيود اليومية العامة المرحلة</h3>
                <span className="text-xs text-slate-400 font-mono">إجمالي القيود: {entries.length} قيد</span>
              </div>

              <div className="divide-y divide-slate-700/60">
                {entries.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold">
                    لا توجد قيود يومية مسجلة بعد. يمكنك إنشاء قيد جديد الآن.
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="p-5 hover:bg-slate-800/40 transition space-y-3">
                      
                      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-base text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                            قيد #{entry.entryNo}
                          </span>
                          <span className="font-bold text-white text-base">{entry.description}</span>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                          <span className="text-slate-400">التاريخ: {new Date(entry.date).toLocaleDateString('ar-EG')}</span>
                          <span className="text-emerald-400 font-black text-sm">الإجمالي: {Number(entry.totalAmount).toLocaleString()} ج.م</span>
                          <button
                            type="button"
                            onClick={() => setSelectedEntryToPrint(entry)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded font-bold"
                          >
                            عرض وطباعة 🖨️
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="text-slate-400">
                            <tr>
                              <th className="p-1.5">الحساب</th>
                              <th className="p-1.5 text-center w-28 text-emerald-400">مدين (منه)</th>
                              <th className="p-1.5 text-center w-28 text-rose-400">دائن (له)</th>
                              <th className="p-1.5">البيان</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {entry.lines?.map((l: any, lIdx: number) => (
                              <tr key={lIdx}>
                                <td className="p-1.5 text-slate-200 font-sans font-bold">
                                  {l.debit > 0 ? 'من حـ/ ' : 'إلى حـ/ '} {l.accountName}
                                </td>
                                <td className="p-1.5 text-center font-bold text-emerald-400">
                                  {l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}
                                </td>
                                <td className="p-1.5 text-center font-bold text-rose-400">
                                  {l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}
                                </td>
                                <td className="p-1.5 text-slate-400 font-sans">{l.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* نافذة عرض وطباعة سند القيد */}
      {selectedEntryToPrint && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">سند قيد يومية رقم #{selectedEntryToPrint.entryNo}</h3>
              <button onClick={() => setSelectedEntryToPrint(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl space-y-1 text-xs">
              <div>البيان: <b className="text-white">{selectedEntryToPrint.description}</b></div>
              <div>التاريخ: <b className="text-slate-300 font-mono">{new Date(selectedEntryToPrint.date).toLocaleDateString('ar-EG')}</b></div>
              <div>المسؤول: <b className="text-slate-300">{selectedEntryToPrint.userName || 'المحاسب'}</b></div>
            </div>

            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
                <tr>
                  <th className="p-2">طرف الحساب</th>
                  <th className="p-2 text-center w-28">مدين</th>
                  <th className="p-2 text-center w-28">دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {selectedEntryToPrint.lines?.map((l: any, i: number) => (
                  <tr key={i}>
                    <td className="p-2 text-slate-200 font-sans">{l.debit > 0 ? 'من حـ/ ' : 'إلى حـ/ '} {l.accountName}</td>
                    <td className="p-2 text-center font-bold text-emerald-400">{l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}</td>
                    <td className="p-2 text-center font-bold text-rose-400">{l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs">
              <span className="font-black text-emerald-400 text-sm">الإجمالي: {Number(selectedEntryToPrint.totalAmount).toLocaleString()} ج.م</span>
              <button onClick={() => setSelectedEntryToPrint(null)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}