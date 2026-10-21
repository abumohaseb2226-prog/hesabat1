'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getVendors, addVendor, deleteVendor, getVendorsPerformanceReport } from '@/app/vendor-actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VendorsPage() {
  const router = useRouter()

  // التبويب النشط: قائمة الموردين أو تقرير أداء الموردين
  const [activeTab, setActiveTab] = useState<'LIST' | 'PERFORMANCE'>('LIST')

  // بيانات الموردين العادية
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // بيانات تقرير أداء الموردين
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfSearchTerm, setPerfSearchTerm] = useState('')
  const [perfStartDate, setPerfStartDate] = useState('')
  const [perfEndDate, setPerfEndDate] = useState('')

  // ✅ حفظ المعرف فقط بدلاً من الكائن لمنع إعادة الفتح التلقائي وحلقات التكرار
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)

  // استخراج بيانات المورد المحدد للنافذة المنبثقة تلقائياً
  const selectedVendorForBreakdown = useMemo(() => {
    if (!selectedVendorId) return null
    return performanceData.find((v: any) => v.id === selectedVendorId) || null
  }, [performanceData, selectedVendorId])

  // مودال إضافة مورد جديد
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

  // ✅ دالة جلب تقرير الأداء أصبحت مستقلة تماماً عن فتح وغلق النوافذ
  const loadPerformanceReport = useCallback(async () => {
    setPerfLoading(true)
    const res = await getVendorsPerformanceReport(perfStartDate, perfEndDate)
    if (res.success && res.data) {
      setPerformanceData(res.data)
    } else {
      alert(res.error || 'فشل جلب تقرير أداء الموردين')
    }
    setPerfLoading(false)
  }, [perfStartDate, perfEndDate])

  useEffect(() => {
    loadVendors()
  }, [])

  useEffect(() => {
    if (activeTab === 'PERFORMANCE') {
      loadPerformanceReport()
    }
  }, [activeTab, loadPerformanceReport])

  // فلترة الموردين (القائمة العامة)
  const filteredVendors = useMemo(() => {
    return vendors.filter(v =>
      v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.phone && v.phone.includes(searchTerm)) ||
      (v.phone2 && v.phone2.includes(searchTerm))
    )
  }, [vendors, searchTerm])

  // فلترة تقرير أداء الموردين
  const filteredPerformance = useMemo(() => {
    return performanceData.filter(v =>
      v.name?.toLowerCase().includes(perfSearchTerm.toLowerCase()) ||
      v.code?.toLowerCase().includes(perfSearchTerm.toLowerCase())
    )
  }, [performanceData, perfSearchTerm])

  // إجماليات تقرير الأداء
  const perfSummary = useMemo(() => {
    const totalPieces = filteredPerformance.reduce((s, v) => s + (v.totalPiecesSold || 0), 0)
    const totalRevenue = filteredPerformance.reduce((s, v) => s + (v.totalRevenue || 0), 0)
    const topVendor = filteredPerformance.length > 0 ? filteredPerformance[0] : null
    return { totalPieces, totalRevenue, topVendor }
  }, [filteredPerformance])

  // فلاتر سريعة لتقرير الأداء
  const handleQuickPerfDate = (range: 'ALL' | 'TODAY' | 'MONTH' | 'YEAR') => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    if (range === 'ALL') {
      setPerfStartDate('')
      setPerfEndDate('')
    } else if (range === 'TODAY') {
      setPerfStartDate(today)
      setPerfEndDate(today)
    } else if (range === 'MONTH') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      setPerfStartDate(firstOfMonth)
      setPerfEndDate(today)
    } else if (range === 'YEAR') {
      const firstOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
      setPerfStartDate(firstOfYear)
      setPerfEndDate(today)
    }
  }

  // إجمالي الأرصدة المعروضة للموردين
  const balancesSummary = useMemo(() => {
    const totalPayables = filteredVendors
      .filter(v => (Number(v.balance) || 0) > 0)
      .reduce((sum, v) => sum + (Number(v.balance) || 0), 0)

    const totalReceivables = filteredVendors
      .filter(v => (Number(v.balance) || 0) < 0)
      .reduce((sum, v) => sum + Math.abs(Number(v.balance) || 0), 0)

    const netPayables = totalPayables - totalReceivables
    const countCreditors = filteredVendors.filter(v => (Number(v.balance) || 0) > 0).length
    const countDebtors = filteredVendors.filter(v => (Number(v.balance) || 0) < 0).length
    const countSettled = filteredVendors.filter(v => (Number(v.balance) || 0) === 0).length

    return { totalPayables, totalReceivables, netPayables, countCreditors, countDebtors, countSettled }
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
    if (!confirm(`هل أنت متأكد من حذف المورد: ${vendorName}؟`)) return

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
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏪</span>
          <div>
            <h2 className="font-black text-xl text-gray-800">إدارة ومتابعة الموردين</h2>
            <p className="text-xs text-gray-500 mt-0.5">سجل الحسابات، الأرصدة، وتحليل أداء المبيعات لكل مورد</p>
          </div>
        </div>

        {/* التبديل بين الشاشات والأزرار */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          
          <div className="bg-gray-100 p-1 rounded-xl flex gap-1 border border-gray-200">
            <button
              onClick={() => setActiveTab('LIST')}
              className={`px-4 py-2 rounded-lg font-black text-xs transition flex items-center gap-1.5 ${
                activeTab === 'LIST' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>📋</span>
              <span>سجل الحسابات والأرصدة</span>
            </button>

            <button
              onClick={() => setActiveTab('PERFORMANCE')}
              className={`px-4 py-2 rounded-lg font-black text-xs transition flex items-center gap-1.5 ${
                activeTab === 'PERFORMANCE' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>📈</span>
              <span>أداء الموردين (الأكثر مبيعاً)</span>
            </button>
          </div>

          {activeTab === 'LIST' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-purple-600 text-white px-3.5 py-2 rounded-lg font-bold text-xs hover:bg-purple-700 transition shadow"
            >
              ➕ مورد جديد
            </button>
          )}

          <Link href="/admin" className="text-xs text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200">
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* ========================================================= */}
        {/* التبويب الأول: قائمة الموردين والأرصدة الدفترية */}
        {/* ========================================================= */}
        {activeTab === 'LIST' && (
          <div>
            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200 mb-4 flex justify-between items-center gap-3">
              <div className="relative w-full md:w-80">
                <input
                  type="text"
                  placeholder="🔍 بحث سريع في الموردين (اسم، كود، هاتف)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold focus:bg-white focus:border-purple-500 outline-none"
                />
              </div>

              <span className="text-xs font-bold text-gray-500">
                المعروض: <b className="text-purple-700 font-mono">{filteredVendors.length}</b> مورد
              </span>
            </div>

            {loading ? (
              <div className="bg-white p-12 rounded-xl shadow text-center font-bold text-gray-500">
                جاري تحميل الموردين والأرصدة...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="bg-white p-10 rounded-xl shadow text-center">
                <div className="text-5xl mb-3">🏪</div>
                <h3 className="text-lg font-bold text-gray-700 mb-1">لا يوجد موردين يطابقون البحث</h3>
                <p className="text-gray-400 text-xs mb-3">يمكنك إضافة مورد جديد أو مسح كلمة البحث</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold text-xs shadow"
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
        )}

        {/* ========================================================= */}
        {/* التبويب الثاني: تقرير أداء الموردين (الأكثر مبيعاً) */}
        {/* ========================================================= */}
        {activeTab === 'PERFORMANCE' && (
          <div className="space-y-4">
            
            {/* شريط الفلاتر والتواريخ لتقرير الأداء */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-500">الفترة:</span>
                <button onClick={() => handleQuickPerfDate('ALL')} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${!perfStartDate && !perfEndDate ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>الكل</button>
                <button onClick={() => handleQuickPerfDate('TODAY')} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${perfStartDate === new Date().toISOString().split('T')[0] && perfEndDate === perfStartDate ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>اليوم</button>
                <button onClick={() => handleQuickPerfDate('MONTH')} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">هذا الشهر</button>
                <button onClick={() => handleQuickPerfDate('YEAR')} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">هذا العام</button>

                <div className="flex items-center gap-1.5 mr-2">
                  <input
                    type="date"
                    value={perfStartDate}
                    onChange={(e) => setPerfStartDate(e.target.value)}
                    className="p-1.5 bg-gray-50 border border-gray-300 rounded text-xs font-bold outline-none"
                    title="من تاريخ"
                  />
                  <span className="text-gray-400 text-xs">إلى</span>
                  <input
                    type="date"
                    value={perfEndDate}
                    onChange={(e) => setPerfEndDate(e.target.value)}
                    className="p-1.5 bg-gray-50 border border-gray-300 rounded text-xs font-bold outline-none"
                    title="إلى تاريخ"
                  />
                  <button
                    onClick={loadPerformanceReport}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold shadow"
                  >
                    تطبيق ⟳
                  </button>
                </div>
              </div>

              <div className="w-full md:w-64">
                <input
                  type="text"
                  placeholder="🔍 بحث في الموردين الأكثر مبيعاً..."
                  value={perfSearchTerm}
                  onChange={(e) => setPerfSearchTerm(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* كروت الملخص الإحصائي لأداء الموردين */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-4 rounded-xl shadow">
                <span className="text-xs text-emerald-100 block mb-0.5">المورد المتصدر مبيعاً 🥇</span>
                <span className="text-xl font-black block">
                  {perfSummary.topVendor ? perfSummary.topVendor.name : 'لا توجد بيانات'}
                </span>
                <span className="text-[11px] text-emerald-200 mt-1 block font-mono">
                  {perfSummary.topVendor ? `باع: ${perfSummary.topVendor.totalPiecesSold.toLocaleString()} قطعة (${perfSummary.topVendor.totalRevenue.toLocaleString()} ج.م)` : '-'}
                </span>
              </div>

              <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                <span className="text-xs text-gray-500 block mb-0.5">إجمالي القطع المباعة من كل الموردين</span>
                <span className="text-2xl font-black text-blue-700 font-mono">
                  {perfSummary.totalPieces.toLocaleString()} <small className="text-xs text-gray-400 font-bold">قطعة</small>
                </span>
                <span className="text-[11px] text-gray-400 block mt-1">صافي بعد استنزال المرتجعات</span>
              </div>

              <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                <span className="text-xs text-gray-500 block mb-0.5">إجمالي قيمة المبيعات المحققة</span>
                <span className="text-2xl font-black text-emerald-600 font-mono">
                  {perfSummary.totalRevenue.toLocaleString()} <small className="text-xs text-gray-400 font-bold">ج.م</small>
                </span>
                <span className="text-[11px] text-gray-400 block mt-1">من مبيعات بضاعة الموردين</span>
              </div>
            </div>

            {/* جدول ترتيب الموردين حسب الأكثر مبيعاً */}
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
              <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center text-xs font-bold text-emerald-950">
                <span>🏆 ترتيب الموردين تنازلياً حسب حركة البيع (اضغط على أي مورد لعرض ترتيب أصنافه)</span>
                <span>العدد: {filteredPerformance.length} مورد</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-3 text-center font-bold text-xs w-16">الترتيب</th>
                      <th className="p-3 font-bold text-xs">اسم المورد</th>
                      <th className="p-3 font-bold text-xs w-28">الكود</th>
                      <th className="p-3 text-center font-bold text-xs w-32 bg-emerald-100/60 text-emerald-900">
                        القطع المباعة 🔥
                      </th>
                      <th className="p-3 text-center font-bold text-xs w-36">إجمالي المبيعات</th>
                      <th className="p-3 text-center font-bold text-xs w-32">الموديلات المباعة</th>
                      <th className="p-3 text-center font-bold text-xs w-48">تفصيل الأصناف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {perfLoading ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-gray-400 font-bold">
                          جاري تجميع وحساب أداء المبيعات للموردين...
                        </td>
                      </tr>
                    ) : filteredPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-gray-400 font-bold">
                          لا توجد مبيعات مسجلة للموردين في الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      filteredPerformance.map((item, idx) => {
                        const rank = idx + 1
                        const isTop = rank === 1
                        const isSecond = rank === 2
                        const isThird = rank === 3

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-emerald-50/50 transition cursor-pointer ${
                              isTop ? 'bg-amber-50/40 font-semibold' : ''
                            }`}
                            onClick={() => setSelectedVendorId(item.id)}
                          >
                            <td className="p-3 text-center font-mono font-black text-sm">
                              {isTop ? '🥇 1' : isSecond ? '🥈 2' : isThird ? '🥉 3' : `#${rank}`}
                            </td>

                            <td className="p-3 font-bold text-gray-900 text-base">
                              <div className="flex items-center gap-2">
                                <span>{item.name}</span>
                                {isTop && <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded font-bold">الأكثر طلباً</span>}
                              </div>
                            </td>

                            <td className="p-3 font-mono text-xs text-gray-500">
                              {item.code}
                            </td>

                            <td className="p-3 text-center font-mono font-black text-emerald-700 text-base bg-emerald-50/30">
                              {item.totalPiecesSold.toLocaleString()} <small className="text-[10px] font-normal text-gray-500">قطعة</small>
                            </td>

                            <td className="p-3 text-center font-mono font-bold text-gray-900 text-sm">
                              {item.totalRevenue.toLocaleString()} ج.م
                            </td>

                            <td className="p-3 text-center font-mono text-xs font-bold text-blue-700">
                              {item.modelsCount} موديل
                            </td>

                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedVendorId(item.id)
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-1 mx-auto"
                              >
                                <span>🔍</span>
                                <span>أكثر الأصناف مبيعاً</span>
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
        )}

      </div>

      {/* ========================================================= */}
      {/* نافذة منبثقة: ترتيب أكثر أصناف المورد مبيعاً عند الضغط عليه */}
      {/* ========================================================= */}
      {selectedVendorForBreakdown && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
          onClick={() => setSelectedVendorId(null)}
        >
          <div 
            className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* رأس النافذة */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏆</span>
                  <h3 className="text-lg font-black">
                    الأصناف الأكثر مبيعاً للمورد: {selectedVendorForBreakdown.name}
                  </h3>
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-mono">
                    {selectedVendorForBreakdown.code}
                  </span>
                </div>
                <p className="text-xs text-emerald-100 mt-1 font-mono">
                  إجمالي مبيعات هذا المورد: {selectedVendorForBreakdown.totalPiecesSold.toLocaleString()} قطعة | بقيمة: {selectedVendorForBreakdown.totalRevenue.toLocaleString()} ج.م
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVendorId(null)}
                className="text-white hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* جدول تفاصيل وترتيب الأصناف */}
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-100 text-gray-700 sticky top-0 border-b border-gray-200">
                  <tr>
                    <th className="p-2.5 text-center w-14 font-bold text-xs">#</th>
                    <th className="p-2.5 font-bold text-xs">رقم الموديل</th>
                    <th className="p-2.5 font-bold text-xs w-28">اللون</th>
                    <th className="p-2.5 font-bold text-xs">الوصف</th>
                    <th className="p-2.5 text-center font-bold text-xs w-28 bg-emerald-100 text-emerald-950">
                      القطع المباعة 🔥
                    </th>
                    <th className="p-2.5 text-center font-bold text-xs w-32">قيمة المبيعات</th>
                    <th className="p-2.5 text-center font-bold text-xs w-28">السعر</th>
                    <th className="p-2.5 text-center font-bold text-xs w-28">المتبقي بالمخزن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedVendorForBreakdown.topProducts?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400 font-bold">
                        لا توجد أصناف مباعة لهذا المورد
                      </td>
                    </tr>
                  ) : (
                    selectedVendorForBreakdown.topProducts.map((prod: any, pIdx: number) => {
                      const prodRank = pIdx + 1
                      const isTopProd = prodRank === 1

                      return (
                        <tr key={prod.id} className={`hover:bg-gray-50 transition ${isTopProd ? 'bg-amber-50/50' : ''}`}>
                          <td className="p-2.5 text-center font-mono font-bold text-xs text-gray-500">
                            {isTopProd ? '🥇 1' : prodRank === 2 ? '🥈 2' : prodRank === 3 ? '🥉 3' : `#${prodRank}`}
                          </td>

                          <td className="p-2.5 font-mono font-black text-gray-900 text-base">
                            {prod.modelNo}
                          </td>

                          <td className="p-2.5 text-xs text-gray-700 font-medium">
                            <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200 inline-block">
                              {prod.color}
                            </span>
                          </td>

                          <td className="p-2.5 text-xs text-gray-500 truncate max-w-xs">
                            {prod.description || '-'}
                          </td>

                          <td className="p-2.5 text-center font-mono font-black text-emerald-700 text-base bg-emerald-50/50">
                            {prod.soldQty.toLocaleString()} <small className="text-[10px] text-gray-500 font-normal">قطعة</small>
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold text-gray-900 text-sm">
                            {prod.revenue.toLocaleString()} ج.م
                          </td>

                          <td className="p-2.5 text-center font-mono text-xs text-gray-600">
                            {prod.price} ج.م
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold text-xs">
                            <span className={`px-2 py-0.5 rounded ${
                              prod.currentStock <= 4 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {prod.currentStock} قطعة
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* فوتر النافذة */}
            <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center text-xs">
              <span className="text-gray-500">
                عدد الموديلات المباعة: <b className="text-gray-800 font-mono">{selectedVendorForBreakdown.topProducts?.length || 0}</b> صنف
              </span>

              <div className="flex gap-2">
                <Link
                  href={`/admin/vendors/${selectedVendorForBreakdown.id}`}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg font-bold shadow-sm transition"
                >
                  كشف حساب المورد 📊
                </Link>

                <button
                  type="button"
                  onClick={() => setSelectedVendorId(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-1.5 rounded-lg font-bold transition"
                >
                  إغلاق
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* الشريط الإحصائي الثابت في أسفل الشاشة (لقائمة الموردين) */}
      {activeTab === 'LIST' && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t-2 border-purple-500/50 p-3 sm:p-4 shadow-2xl z-40 text-white">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
            
            <div className="flex flex-wrap items-center justify-between w-full md:w-auto gap-4 md:gap-8">
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
      )}

      {/* Modal إضافة مورد جديد */}
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