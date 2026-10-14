'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getVendors } from '@/app/vendor-actions'
import { getSafesList } from '@/app/report-actions'
import { 
  getPurchaseInvoiceDetails, 
  updatePurchaseInvoice, 
  searchProductsForPurchase, 
  getModelColors 
} from '@/app/purchase-actions'

interface InvoiceRow {
  id: string
  modelNo: string
  color: string
  quantity: number | string
  cost: number | string
  price: number | string
  description?: string
}

export default function EditPurchaseInvoicePage({ params }: { params: Promise<{ invoiceNo: string }> }) {
  const resolvedParams = use(params)
  const invoiceNumber = decodeURIComponent(resolvedParams.invoiceNo)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [invoiceType, setInvoiceType] = useState<'PURCHASE' | 'RETURN'>('PURCHASE')
  const [paymentStatus, setPaymentStatus] = useState<'CREDIT' | 'CASH'>('CREDIT')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [notes, setNotes] = useState('')

  const [safes, setSafes] = useState<any[]>([])
  const [selectedSafeId, setSelectedSafeId] = useState('')
  const [vendors, setVendors] = useState<any[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [vendorName, setVendorName] = useState('')

  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // البحث الحي
  const [activeModelSearchIndex, setActiveModelSearchIndex] = useState<number | null>(null)
  const [modelSuggestions, setModelSuggestions] = useState<any[]>([])
  const [activeColorRowIndex, setActiveColorRowIndex] = useState<number | null>(null)
  const [availableColors, setAvailableColors] = useState<any[]>([])

  const inputRefs = useRef<{ [key: string]: HTMLElement | null }>({})

  useEffect(() => {
    Promise.all([
      getVendors(),
      getSafesList(),
      getPurchaseInvoiceDetails(invoiceNumber)
    ]).then(([resVendors, resSafes, resInvoice]) => {
      setVendors(resVendors || [])
      setSafes(resSafes || [])

      if (resInvoice.success && resInvoice.invoice) {
        const inv = resInvoice.invoice
        setInvoiceType(inv.invoiceType === 'RETURN' ? 'RETURN' : 'PURCHASE')
        setPaymentStatus(inv.paymentStatus === 'CASH' ? 'CASH' : 'CREDIT')
        setSelectedSafeId(inv.safeId || (resSafes?.[0]?.id || ''))
        setSelectedVendorId(inv.vendorId)
        setVendorName(inv.vendorName)
        setInvoiceDate(inv.date)
        setNotes(inv.notes || '')
        setRows(inv.items.map((it: any, idx: number) => ({
          id: `item-${idx}-${Date.now()}`,
          modelNo: it.modelNo,
          color: it.color,
          quantity: it.quantity,
          cost: it.cost,
          price: it.price,
          description: it.description
        })))
      } else {
        alert(resInvoice.error || 'فشل جلب بيانات الفاتورة')
        router.push('/admin/vendors')
      }
      setLoading(false)
    })
  }, [invoiceNumber, router])

  const addNewRow = () => {
    const newId = `row-${Date.now()}`
    setRows(prev => [
      ...prev,
      { id: newId, modelNo: '', color: '', quantity: 1, cost: '', price: '', description: '' }
    ])
  }

  const removeRow = (index: number) => {
    if (rows.length === 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof InvoiceRow, value: any) => {
    setRows(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const handleModelSearch = async (index: number, term: string) => {
    updateRow(index, 'modelNo', term)
    if (term.trim().length >= 1) {
      setActiveModelSearchIndex(index)
      const results = await searchProductsForPurchase(term)
      setModelSuggestions(results)
    } else {
      setModelSuggestions([])
      setActiveModelSearchIndex(null)
    }
  }

  const handleSelectModel = (index: number, item: any) => {
    updateRow(index, 'modelNo', item.modelNo)
    if (item.cost) updateRow(index, 'cost', item.cost)
    if (item.price) updateRow(index, 'price', item.price)
    setActiveModelSearchIndex(null)
    handleColorFocus(index, item.modelNo)
  }

  const handleColorFocus = async (index: number, explicitModelNo?: string) => {
    const targetModel = (explicitModelNo || rows[index].modelNo || '').trim()
    if (!targetModel) return
    setActiveColorRowIndex(index)
    const colorsList = await getModelColors(targetModel)
    setAvailableColors(colorsList)
  }

  const handleSelectColor = (index: number, colorItem: any) => {
    updateRow(index, 'color', colorItem.color)
    if (colorItem.cost) updateRow(index, 'cost', colorItem.cost)
    if (colorItem.price) updateRow(index, 'price', colorItem.price)
    setActiveColorRowIndex(null)
  }

  const totalQuantity = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const totalAmount = rows.reduce((sum, r) => sum + ((Number(r.quantity) || 0) * (Number(r.cost) || 0)), 0)

  const handleUpdate = async () => {
    const validItems = rows.filter(r => r.modelNo.trim() !== '' && Number(r.quantity) > 0)
    if (validItems.length === 0) {
      alert('يجب إدخال صنف واحد على الأقل بكمية صالحة')
      return
    }

    if (!confirm(`تأكيد حفظ التعديلات على الفاتورة #${invoiceNumber}؟`)) return

    setIsSaving(true)
    const res = await updatePurchaseInvoice(invoiceNumber, {
      vendorId: selectedVendorId,
      invoiceType,
      paymentStatus,
      safeId: paymentStatus === 'CASH' ? selectedSafeId : undefined,
      invoiceNo: invoiceNumber,
      date: invoiceDate,
      notes,
      items: validItems.map(r => ({
        modelNo: r.modelNo.trim(),
        color: r.color.trim() || 'لون',
        quantity: Number(r.quantity),
        cost: Number(r.cost) || 0,
        price: Number(r.price) || 0,
        description: r.description
      }))
    })
    setIsSaving(false)

    if (res.success) {
      alert(res.message)
      router.push(`/admin/vendors/${selectedVendorId}`)
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold">
        جاري تحميل بنود الفاتورة...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      
      <div className="max-w-7xl mx-auto flex justify-between items-center bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span>✏️ تعديل فاتورة:</span>
            <span className="text-amber-400 font-mono">#{invoiceNumber}</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1">المورد: <b className="text-white">{vendorName}</b></p>
        </div>

        <Link href={`/admin/vendors/${selectedVendorId}`} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold">
          ← إلغاء ورجوع
        </Link>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* إعدادات الفاتورة */}
        <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">نوع الفاتورة</label>
            <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-bold text-sm text-center">
              {invoiceType === 'PURCHASE' ? '📥 فاتورة شراء' : '📤 مرتجع مورد'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">طريقة السداد</label>
            <select
              value={paymentStatus}
              onChange={(e: any) => setPaymentStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-bold text-sm outline-none"
            >
              <option value="CREDIT">⏳ آجل</option>
              <option value="CASH">💵 نقدي</option>
            </select>
          </div>

          {paymentStatus === 'CASH' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">الخزنة</label>
              <select
                value={selectedSafeId}
                onChange={(e) => setSelectedSafeId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-bold text-sm outline-none"
              >
                {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">التاريخ</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-bold text-sm outline-none"
            />
          </div>
        </div>

        {/* جدول بنود الفاتورة القابلة للتعديل */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-visible">
          <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center rounded-t-2xl">
            <h3 className="font-bold text-white text-base">بنود الفاتورة (يمكنك تعديل الكمية، التكلفة، أو إضافة وحذف أسطر)</h3>
            <button onClick={addNewRow} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
              + سطر جديد
            </button>
          </div>

          <div className="overflow-x-auto min-h-[250px]">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-56">كود الموديل</th>
                  <th className="p-3 w-40">اللون</th>
                  <th className="p-3 w-28 text-center">الكمية</th>
                  <th className="p-3 w-32 text-center">سعر التكلفة</th>
                  <th className="p-3 w-32 text-center">سعر البيع</th>
                  <th className="p-3 w-36 text-center">الإجمالي</th>
                  <th className="p-3">الوصف</th>
                  <th className="p-3 w-12 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {rows.map((row, index) => {
                  const lineTotal = (Number(row.quantity) || 0) * (Number(row.cost) || 0)

                  return (
                    <tr key={row.id} className="hover:bg-slate-700/30">
                      <td className="p-3 text-center text-slate-400 font-bold text-xs">{index + 1}</td>

                      <td className="p-2 relative">
                        <input
                          type="text"
                          value={row.modelNo}
                          onChange={(e) => handleModelSearch(index, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-bold text-sm outline-none"
                        />
                        {activeModelSearchIndex === index && modelSuggestions.length > 0 && (
                          <div className="absolute top-full right-0 w-72 z-50 bg-slate-800 border-2 border-blue-500 rounded-xl shadow-2xl mt-1 max-h-48 overflow-y-auto">
                            {modelSuggestions.map(prod => (
                              <div
                                key={prod.id}
                                onClick={() => handleSelectModel(index, prod)}
                                className="p-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between text-xs"
                              >
                                <span className="font-bold text-white">{prod.modelNo}</span>
                                <span className="text-emerald-400 font-mono">{prod.cost} ج.م</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="p-2 relative">
                        <input
                          type="text"
                          value={row.color}
                          onChange={(e) => updateRow(index, 'color', e.target.value)}
                          onFocus={() => handleColorFocus(index)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none"
                        />
                        {activeColorRowIndex === index && availableColors.length > 0 && (
                          <div className="absolute top-full right-0 w-56 z-50 bg-slate-800 border-2 border-emerald-500 rounded-xl shadow-2xl mt-1 max-h-48 overflow-y-auto">
                            {availableColors.map(c => (
                              <div
                                key={c.id}
                                onClick={() => handleSelectColor(index, c)}
                                className="p-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between text-xs"
                              >
                                <span className="text-white font-bold">{c.color}</span>
                                <span className="text-emerald-400 font-mono">{c.cost} ج.م</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-white font-bold text-sm outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={row.cost}
                          onChange={(e) => updateRow(index, 'cost', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-emerald-400 font-bold font-mono text-sm outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={row.price}
                          onChange={(e) => updateRow(index, 'price', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-blue-400 font-bold font-mono text-sm outline-none"
                        />
                      </td>

                      <td className="p-3 text-center font-bold text-white font-mono">
                        {lineTotal.toLocaleString()} ج.م
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          value={row.description || ''}
                          onChange={(e) => updateRow(index, 'description', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs outline-none"
                        />
                      </td>

                      <td className="p-2 text-center">
                        <button onClick={() => removeRow(index)} className="text-red-400 hover:text-red-300 p-1">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-slate-900 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 rounded-b-2xl">
            <div className="flex gap-6 text-sm">
              <div>إجمالي القطع: <b className="text-blue-400 font-mono text-base">{totalQuantity}</b></div>
              <div>صافي الفاتورة المعدلة: <b className="text-emerald-400 font-mono text-2xl">{totalAmount.toLocaleString()} ج.م</b></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white px-8 py-3 rounded-xl font-black text-sm shadow-xl transition"
              >
                {isSaving ? 'جاري حفظ وتحديث المخزون...' : '💾 اعتماد وحفظ تعديلات الفاتورة'}
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}