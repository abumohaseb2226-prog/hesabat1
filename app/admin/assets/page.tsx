'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getFixedAssets, createFixedAsset, updateAssetStatus } from '@/app/asset-actions'
import { getSafesList } from '@/app/report-actions'
import { getBankAccounts } from '@/app/financial-paper-actions'
import { getOtherAccounts } from '@/app/debtor-creditor-actions'
import { getVendors } from '@/app/vendor-actions'

export default function FixedAssetsPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [summary, setSummary] = useState<any>({ totalAssetsValue: 0, totalPurchaseCost: 0, count: 0 })
  const [loading, setLoading] = useState(true)

  // قنوات السداد
  const [safes, setSafes] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [creditors, setCreditors] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])

  // التصفية
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  // مودال شراء أصل
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    assetCode: '',
    category: 'آلات ومعدات',
    purchaseCost: '',
    depreciationRate: '10',
    location: 'المصنع',
    notes: '',
    paymentMethod: 'CASH_SAFE' as 'CASH_SAFE' | 'BANK' | 'DEBTOR_CREDIT' | 'VENDOR_CREDIT',
    paymentTargetId: '',
    purchaseDate: new Date().toISOString().split('T')[0]
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [resAssets, resSafes, resBanks, resCreds, resVendors] = await Promise.all([
      getFixedAssets(),
      getSafesList(),
      getBankAccounts(),
      getOtherAccounts(),
      getVendors()
    ])

    if (resAssets.success) {
      setAssets(resAssets.assets || [])
      setSummary(resAssets.summary || {})
    }
    if (resSafes) setSafes(resSafes)
    if (resBanks.success) setBanks(resBanks.banks || [])
    if (resCreds.success) setCreditors(resCreds.accounts?.filter((a: any) => a.type === 'CREDITOR') || [])
    if (resVendors) setVendors(resVendors)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // عند تغيير طريقة السداد، نضبط الـ targetId الافتراضي
  useEffect(() => {
    if (form.paymentMethod === 'CASH_SAFE' && safes.length > 0) {
      setForm(prev => ({ ...prev, paymentTargetId: safes[0].id }))
    } else if (form.paymentMethod === 'BANK' && banks.length > 0) {
      setForm(prev => ({ ...prev, paymentTargetId: banks[0].id }))
    } else if (form.paymentMethod === 'DEBTOR_CREDIT' && creditors.length > 0) {
      setForm(prev => ({ ...prev, paymentTargetId: creditors[0].id }))
    } else if (form.paymentMethod === 'VENDOR_CREDIT' && vendors.length > 0) {
      setForm(prev => ({ ...prev, paymentTargetId: vendors[0].id }))
    }
  }, [form.paymentMethod, safes, banks, creditors, vendors])

  const filteredAssets = categoryFilter === 'ALL'
    ? assets
    : assets.filter(a => a.category === categoryFilter)

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.paymentTargetId) return alert('يرجى اختيار جهة سداد تكلفة الأصل')

    setIsSubmitting(true)
    const res = await createFixedAsset({
      name: form.name,
      assetCode: form.assetCode,
      category: form.category,
      purchaseCost: parseFloat(form.purchaseCost) || 0,
      purchaseDate: form.purchaseDate,
      depreciationRate: parseFloat(form.depreciationRate) || 0,
      location: form.location,
      notes: form.notes,
      paymentMethod: form.paymentMethod,
      paymentTargetId: form.paymentTargetId
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      setShowAddModal(false)
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
            <span className="text-3xl">🏭</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">إدارة وشراء الأصول الثابتة الرأسمالية</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            متابعة أصول المصنع والمعرض (ماكينات، سيارات، أجهزة، ديكورات) وقيمتها الرأسمالية الدفترية (خاص بالمحاسب والإدارة)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>شراء وتسجيل أصل ثابت</span>
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
            <span className="text-xs text-slate-400 block mb-1">إجمالي القيمة الدفترية الحالية للأصول</span>
            <span className="text-3xl font-black text-emerald-400 font-mono">
              {(summary?.totalAssetsValue || 0).toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">قيمة ممتلكات الشركة الرأسمالية</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">إجمالي تكلفة الشراء الأساسية</span>
            <span className="text-3xl font-black text-blue-400 font-mono">
              {(summary?.totalPurchaseCost || 0).toLocaleString()} <small className="text-xs text-slate-400">ج.م</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">المبالغ المستثمرة في الأصول</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg">
            <span className="text-xs text-slate-400 block mb-1">عدد الأصول المسجلة</span>
            <span className="text-3xl font-black text-amber-400 font-mono">
              {summary?.count || 0} <small className="text-xs text-slate-400">أصل</small>
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">ماكينات، سيارات وتجهيزات</span>
          </div>
        </div>

        {/* 2. فلتر التصنيفات */}
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm flex gap-2 overflow-x-auto">
          {['ALL', 'آلات ومعدات', 'سيارات ووسائل نقل', 'أجهزة إلكترونية', 'أثاث وتجهيزات'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                categoryFilter === cat ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {cat === 'ALL' ? '📋 جميع الأصول' : cat}
            </button>
          ))}
        </div>

        {/* 3. جدول الأصول */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3.5">كود الأصل</th>
                  <th className="p-3.5">اسم الأصل</th>
                  <th className="p-3.5">التصنيف</th>
                  <th className="p-3.5">الموقع</th>
                  <th className="p-3.5 text-center">تكلفة الشراء</th>
                  <th className="p-3.5 text-center">القيمة الحالية</th>
                  <th className="p-3.5">طريقة السداد</th>
                  <th className="p-3.5 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400 font-bold">جاري تحميل الأصول...</td></tr>
                ) : filteredAssets.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400 font-bold">لا توجد أصول مسجلة في هذا التصنيف</td></tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-700/30 transition">
                      <td className="p-3.5 font-mono text-xs font-bold text-amber-400">
                        {asset.assetCode}
                      </td>

                      <td className="p-3.5 font-bold text-white text-base">
                        {asset.name}
                      </td>

                      <td className="p-3.5 text-slate-300 text-xs">
                        {asset.category}
                      </td>

                      <td className="p-3.5 text-slate-400 text-xs">
                        {asset.location || 'المصنع'}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold text-slate-300">
                        {asset.purchaseCost.toLocaleString()} ج.م
                      </td>

                      <td className="p-3.5 text-center font-mono font-black text-emerald-400 text-base">
                        {asset.currentValue.toLocaleString()} ج.م
                      </td>

                      <td className="p-3.5 text-xs text-slate-300">
                        {asset.paymentMethod === 'CASH_SAFE' ? `خزنة: ${asset.safe?.name}` :
                         asset.paymentMethod === 'BANK' ? `بنك: ${asset.bankAccount?.bankName}` :
                         asset.paymentMethod === 'DEBTOR_CREDIT' ? `تمويل دائن: ${asset.creditorAccount?.name}` :
                         `آجل مورد: ${asset.vendor?.name}`}
                      </td>

                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          asset.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          asset.status === 'MAINTENANCE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {asset.status === 'ACTIVE' ? 'يعمل بحالة جيدة' : asset.status === 'MAINTENANCE' ? 'تحت الصيانة' : 'مكهن'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* مودال شراء أصل ثابت */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-2">🏭 شراء وتسجيل أصل ثابت رأسمالي</h3>

            <form onSubmit={handleSaveAsset} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم الأصل *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: ماكينة خياطة جوكي ياباني موديل 9000..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">التصنيف *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none"
                  >
                    <option value="آلات ومعدات">آلات ومعدات (ماكينات، مكاوي...)</option>
                    <option value="سيارات ووسائل نقل">سيارات ووسائل نقل (جامبو، فان...)</option>
                    <option value="أجهزة إلكترونية">أجهزة إلكترونية (كمبيوتر، تكييفات...)</option>
                    <option value="أثاث وتجهيزات">أثاث وتجهيزات المعرض والمصنع</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تكلفة الشراء (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.purchaseCost}
                    onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-emerald-400 font-mono font-bold text-base outline-none"
                  />
                </div>
              </div>

              {/* طريقة السداد */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">طريقة سداد تكلفة شراء الأصل *</label>
                <select
                  value={form.paymentMethod}
                  onChange={(e: any) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none mb-2"
                >
                  <option value="CASH_SAFE">💵 نقداً من الخزنة (سند صرف استثماري)</option>
                  <option value="BANK">🏛️ سحب / تحويل من حساب بنكي</option>
                  <option value="DEBTOR_CREDIT">🤝 تمويل سلفة على حساب دائن (استلاف لتمويل الأصل)</option>
                  <option value="VENDOR_CREDIT">🏪 شراء آجل مسجل على مورد</option>
                </select>

                {form.paymentMethod === 'CASH_SAFE' && (
                  <select
                    value={form.paymentTargetId}
                    onChange={(e) => setForm({ ...form, paymentTargetId: e.target.value })}
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl p-2 text-xs text-amber-300 font-bold outline-none"
                  >
                    {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}

                {form.paymentMethod === 'BANK' && (
                  <select
                    value={form.paymentTargetId}
                    onChange={(e) => setForm({ ...form, paymentTargetId: e.target.value })}
                    className="w-full bg-slate-950 border border-blue-500/40 rounded-xl p-2 text-xs text-blue-300 font-bold outline-none"
                  >
                    {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                  </select>
                )}

                {form.paymentMethod === 'DEBTOR_CREDIT' && (
                  <select
                    value={form.paymentTargetId}
                    onChange={(e) => setForm({ ...form, paymentTargetId: e.target.value })}
                    className="w-full bg-slate-950 border border-purple-500/40 rounded-xl p-2 text-xs text-purple-300 font-bold outline-none"
                  >
                    {creditors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </select>
                )}

                {form.paymentMethod === 'VENDOR_CREDIT' && (
                  <select
                    value={form.paymentTargetId}
                    onChange={(e) => setForm({ ...form, paymentTargetId: e.target.value })}
                    className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl p-2 text-xs text-indigo-300 font-bold outline-none"
                  >
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">مقر وجود الأصل</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="المصنع، المعرض..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نسبة الإهلاك السنوية %</label>
                  <input
                    type="number"
                    value={form.depreciationRate}
                    onChange={(e) => setForm({ ...form, depreciationRate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition">تأكيد الشراء والتسجيل ✅</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}