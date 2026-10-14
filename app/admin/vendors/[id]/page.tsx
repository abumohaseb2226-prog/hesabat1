'use client'

import { useEffect, useState, use, useMemo } from 'react'
import { getVendorLedger, recordVendorInvoice } from '@/app/vendor-actions'
import { cancelVendorInvoice } from '@/app/purchase-actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function VendorLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // حالات الفلاتر الجديدة
  const [filter, setFilter] = useState<'ALL' | 'PURCHASE' | 'PAYMENT' | 'RETURN'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSafe, setSelectedSafe] = useState('ALL')
  
  // حالات مودال فاتورة الشراء اليدوية السريعة
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    const result = await getVendorLedger(id)
    if (result.success) {
      setData(result.data)
    } else {
      alert('خطأ: ' + result.error)
      router.push('/admin/vendors')
    }
    setLoading(false)
  }

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceNo || !invoiceAmount) {
      alert('رقم الفاتورة والمبلغ مطلوبين')
      return
    }

    setIsSaving(true)
    const result = await recordVendorInvoice({
      vendorId: id,
      invoiceNo,
      amount: parseFloat(invoiceAmount),
      notes: invoiceNotes,
    }, session?.user?.image as string)

    setIsSaving(false)

    if (result.success) {
      alert('✅ تم تسجيل الفاتورة')
      setShowInvoiceModal(false)
      setInvoiceNo('')
      setInvoiceAmount('')
      setInvoiceNotes('')
      loadData()
    } else {
      alert('❌ خطأ: ' + result.error)
    }
  }

  // حذف وإلغاء فاتورة مشتريات أو مرتجع مع عكس المخزون والخزنة
  const handleDeleteInvoice = async (reference: string, type: string) => {
    const isPurchase = type === 'PURCHASE'
    const confirmMsg = isPurchase
      ? `تحذير: سيتم حذف فاتورة المشتريات رقم (#${reference}).\nسيتم خصم الكميات المشتراة من المخزون وإلغاء أثر الخزنة ورصيد المورد.\nهل أنت متأكد؟`
      : `تحذير: سيتم حذف مرتجع المشتريات رقم (#${reference}).\nسيتم إعادة الكميات المرتجعة إلى المخزون وإلغاء أثر الخزنة ورصيد المورد.\nهل أنت متأكد؟`

    if (!confirm(confirmMsg)) return

    setIsDeletingInvoice(true)
    const res = await cancelVendorInvoice(reference)
    setIsDeletingInvoice(false)

    if (res.success) {
      alert(res.message)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const { vendor, ledger = [], summary } = data || {}

  // استخراج قائمة الخزن التي تمت عليها معاملات مع هذا المورد
  const availableSafes = useMemo(() => {
    if (!ledger || ledger.length === 0) return []
    const safesSet = new Set<string>()
    ledger.forEach((t: any) => {
      if (t.safe && t.safe !== 'غير محدد') {
        safesSet.add(t.safe)
      }
    })
    return Array.from(safesSet).sort()
  }, [ledger])

  // منطق التصفية الشامل (نوع، خزنة، تواريخ، بحث لايف)
  const filteredLedger = useMemo(() => {
    if (!ledger || ledger.length === 0) return []

    return ledger.filter((t: any) => {
      // 1. فلتر نوع الحركة
      if (filter !== 'ALL' && t.type !== filter) {
        return false
      }

      // 2. فلتر الخزنة
      if (selectedSafe !== 'ALL') {
        if (!t.safe || t.safe !== selectedSafe) {
          return false
        }
      }

      // 3. فلتر التواريخ
      if (startDate) {
        const itemDate = new Date(t.date)
        const filterStart = new Date(startDate + 'T00:00:00')
        if (itemDate < filterStart) return false
      }

      if (endDate) {
        const itemDate = new Date(t.date)
        const filterEnd = new Date(endDate + 'T23:59:59.999')
        if (itemDate > filterEnd) return false
      }

      // 4. بحث لايف فوري
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase().trim()
        const matchRef = t.reference?.toLowerCase().includes(query)
        const matchDesc = t.description?.toLowerCase().includes(query)
        const matchUser = t.user?.toLowerCase().includes(query)
        const matchSafe = t.safe?.toLowerCase().includes(query)
        const matchProduct = t.productName?.toLowerCase().includes(query)
        const matchAmount = (t.debit?.toString().includes(query) || t.credit?.toString().includes(query))

        if (!matchRef && !matchDesc && !matchUser && !matchSafe && !matchProduct && !matchAmount) {
          return false
        }
      }

      return true
    })
  }, [ledger, filter, selectedSafe, startDate, endDate, searchTerm])

  // إعادة ضبط كل الفلاتر
  const handleResetFilters = () => {
    setFilter('ALL')
    setSelectedSafe('ALL')
    setStartDate('')
    setEndDate('')
    setSearchTerm('')
  }

  const hasActiveFilters = filter !== 'ALL' || selectedSafe !== 'ALL' || startDate !== '' || endDate !== '' || searchTerm !== ''

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return <div className="p-10 text-center font-bold">جاري التحميل...</div>
  }

  if (!data) {
    return <div className="p-10 text-center text-red-600">المورد غير موجود</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans" dir="rtl">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          body { print-color-adjust: exact; }
          .bg-gray-50 { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="bg-white p-4 shadow mb-4 no-print rounded-xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">📊 كشف حساب المورد</h1>
            <p className="text-sm text-gray-600 mt-1">دفتر الأستاذ والمشتريات</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
            >
              🖨️ طباعة
            </button>
            <Link
              href="/admin/vendors"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-700 transition"
            >
              ← رجوع
            </Link>
          </div>
        </div>
      </div>

      {/* معلومات المورد */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 rounded-xl shadow-lg mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs opacity-80">اسم المورد</div>
            <div className="font-bold text-lg">{vendor?.name}</div>
          </div>
          <div>
            <div className="text-xs opacity-80">الكود</div>
            <div className="font-bold text-lg font-mono">{vendor?.code}</div>
          </div>
          <div>
            <div className="text-xs opacity-80">الهاتف</div>
            <div className="font-bold text-lg">{vendor?.phone || '-'}</div>
          </div>
          <div>
            <div className="text-xs opacity-80">عدد المنتجات</div>
            <div className="font-bold text-lg">{summary?.productsCount ?? 0}</div>
          </div>
        </div>
      </div>

      {/* الملخص المالي */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-blue-500">
          <div className="text-xs text-gray-600 mb-1">مشتريات (منتجات)</div>
          <div className="font-bold text-xl text-blue-700 font-mono">{(summary?.totalPurchasesFromProducts ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">من المخزون الافتتاحي</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-indigo-500">
          <div className="text-xs text-gray-600 mb-1">مشتريات (فواتير)</div>
          <div className="font-bold text-xl text-indigo-700 font-mono">{(summary?.totalPurchasesFromInvoices ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">فواتير مسجلة</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-orange-500">
          <div className="text-xs text-gray-600 mb-1">إجمالي المشتريات</div>
          <div className="font-bold text-xl text-orange-700 font-mono">{(summary?.totalPurchases ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">ج.م</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-green-500">
          <div className="text-xs text-gray-600 mb-1">المدفوعات</div>
          <div className="font-bold text-xl text-green-700 font-mono">{(summary?.totalPayments ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">ج.م</div>
        </div>
        <div className={`bg-white p-4 rounded-xl shadow border-r-4 ${
          (summary?.currentBalance ?? 0) > 0 ? 'border-red-500' : 'border-gray-500'
        }`}>
          <div className="text-xs text-gray-600 mb-1">الرصيد الحالي</div>
          <div className={`font-bold text-xl font-mono ${
            (summary?.currentBalance ?? 0) > 0 ? 'text-red-700' : 'text-gray-700'
          }`}>
            {(summary?.currentBalance ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            {(summary?.currentBalance ?? 0) > 0 ? 'له عندنا' : 'مديون'}
          </div>
        </div>
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex gap-2 mb-6 no-print flex-wrap">
        <Link
          href={`/admin/purchases/new`}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow flex items-center gap-1 transition"
        >
          <span>🛒</span>
          <span>فاتورة مشتريات مفصلة</span>
        </Link>
        <button
          onClick={() => setShowInvoiceModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 shadow transition"
        >
          📄 تسجيل فاتورة سريعة
        </button>
        <button
          onClick={() => router.push(`/payments/new`)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 shadow transition"
        >
          💰 دفع للمورد
        </button>
      </div>

      {/* وحدة الفلترة المتقدمة (بحث لايف + تواريخ + خزنة) */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 no-print space-y-3">
        
        {/* الصف الأول: البحث اللايف */}
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 بحث فوري في كشف الحساب (رقم الفاتورة، البيان، الصنف، الموظف، الخزنة)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm font-bold text-gray-800 focus:bg-white focus:border-purple-500 outline-none transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute left-3 top-3 text-gray-400 hover:text-red-500 text-sm font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* الصف الثاني: فلاتر التواريخ والخزنة والنوع */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          
          {/* من تاريخ */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">من تاريخ:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-700 bg-gray-50 focus:bg-white outline-none"
            />
          </div>

          {/* إلى تاريخ */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">إلى تاريخ:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-700 bg-gray-50 focus:bg-white outline-none"
            />
          </div>

          {/* فلتر الخزنة */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">🏦 الخزنة:</label>
            <select
              value={selectedSafe}
              onChange={(e) => setSelectedSafe(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-700 bg-gray-50 focus:bg-white outline-none"
            >
              <option value="ALL">جميع الخزن والمحافظ</option>
              {availableSafes.map((safeName) => (
                <option key={safeName} value={safeName}>{safeName}</option>
              ))}
            </select>
          </div>

          {/* زر إعادة التعيين */}
          <div>
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
            >
              <span>↺</span>
              <span>إعادة تعيين الفلاتر</span>
            </button>
          </div>

        </div>

        {/* الصف الثالث: تبويبات نوع الحركة وأزرار التصفية السريعة */}
        <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-gray-100">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                filter === 'ALL' ? 'bg-purple-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📋 الكل ({ledger.length})
            </button>
            <button
              onClick={() => setFilter('PURCHASE')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                filter === 'PURCHASE' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              📦 المشتريات ({ledger.filter((t: any) => t.type === 'PURCHASE').length})
            </button>
            <button
              onClick={() => setFilter('RETURN')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                filter === 'RETURN' ? 'bg-orange-600 text-white shadow-sm' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              ↩️ المرتجعات ({ledger.filter((t: any) => t.type === 'RETURN').length})
            </button>
            <button
              onClick={() => setFilter('PAYMENT')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                filter === 'PAYMENT' ? 'bg-green-600 text-white shadow-sm' : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              💰 المدفوعات ({ledger.filter((t: any) => t.type === 'PAYMENT').length})
            </button>
          </div>

          <div className="text-xs font-bold text-gray-500">
            الحركات المعروضة: <b className="text-purple-700">{filteredLedger.length}</b> من أصل {ledger.length}
          </div>
        </div>

      </div>

      {/* عنوان وتاريخ الفترة عند الطباعة */}
      {(startDate || endDate) && (
        <div className="mb-2 text-xs font-bold text-gray-600 bg-gray-100 p-2 rounded">
          فترة الكشف: {startDate ? `من ${startDate}` : ''} {endDate ? `إلى ${endDate}` : ''} {selectedSafe !== 'ALL' ? `| الخزنة: ${selectedSafe}` : ''}
        </div>
      )}

      {/* جدول الحركات */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-right min-w-[900px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-xs font-bold w-28">التاريخ</th>
              <th className="p-3 text-xs font-bold w-52">المرجع / الفاتورة</th>
              <th className="p-3 text-xs font-bold">الوصف</th>
              <th className="p-3 text-xs font-bold text-center w-28">مدين (له)</th>
              <th className="p-3 text-xs font-bold text-center w-28">دائن (علينا)</th>
              <th className="p-3 text-xs font-bold text-center w-32">الرصيد</th>
              <th className="p-3 text-xs font-bold w-24">الموظف</th>
              <th className="p-3 text-xs font-bold text-center w-28 no-print bg-gray-200">تحكم</th>
            </tr>
          </thead>
          <tbody>
            {filteredLedger.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-500 font-bold">
                  {hasActiveFilters ? 'لا توجد حركات تطابق الفلاتر المحددة' : 'لا توجد حركات مسجلة لهذا المورد'}
                </td>
              </tr>
            ) : (
              filteredLedger.map((t: any, idx: number) => {
                const isInvoice = (t.type === 'PURCHASE' || t.type === 'RETURN') && !t.isFromProducts && t.reference

                return (
                  <tr 
                    key={idx} 
                    className={`border-b hover:bg-gray-50 transition ${
                      t.isFromProducts ? 'bg-blue-50/80 font-semibold' : ''
                    }`}
                  >
                    <td className="p-3 text-sm">
                      {t.isFromProducts ? (
                        <span className="text-xs text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded">رصيد أول</span>
                      ) : (
                        <>
                          {new Date(t.date).toLocaleDateString('ar-EG')}
                          <div className="text-[11px] text-gray-400 font-mono">
                            {new Date(t.date).toLocaleTimeString('ar-EG', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </>
                      )}
                    </td>

                    {/* المرجع والأزرار بجواره */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm font-mono text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {t.reference}
                        </span>

                        {isInvoice && (
                          <div className="flex items-center gap-1 no-print">
                            <Link
                              href={`/admin/purchases/${encodeURIComponent(t.reference)}/edit`}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-1 rounded font-bold text-xs shadow-sm transition"
                              title="تعديل بنود الفاتورة"
                            >
                              ✏️
                            </Link>
                            <button
                              type="button"
                              disabled={isDeletingInvoice}
                              onClick={() => handleDeleteInvoice(t.reference, t.type)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 p-1 rounded font-bold text-xs shadow-sm transition"
                              title="إلغاء وحذف الفاتورة وعكس المخزون"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>

                      {t.productName && (
                        <div className="text-xs text-gray-600 mt-1">{t.productName}</div>
                      )}
                      {t.quantity && (
                        <div className="text-xs text-blue-600 font-bold mt-0.5">الكمية: {t.quantity}</div>
                      )}
                    </td>

                    <td className="p-3 text-sm text-gray-700">
                      {t.description}
                      {t.safe && (
                        <div className="text-xs text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                          <span>🏦</span>
                          <span>الخزنة: {t.safe}</span>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {(Number(t.debit) || 0) > 0 ? (
                        <span className="font-bold text-red-600 font-mono">
                          {(Number(t.debit) || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {(Number(t.credit) || 0) > 0 ? (
                        <span className="font-bold text-blue-700 font-mono">
                          {(Number(t.credit) || 0).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className={`p-3 text-center font-bold font-mono ${
                      (Number(t.balance) || 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {(Number(t.balance) || 0).toFixed(2)}
                    </td>

                    <td className="p-3 text-sm text-gray-600">{t.user}</td>
                    
                    {/* عمود تحكم بارز في أقصى اليسار */}
                    <td className="p-3 text-center no-print bg-gray-50/50">
                      {isInvoice ? (
                        <div className="flex justify-center items-center gap-1.5">
                          <Link
                            href={`/admin/purchases/${encodeURIComponent(t.reference)}/edit`}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-xs font-bold transition shadow"
                          >
                            ✏️ تعديل
                          </Link>

                          <button
                            type="button"
                            disabled={isDeletingInvoice}
                            onClick={() => handleDeleteInvoice(t.reference, t.type)}
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs font-bold transition shadow"
                          >
                            🗑️ إلغاء
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {filteredLedger.length > 0 && (
            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
              <tr>
                <td colSpan={3} className="p-3 text-left">إجمالي الحركات المعروضة:</td>
                <td className="p-3 text-center text-red-600 font-mono">
                  {filteredLedger.reduce((sum: number, t: any) => sum + (Number(t.debit) || 0), 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-blue-700 font-mono">
                  {filteredLedger.reduce((sum: number, t: any) => sum + (Number(t.credit) || 0), 0).toFixed(2)}
                </td>
                <td className="p-3 text-center font-mono">
                  {(Number(filteredLedger[filteredLedger.length - 1]?.balance) || 0).toFixed(2)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* مودال فاتورة الشراء السريعة */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-lg mb-4 border-b pb-2 text-center text-green-900">
              📄 تسجيل فاتورة شراء
            </h3>
            <form onSubmit={handleAddInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  رقم الفاتورة (مطلوب)
                </label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full border p-3 rounded-xl shadow-sm"
                  placeholder="مثال: INV-001"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  المبلغ الإجمالي (مطلوب)
                </label>
                <input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-full border p-3 rounded-xl shadow-sm text-2xl font-bold"
                  placeholder="0.00"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  ملاحظات
                </label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full border p-3 rounded-xl shadow-sm"
                  rows={3}
                  placeholder="تفاصيل إضافية..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 bg-gray-100 py-3 rounded-lg font-bold hover:bg-gray-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-green-700"
                >
                  {isSaving ? '⏳ جاري الحفظ...' : 'حفظ الفاتورة ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}