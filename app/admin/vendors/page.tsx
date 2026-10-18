'use client'

import { useEffect, useState, useMemo } from 'react'
import { getVendors, addVendor, deleteVendor } from '@/app/vendor-actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [newVendor, setNewVendor] = useState({
    name: '',
    phone: '',
    phone2: '',
    code: '',
    address: '',
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const loadVendors = async () => {
    setLoading(true)
    const data = await getVendors()
    setVendors(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadVendors()
  }, [])

  // البحث الحي في الموردين
  const filteredVendors = useMemo(() => {
    return vendors.filter(v =>
      v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.phone && v.phone.includes(searchTerm)) ||
      (v.phone2 && v.phone2.includes(searchTerm))
    )
  }, [vendors, searchTerm])

  // إجمالي الأرصدة المعروضة للموردين
  const balancesSummary = useMemo(() => {
    // إجمالي المبالغ المستحقة للموردين (دائنون - لهم عندنا)
    const totalPayables = filteredVendors
      .filter(v => (Number(v.balance) || 0) > 0)
      .reduce((sum, v) => sum + (Number(v.balance) || 0), 0)

    // إجمالي أرصدة الموردين المدينة (لنا عندهم فلوس أو مرتجع)
    const totalReceivables = filteredVendors
      .filter(v => (Number(v.balance) || 0) < 0)
      .reduce((sum, v) => sum + Math.abs(Number(v.balance) || 0), 0)

    // صافي مديونية الموردين الإجمالية
    const netPayables = totalPayables - totalReceivables

    const countCreditors = filteredVendors.filter(v => (Number(v.balance) || 0) > 0).length
    const countDebtors = filteredVendors.filter(v => (Number(v.balance) || 0) < 0).length
    const countSettled = filteredVendors.filter(v => (Number(v.balance) || 0) === 0).length

    return {
      totalPayables,
      totalReceivables,
      netPayables,
      countCreditors,
      countDebtors,
      countSettled
    }
  }, [filteredVendors])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVendor.name) {
      alert('الاسم مطلوب')
      return
    }

    setIsSaving(true)
    const result = await addVendor(newVendor)
    setIsSaving(false)

    if (result.success) {
      alert('✅ تم إضافة المورد بنجاح')
      setShowAddModal(false)
      setNewVendor({ name: '', phone: '', phone2: '', code: '', address: '', notes: '' })
      loadVendors()
    } else {
      alert('❌ خطأ: ' + result.error)
    }
  }

  const handleDelete = async (vendorId: string, vendorName: string) => {
    if (!confirm(`هل أنت متأكد من حذف المورد: ${vendorName}؟`)) {
      return
    }

    const result = await deleteVendor(vendorId)
    if (result.success) {
      alert('✅ تم الحذف')
      loadVendors()
    } else {
      alert('❌ خطأ: ' + result.error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-40 font-sans" dir="rtl">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm mb-4 sticky top-0 z-20 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b-4 border-purple-500 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏪</span>
          <div>
            <h2 className="font-bold text-lg text-gray-800">إدارة الموردين</h2>
            <p className="text-xs text-purple-700 font-bold">العدد المعروض: {filteredVendors.length} مورد</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* حقل البحث السريع */}
          <div className="w-full md:w-64">
            <input
              type="text"
              placeholder="🔍 بحث سريع (اسم، كود، هاتف)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 border-2 border-purple-200 rounded-lg text-xs font-bold focus:border-purple-500 outline-none"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-purple-700 transition shadow"
          >
            ➕ مورد جديد
          </button>
          
          <Link href="/admin" className="text-xs text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200">
            ← رجوع
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="bg-white p-12 rounded-xl shadow text-center font-bold text-gray-500">
            جاري تحميل الموردين والأرصدة...
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="bg-white p-10 rounded-xl shadow text-center">
            <div className="text-6xl mb-4">🏪</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">لا يوجد موردين يطابقون البحث</h3>
            <p className="text-gray-500 mb-4">يمكنك إضافة مورد جديد أو مسح كلمة البحث</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-purple-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm shadow"
            >
              ➕ إضافة مورد جديد
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-3 font-bold text-xs w-28">الكود</th>
                  <th className="p-3 font-bold text-xs">اسم المورد</th>
                  <th className="p-3 font-bold text-xs w-36">الهاتف</th>
                  <th className="p-3 text-center font-bold text-xs w-24">الأصناف</th>
                  
                  {/* عمود الرصيد الصافي الحالي بجوار الإجراءات مباشرة */}
                  <th className="p-3 text-center font-bold text-xs w-44 bg-purple-50 text-purple-950 border-x border-purple-200">
                    الرصيد الصافي الحالي
                  </th>

                  <th className="p-3 text-center font-bold text-xs w-64">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVendors.map((vendor) => {
                  const bal = Number(vendor.balance) || 0

                  return (
                    <tr key={vendor.id} className="hover:bg-gray-50 transition">
                      <td className="p-3 font-mono font-bold text-xs text-purple-900 bg-purple-50/30">
                        {vendor.code}
                      </td>

                      <td className="p-3 font-bold text-base text-gray-900">
                        {vendor.name}
                      </td>

                      <td className="p-3 text-xs font-mono text-gray-600">
                        {vendor.phone || '-'}
                        {vendor.phone2 && <span className="block text-[10px] text-gray-400">{vendor.phone2}</span>}
                      </td>

                      <td className="p-3 text-center">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-xs font-bold">
                          {vendor.productsCount}
                        </span>
                      </td>

                      {/* عرض الرصيد الصافي للمورد ملون ومميز */}
                      <td className="p-3 text-center font-mono font-bold text-sm bg-purple-50/20 border-x border-purple-100">
                        {bal > 0 ? (
                          <span className="text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg inline-block shadow-sm">
                            {bal.toLocaleString()} ج.م <small className="text-[10px] font-bold text-red-500">(له عندنا)</small>
                          </span>
                        ) : bal < 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg inline-block shadow-sm">
                            {Math.abs(bal).toLocaleString()} ج.م <small className="text-[10px] font-bold text-emerald-600">(مديون لنا)</small>
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal">
                            0.00 <small className="text-[10px]">(خالص)</small>
                          </span>
                        )}
                      </td>

                      {/* أزرار الإجراءات بجوار الرصيد */}
                      <td className="p-3 text-center">
                        <div className="flex gap-1.5 justify-center items-center">
                          <Link
                            href={`/admin/vendors/${vendor.id}`}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm"
                            title="كشف حساب ودفتر أستاذ المورد"
                          >
                            📊 كشف حساب
                          </Link>

                          <Link
                            href={`/payments/new?vendorId=${vendor.id}`}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm"
                            title="تسجيل سند دفع وصرف للمورد"
                          >
                            💰 دفع
                          </Link>

                          <button
                            onClick={() => handleDelete(vendor.id, vendor.name)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1 rounded-lg text-xs font-bold transition"
                            title="حذف المورد"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* الشريط الإحصائي الثابت في أسفل الشاشة لإجمالي أرصدة الموردين */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t-2 border-purple-500/50 p-3 sm:p-4 shadow-2xl z-40 text-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          
          <div className="flex flex-wrap items-center justify-between w-full md:w-auto gap-4 md:gap-8">
            
            {/* إجمالي مستحقات الموردين الواجب سدادها (لهم عندنا) */}
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">
                إجمالي مستحقات الموردين (واجبة السداد لهم):
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-rose-400">
                {balancesSummary.totalPayables.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                ({balancesSummary.countCreditors} مورد دائن)
              </span>
            </div>

            {/* أرصدة الموردين المدينة (لنا عندهم) */}
            {balancesSummary.totalReceivables > 0 && (
              <div className="border-r border-slate-800 pr-4 md:pr-6">
                <span className="text-[10px] text-slate-400 block font-bold">
                  أرصدة موردين مدينة (لنا عندهم رصيد أو مرتجع):
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  {balancesSummary.totalReceivables.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  ({balancesSummary.countDebtors} مورد مدين)
                </span>
              </div>
            )}

            {/* صافي مديونية الموردين الإجمالية */}
            <div className="border-r border-slate-800 pr-4 md:pr-6">
              <span className="text-[10px] text-amber-400 block font-bold">
                صافي التزامات الموردين العام:
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                {balancesSummary.netPayables.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
              </span>
              <span className="text-[10px] text-slate-400 block">
                (المعروض: {filteredVendors.length} مورد)
              </span>
            </div>

          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadVendors}
              className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>تحديث الأرصدة</span>
            </button>
          </div>

        </div>
      </div>

      {/* Modal إضافة مورد */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-lg mb-4 border-b pb-2 text-center text-purple-900">
              ➕ إضافة مورد جديد
            </h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  اسم المورد (مطلوب)
                </label>
                <input
                  type="text"
                  value={newVendor.name}
                  onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                  className="w-full border p-3 rounded-xl shadow-sm text-sm font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  كود المورد (تلقائي لو تركته فارغاً)
                </label>
                <input
                  type="text"
                  value={newVendor.code}
                  onChange={(e) => setNewVendor({ ...newVendor, code: e.target.value })}
                  className="w-full border p-3 rounded-xl bg-gray-50 shadow-sm text-sm font-mono"
                  placeholder="سيتم التوليد تلقائياً"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">هاتف 1</label>
                  <input
                    type="text"
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                    className="w-full border p-3 rounded-xl shadow-sm text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">هاتف 2</label>
                  <input
                    type="text"
                    value={newVendor.phone2}
                    onChange={(e) => setNewVendor({ ...newVendor, phone2: e.target.value })}
                    className="w-full border p-3 rounded-xl shadow-sm bg-yellow-50 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">العنوان</label>
                <input
                  type="text"
                  value={newVendor.address}
                  onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                  className="w-full border p-3 rounded-xl shadow-sm text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">ملاحظات</label>
                <textarea
                  value={newVendor.notes}
                  onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                  className="w-full border p-3 rounded-xl shadow-sm text-xs"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-100 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-purple-700"
                >
                  {isSaving ? '⏳ جاري الحفظ...' : 'حفظ المورد ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}