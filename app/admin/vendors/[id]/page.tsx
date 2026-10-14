'use client'

import { useEffect, useState, use } from 'react'
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
  const [filter, setFilter] = useState<'ALL' | 'PURCHASE' | 'PAYMENT' | 'RETURN'>('ALL')
  
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

  if (loading) {
    return <div className="p-10 text-center font-bold">جاري التحميل...</div>
  }

  if (!data) {
    return <div className="p-10 text-center text-red-600">المورد غير موجود</div>
  }

  const { vendor, ledger, summary } = data

  const filteredLedger = filter === 'ALL' 
    ? ledger 
    : ledger.filter((t: any) => t.type === filter)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
          body { print-color-adjust: exact; }
        }
      `}</style>

      {/* Header */}
      <div className="bg-white p-4 shadow mb-4 no-print">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">📊 كشف حساب المورد</h1>
            <p className="text-sm text-gray-600 mt-1">دفتر الأستاذ والمشتريات</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700"
            >
              🖨️ طباعة
            </button>
            <Link
              href="/admin/vendors"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-700"
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
            <div className="font-bold text-lg">{vendor?.code}</div>
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

      {/* الملخص مؤمن بالكامل ضد الـ undefined */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-blue-500">
          <div className="text-xs text-gray-600 mb-1">مشتريات (منتجات)</div>
          <div className="font-bold text-xl text-blue-700">{(summary?.totalPurchasesFromProducts ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">من المخزون</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-indigo-500">
          <div className="text-xs text-gray-600 mb-1">مشتريات (فواتير)</div>
          <div className="font-bold text-xl text-indigo-700">{(summary?.totalPurchasesFromInvoices ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">فواتير مسجلة</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-orange-500">
          <div className="text-xs text-gray-600 mb-1">إجمالي المشتريات</div>
          <div className="font-bold text-xl text-orange-700">{(summary?.totalPurchases ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">ج.م</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-r-4 border-green-500">
          <div className="text-xs text-gray-600 mb-1">المدفوعات</div>
          <div className="font-bold text-xl text-green-700">{(summary?.totalPayments ?? 0).toFixed(2)}</div>
          <div className="text-xs text-gray-500">ج.م</div>
        </div>
        <div className={`bg-white p-4 rounded-xl shadow border-r-4 ${
          (summary?.currentBalance ?? 0) > 0 ? 'border-red-500' : 'border-gray-500'
        }`}>
          <div className="text-xs text-gray-600 mb-1">الرصيد الحالي</div>
          <div className={`font-bold text-xl ${
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
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow flex items-center gap-1"
        >
          <span>🛒</span>
          <span>فاتورة مشتريات مفصلة</span>
        </Link>
        <button
          onClick={() => setShowInvoiceModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 shadow"
        >
          📄 تسجيل فاتورة سريعة
        </button>
        <button
          onClick={() => router.push(`/payments/new`)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 shadow"
        >
          💰 دفع للمورد
        </button>
      </div>

      {/* الفلاتر */}
      <div className="bg-white p-4 rounded-xl shadow mb-4 no-print">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-lg font-bold text-sm ${
              filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            📋 الكل ({ledger.length})
          </button>
          <button
            onClick={() => setFilter('PURCHASE')}
            className={`px-4 py-2 rounded-lg font-bold text-sm ${
              filter === 'PURCHASE' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
            }`}
          >
            📦 المشتريات ({ledger.filter((t: any) => t.type === 'PURCHASE').length})
          </button>
          <button
            onClick={() => setFilter('RETURN')}
            className={`px-4 py-2 rounded-lg font-bold text-sm ${
              filter === 'RETURN' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'
            }`}
          >
            ↩️ المرتجعات ({ledger.filter((t: any) => t.type === 'RETURN').length})
          </button>
          <button
            onClick={() => setFilter('PAYMENT')}
            className={`px-4 py-2 rounded-lg font-bold text-sm ${
              filter === 'PAYMENT' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700'
            }`}
          >
            💰 المدفوعات ({ledger.filter((t: any) => t.type === 'PAYMENT').length})
          </button>
        </div>
      </div>

      {/* جدول الحركات */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-right min-w-[900px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-xs font-bold w-28">التاريخ</th>
              <th className="p-3 text-xs font-bold w-48">المرجع / الفاتورة</th>
              <th className="p-3 text-xs font-bold">الوصف</th>
              <th className="p-3 text-xs font-bold text-center w-28">مدين (له)</th>
              <th className="p-3 text-xs font-bold text-center w-28">دائن (علينا)</th>
              <th className="p-3 text-xs font-bold text-center w-32">الرصيد</th>
              <th className="p-3 text-xs font-bold w-24">الموظف</th>
              <th className="p-3 text-xs font-bold text-center w-32 no-print bg-gray-200">تحكم</th>
            </tr>
          </thead>
          <tbody>
            {filteredLedger.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-gray-500">
                  لا توجد حركات
                </td>
              </tr>
            ) : (
              filteredLedger.map((t: any, idx: number) => {
                const isInvoice = (t.type === 'PURCHASE' || t.type === 'RETURN') && !t.isFromProducts && t.reference

                return (
                  <tr 
                    key={idx} 
                    className={`border-b hover:bg-gray-50 ${
                      t.isFromProducts ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="p-3 text-sm">
                      {t.isFromProducts ? (
                        <span className="text-xs text-blue-600 font-bold">مخزون حالي</span>
                      ) : (
                        <>
                          {new Date(t.date).toLocaleDateString('ar-EG')}
                          <div className="text-xs text-gray-500">
                            {new Date(t.date).toLocaleTimeString('ar-EG', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </>
                      )}
                    </td>

                    {/* عمود المرجع ومعه أزرار التعديل والحذف مباشرة */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm font-mono text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {t.reference}
                        </span>

                        {isInvoice && (
                          <div className="flex items-center gap-1 no-print">
                            <Link
                              href={`/admin/purchases/${encodeURIComponent(t.reference)}/edit`}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-1 rounded font-bold text-xs shadow-sm"
                              title="تعديل بنود الفاتورة"
                            >
                              ✏️
                            </Link>
                            <button
                              type="button"
                              disabled={isDeletingInvoice}
                              onClick={() => handleDeleteInvoice(t.reference, t.type)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 p-1 rounded font-bold text-xs shadow-sm"
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
                        <div className="text-xs text-gray-500">الخزنة: {t.safe}</div>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {(Number(t.debit) || 0) > 0 && (
                        <span className="font-bold text-red-600 font-mono">
                          {(Number(t.debit) || 0).toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {(Number(t.credit) || 0) > 0 && (
                        <span className="font-bold text-blue-700 font-mono">
                          {(Number(t.credit) || 0).toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className={`p-3 text-center font-bold font-mono ${
                      (Number(t.balance) || 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {(Number(t.balance) || 0).toFixed(2)}
                    </td>

                    <td className="p-3 text-sm text-gray-600">{t.user}</td>
                    
                    {/* عمود تحكم بارز في أقصى اليسار أيضاً */}
                    <td className="p-3 text-center no-print bg-gray-50/50">
                      {isInvoice ? (
                        <div className="flex justify-center items-center gap-1.5">
                          <Link
                            href={`/admin/purchases/${encodeURIComponent(t.reference)}/edit`}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shadow"
                          >
                            ✏️ تعديل
                          </Link>

                          <button
                            type="button"
                            disabled={isDeletingInvoice}
                            onClick={() => handleDeleteInvoice(t.reference, t.type)}
                            className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shadow"
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
            <tfoot className="bg-gray-100 font-bold">
              <tr>
                <td colSpan={3} className="p-3 text-left">الإجمالي:</td>
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