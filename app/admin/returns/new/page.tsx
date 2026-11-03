'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { searchCustomers, searchProducts, getSafes } from '@/app/actions'
import { getCustomerOrdersForReturn, createUnifiedReturnOrder } from '@/app/return-actions'

interface ReturnLineItem {
  productId: string
  orderItemId?: string | null
  modelNo: string
  color: string
  unitPrice: number
  quantity: number
  maxQuantity?: number
}

interface ExchangeLineItem {
  productId: string
  modelNo: string
  color: string
  price: number
  quantity: number
  currentStock: number
}

export default function NewReturnOrderPage() {
  const router = useRouter()

  // حالة العميل المختار والبحث اللايف
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  // وضع المرتجع: من فاتورة سابقة أو مرتجع حر
  const [mode, setMode] = useState<'FROM_ORDER' | 'FREE'>('FROM_ORDER')

  // فواتير العميل المختار (بحث لايف في أرقام فواتيره فقط)
  const [customerOrders, setCustomerOrders] = useState<any[]>([])
  const [orderSearchText, setOrderSearchText] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  // نوع المرتجع المالي
  const [returnType, setReturnType] = useState<'PARTIAL' | 'FULL' | 'EXCHANGE'>('PARTIAL')
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CREDIT'>('CASH')

  // الخزن
  const [safes, setSafes] = useState<any[]>([])
  const [selectedSafeId, setSelectedSafeId] = useState('')

  // بنود المرتجع (الراجعة للمخزن)
  const [returnItems, setReturnItems] = useState<ReturnLineItem[]>([])

  // بنود الاستبدال (الخارجة من المخزن بديلة)
  const [exchangeItems, setExchangeItems] = useState<ExchangeLineItem[]>([])

  // بحث الأصناف للمرتجع الحر أو الاستبدال
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<any[]>([])
  const [searchTarget, setSearchTarget] = useState<'RETURN' | 'EXCHANGE'>('RETURN')

  // ملاحظات وسبب
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // تحميل الخزن عند البدء
  useEffect(() => {
    getSafes().then((res: any[]) => {
      setSafes(res || [])
      if (res && res.length > 0) {
        const main = res.find(s => s.name === 'الخزنة الرئيسية')
        setSelectedSafeId(main?.id || res[0].id)
      }
    })

    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // البحث اللايف في العملاء
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (customerSearch.trim().length >= 1 && (!selectedCustomer || selectedCustomer.name !== customerSearch)) {
        const results = await searchCustomers(customerSearch)
        setCustomerResults(results || [])
        setShowCustomerDropdown(true)
      } else {
        setCustomerResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [customerSearch, selectedCustomer])

  // جلب فواتير العميل المختار والبحث اللايف برقم الفاتورة
  useEffect(() => {
    if (selectedCustomer?.id && mode === 'FROM_ORDER') {
      setLoadingOrders(true)
      const timer = setTimeout(async () => {
        const res = await getCustomerOrdersForReturn(selectedCustomer.id, orderSearchText)
        if (res.success) {
          setCustomerOrders(res.orders || [])
        }
        setLoadingOrders(false)
      }, 200)
      return () => clearTimeout(timer)
    } else {
      setCustomerOrders([])
    }
  }, [selectedCustomer, mode, orderSearchText])

  // البحث اللايف في الأصناف (للمرتجع الحر أو الاستبدال)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (productSearch.trim().length >= 1) {
        const results = await searchProducts(productSearch)
        setProductResults(results || [])
      } else {
        setProductResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [productSearch])

  // اختيار العميل
  const handleSelectCustomer = (cust: any) => {
    setSelectedCustomer(cust)
    setCustomerSearch(cust.name)
    setShowCustomerDropdown(false)
    setSelectedOrder(null)
    setReturnItems([])
    setExchangeItems([])
    setOrderSearchText('')
  }

  // اختيار فاتورة سابقة للعميل
  const handleSelectOrder = (order: any) => {
    setSelectedOrder(order)
    // تحميل بنود الفاتورة كأصناف مقترحة للمرتجع
    setReturnItems(
      order.items.map((it: any) => ({
        productId: it.productId,
        orderItemId: it.orderItemId,
        modelNo: it.modelNo,
        color: it.color,
        unitPrice: it.price,
        quantity: it.quantity,
        maxQuantity: it.quantity
      }))
    )
  }

  // إضافة صنف للمرتجع الحر
  const handleAddFreeReturnProduct = (prod: any) => {
    const existing = returnItems.find(i => i.productId === prod.id)
    if (existing) {
      setReturnItems(prev => prev.map(i => i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setReturnItems(prev => [
        ...prev,
        {
          productId: prod.id,
          orderItemId: null,
          modelNo: prod.modelNo,
          color: prod.color,
          unitPrice: prod.price,
          quantity: 1
        }
      ])
    }
    setProductSearch('')
    setProductResults([])
  }

  // إضافة صنف بديل للاستبدال
  const handleAddExchangeProduct = (prod: any) => {
    const existing = exchangeItems.find(i => i.productId === prod.id)
    if (existing) {
      setExchangeItems(prev => prev.map(i => i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setExchangeItems(prev => [
        ...prev,
        {
          productId: prod.id,
          modelNo: prod.modelNo,
          color: prod.color,
          price: prod.price,
          quantity: 1,
          currentStock: prod.currentStock
        }
      ])
    }
    setProductSearch('')
    setProductResults([])
  }

  // تعديل كمية أو سعر الصنف المرتجع
  const updateReturnItem = (index: number, updates: Partial<ReturnLineItem>) => {
    setReturnItems(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...updates }
      return copy
    })
  }

  const removeReturnItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateExchangeItem = (index: number, updates: Partial<ExchangeLineItem>) => {
    setExchangeItems(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...updates }
      return copy
    })
  }

  const removeExchangeItem = (index: number) => {
    setExchangeItems(prev => prev.filter((_, i) => i !== index))
  }

  // الحسابات المالية
  const totalRefundAmount = useMemo(() => {
    return returnItems.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0)
  }, [returnItems])

  const totalExchangeAmount = useMemo(() => {
    return exchangeItems.reduce((sum, it) => sum + ((Number(it.quantity) || 0) * (Number(it.price) || 0)), 0)
  }, [exchangeItems])

  const exchangeDifference = totalExchangeAmount - totalRefundAmount

  // حفظ الفاتورة الموحدة
  const handleSaveReturn = async () => {
    if (!selectedCustomer) return alert('يرجى اختيار العميل أولاً')
    if (returnItems.length === 0) return alert('يجب إضافة صنف واحد على الأقل للمرتجع')

    if (returnType === 'EXCHANGE' && exchangeItems.length === 0) {
      return alert('في وضع الاستبدال، يجب إضافة صنف بديل واحد على الأقل')
    }

    if (refundMethod === 'CASH' && !selectedSafeId && returnType !== 'EXCHANGE') {
      return alert('يرجى اختيار الخزنة للصرف النقدي')
    }

    if (!confirm('تأكيد حفظ واعتماد فاتورة المرتجع؟ سيتم تعديل المخزون والحسابات المالية فوراً.')) return

    setIsSubmitting(true)
    const res = await createUnifiedReturnOrder({
      customerId: selectedCustomer.id,
      originalOrderId: selectedOrder?.id || null,
      returnType,
      refundMethod,
      safeId: selectedSafeId || null,
      reason,
      notes,
      returnItems: returnItems.map(it => ({
        productId: it.productId,
        orderItemId: it.orderItemId || null,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0
      })),
      exchangeItems: returnType === 'EXCHANGE' ? exchangeItems.map(it => ({
        productId: it.productId,
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0
      })) : []
    })
    setIsSubmitting(false)

    if (res.success) {
      alert(res.message)
      router.push('/admin/returns')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans pb-36" dir="rtl">
      
      {/* رأس الصفحة */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">↩️</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">إنشاء فاتورة مرتجع مبيعات</h1>
              <p className="text-slate-400 text-xs mt-1">
                مرتجع مرتبط بفاتورة سابقة (مع بحث لايف في فواتير العميل) أو مرتجع حر واستبدال وتسوية نقدية
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/returns"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
          >
            📋 سجل المرتجعات
          </Link>
          <Link
            href="/admin"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
          >
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">

        {/* 1. اختيار العميل (بحث حي) */}
        <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg relative" ref={customerRef}>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            👤 اختيار العميل المعني بالمرتجع (بحث حي بالاسم، الكود، أو الهاتف) *
          </label>

          <input
            type="text"
            placeholder="ابحث باسم العميل أو هاتفه..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            onFocus={() => setShowCustomerDropdown(true)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-red-500"
          />

          {showCustomerDropdown && customerResults.length > 0 && (
            <div className="absolute top-full right-5 left-5 z-50 bg-slate-950 border-2 border-red-500 rounded-xl shadow-2xl mt-1 max-h-56 overflow-y-auto divide-y divide-slate-800">
              {customerResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  className="p-3 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-xs"
                >
                  <div>
                    <span className="font-bold text-white text-sm">{c.name}</span>
                    <span className="text-slate-400 font-mono text-[11px] mr-2 font-bold">({c.code})</span>
                  </div>
                  <span className="text-slate-400 font-mono">{c.phone || '-'}</span>
                </div>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="mt-3 p-3 bg-red-950/30 border border-red-500/40 rounded-xl text-xs flex justify-between items-center">
              <div>
                <span className="text-red-400 font-bold">العميل المحدد: </span>
                <b className="text-white text-sm">{selectedCustomer.name}</b>
                <span className="text-slate-400 font-mono mr-2">| هاتف: {selectedCustomer.phone || '-'}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                className="text-red-400 hover:text-red-300 font-bold"
              >
                ✕ تغيير العميل
              </button>
            </div>
          )}
        </div>

        {/* 2. نوع المرتجع واختيار الفاتورة */}
        {selectedCustomer && (
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg space-y-4">
            
            <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-3">
              <button
                type="button"
                onClick={() => { setMode('FROM_ORDER'); setReturnItems([]); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  mode === 'FROM_ORDER' ? 'bg-red-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span>🧾</span>
                <span>مرتجع من فاتورة سابقة للعميل</span>
              </button>

              <button
                type="button"
                onClick={() => { setMode('FREE'); setSelectedOrder(null); setReturnItems([]); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  mode === 'FREE' ? 'bg-amber-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span>⚡</span>
                <span>مرتجع حر (بدون التقيد بفاتورة سابقة)</span>
              </button>
            </div>

            {/* في حال "من فاتورة سابقة": بحث لايف محصور في فواتير هذا العميل فقط */}
            {mode === 'FROM_ORDER' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">
                    🔍 ابحث في أرقام وتواريخ فواتير العميل ({selectedCustomer.name}):
                  </span>
                  <div className="w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="اكتب رقم الفاتورة للفلترة..."
                      value={orderSearchText}
                      onChange={(e) => setOrderSearchText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {loadingOrders ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-bold">جاري تحميل فواتير العميل...</div>
                ) : customerOrders.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                    لا توجد فواتير سابقة مسجلة لهذا العميل تطابق البحث
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-56 overflow-y-auto">
                    {customerOrders.map((ord) => {
                      const isChosen = selectedOrder?.id === ord.id
                      return (
                        <div
                          key={ord.id}
                          onClick={() => handleSelectOrder(ord)}
                          className={`p-3 rounded-xl border cursor-pointer transition ${
                            isChosen
                              ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/30'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-white font-mono text-sm">أوردر #{ord.orderNo}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{ord.date}</span>
                          </div>
                          <div className="text-xs text-emerald-400 font-mono font-bold">
                            الإجمالي: {ord.totalAmount.toLocaleString()} ج.م
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {ord.items.length} صنف مسجل
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* في حال المرتجع الحر: شريط إضافة الأصناف بالبحث */}
            {mode === 'FREE' && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  📦 ابحث عن الصنف لإضافته للمرتجع الحر (بالموديل أو اللون):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ابحث برقم الموديل..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setSearchTarget('RETURN'); }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none focus:border-amber-500"
                  />
                  {searchTarget === 'RETURN' && productResults.length > 0 && (
                    <div className="absolute top-full right-0 left-0 z-50 bg-slate-950 border-2 border-amber-500 rounded-xl shadow-2xl mt-1 max-h-52 overflow-y-auto divide-y divide-slate-800">
                      {productResults.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleAddFreeReturnProduct(p)}
                          className="p-2.5 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{p.modelNo}</span>
                            <span className="text-amber-400 mr-2">({p.color})</span>
                          </div>
                          <span className="text-emerald-400 font-mono font-bold">{p.price} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* 3. جدول الأصناف المرتجعة */}
        {selectedCustomer && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>↩️ الأصناف المرتجعة (ستعود للمخزن وتخفض قيمة الحساب)</span>
                <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/40 px-2 py-0.5 rounded-full font-bold">
                  {returnItems.length} صنف
                </span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">الموديل</th>
                    <th className="p-3 w-32">اللون</th>
                    <th className="p-3 text-center w-36">الكمية المرتجعة</th>
                    <th className="p-3 text-center w-36">سعر القطعة (ج.م)</th>
                    <th className="p-3 text-center w-36">الإجمالي</th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {returnItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-bold">
                        لم يتم اختيار أو إضافة أي أصناف للمرتجع بعد
                      </td>
                    </tr>
                  ) : (
                    returnItems.map((item, idx) => {
                      const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-3 font-bold text-white text-sm">{item.modelNo}</td>
                          <td className="p-3 text-amber-400 font-bold">{item.color}</td>

                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="1"
                              max={item.maxQuantity || undefined}
                              value={item.quantity}
                              onChange={(e) => updateReturnItem(idx, { quantity: parseInt(e.target.value) || 1 })}
                              className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-center font-black font-mono text-white text-sm outline-none focus:border-red-500"
                            />
                            {item.maxQuantity && (
                              <span className="block text-[10px] text-slate-500 mt-0.5">من أصل {item.maxQuantity}</span>
                            )}
                          </td>

                          <td className="p-2 text-center">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateReturnItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-center font-bold font-mono text-emerald-400 text-sm outline-none focus:border-red-500"
                            />
                          </td>

                          <td className="p-3 text-center font-black font-mono text-white text-sm">
                            {lineTotal.toLocaleString()} ج.م
                          </td>

                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeReturnItem(idx)}
                              className="text-red-400 hover:text-red-300 font-bold"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">إجمالي قيمة المرتجع:</span>
              <span className="font-black font-mono text-base text-red-400">
                {totalRefundAmount.toLocaleString()} ج.م
              </span>
            </div>
          </div>
        )}

        {/* 4. خيار الاستبدال (أصناف بديلة) */}
        {selectedCustomer && (
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <span>🔄 هل توجد أصناف بديلة (استبدال فوري)؟</span>
                </h3>
                <p className="text-[11px] text-slate-400">إذا كان العميل يستبدل بضاعة بأخرى جديدة من المحل</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReturnType(returnType === 'EXCHANGE' ? 'PARTIAL' : 'EXCHANGE')
                    if (returnType === 'EXCHANGE') setExchangeItems([])
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                    returnType === 'EXCHANGE'
                      ? 'bg-blue-600 text-white border-blue-500 shadow'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {returnType === 'EXCHANGE' ? '✓ مفعل كاستبدال فوري' : '+ تفعيل وضع الاستبدال'}
                </button>
              </div>
            </div>

            {returnType === 'EXCHANGE' && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍 ابحث عن الصنف البديل لإضافته للاستبدال..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setSearchTarget('EXCHANGE'); }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold outline-none focus:border-blue-500"
                  />
                  {searchTarget === 'EXCHANGE' && productResults.length > 0 && (
                    <div className="absolute top-full right-0 left-0 z-50 bg-slate-950 border-2 border-blue-500 rounded-xl shadow-2xl mt-1 max-h-52 overflow-y-auto divide-y divide-slate-800">
                      {productResults.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleAddExchangeProduct(p)}
                          className="p-2.5 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{p.modelNo}</span>
                            <span className="text-amber-400 mr-2">({p.color})</span>
                          </div>
                          <span className="text-emerald-400 font-mono font-bold">{p.price} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {exchangeItems.length > 0 && (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="p-2.5">الصنف البديل</th>
                          <th className="p-2.5">اللون</th>
                          <th className="p-2.5 text-center w-28">الكمية</th>
                          <th className="p-2.5 text-center w-28">السعر</th>
                          <th className="p-2.5 text-center w-28">الإجمالي</th>
                          <th className="p-2.5 w-10 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {exchangeItems.map((ex, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-bold text-white">{ex.modelNo}</td>
                            <td className="p-2.5 text-amber-400">{ex.color}</td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                min="1"
                                value={ex.quantity}
                                onChange={(e) => updateExchangeItem(idx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-20 bg-slate-900 border border-slate-700 rounded p-1 text-center font-bold text-white text-xs outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                value={ex.price}
                                onChange={(e) => updateExchangeItem(idx, { price: parseFloat(e.target.value) || 0 })}
                                className="w-20 bg-slate-900 border border-slate-700 rounded p-1 text-center font-bold text-emerald-400 text-xs outline-none"
                              />
                            </td>
                            <td className="p-2.5 text-center font-bold font-mono text-white">
                              {(ex.quantity * ex.price).toLocaleString()} ج.م
                            </td>
                            <td className="p-2.5 text-center">
                              <button type="button" onClick={() => removeExchangeItem(idx)} className="text-red-400 font-bold">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. طريقة التسوية المالية والخزنة */}
        {selectedCustomer && (
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg space-y-4">
            <h3 className="font-bold text-white text-sm">💰 طريقة التسوية المالية</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">تسوية قيمة المرتجع عبر:</label>
                <select
                  value={refundMethod}
                  onChange={(e: any) => setRefundMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-red-500"
                >
                  <option value="CASH">💵 نقدياً من الخزنة (صرف كاش فوراً)</option>
                  <option value="CREDIT">📝 خصم من حساب ومديونية العميل (آجل)</option>
                </select>
              </div>

              {(refundMethod === 'CASH' || returnType === 'EXCHANGE') && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الخزنة المعنية بالتسوية:</label>
                  <select
                    value={selectedSafeId}
                    onChange={(e) => setSelectedSafeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-amber-300 outline-none"
                  >
                    {safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">سبب المرتجع</label>
                <input
                  type="text"
                  placeholder="عيب قماش، عدم ملائمة المقاس..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  placeholder="ملاحظات توضيحية..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* الشريط الإحصائي والسفلي للحفظ */}
      {selectedCustomer && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t-2 border-slate-700 p-4 shadow-2xl z-40">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
            
            <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">قيمة المرتجع:</span>
                <span className="text-lg font-black text-red-400">{totalRefundAmount.toLocaleString()} ج.م</span>
              </div>

              {returnType === 'EXCHANGE' && (
                <>
                  <div className="border-r border-slate-800 pr-6">
                    <span className="text-slate-400 block text-[10px]">قيمة البديل:</span>
                    <span className="text-lg font-black text-blue-400">{totalExchangeAmount.toLocaleString()} ج.م</span>
                  </div>

                  <div className="border-r border-slate-800 pr-6">
                    <span className="text-slate-400 block text-[10px]">فرق السعر:</span>
                    <span className={`text-lg font-black ${exchangeDifference > 0 ? 'text-amber-400' : exchangeDifference < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {exchangeDifference > 0 ? `+${exchangeDifference.toLocaleString()} (العميل يدفع)` : exchangeDifference < 0 ? `${exchangeDifference.toLocaleString()} (العميل يسترد)` : '0.00 (لا فرق)'}
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveReturn}
              disabled={isSubmitting || returnItems.length === 0}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-8 py-3.5 rounded-xl font-black text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? 'جاري الحفظ وتعديل المخزون...' : '💾 اعتماد وحفظ فاتورة المرتجع'}</span>
            </button>

          </div>
        </div>
      )}

    </div>
  )
}