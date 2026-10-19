'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getProductsForOffers, applyBulkPriceUpdate } from './actions'

interface ProductItem {
  id: string
  modelNo: string
  description: string | null
  vendor: string | null
  color: string
  price: number
  cost: number
  discount: number
  stockQty: number
  currentStock: number
  status: string
}

// دالة جبر وتقريب السعر لأقرب عدد يقبل القسمة على 5
const roundToNearest5 = (num: number): number => {
  if (num <= 0) return 0
  return Math.round(num / 5) * 5
}

export default function OffersManagementPage() {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVendor, setSelectedVendor] = useState('')
  const [allVendors, setAllVendors] = useState<string[]>([]) // حفظ قائمة الموردين كاملة حتى لا تختفي عند البحث

  // قائمة المعرفات المحددة
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // تعديلات الأسعار اليدوية الفردية داخل الجدول (id -> customPrice)
  const [customPrices, setCustomPrices] = useState<{ [id: string]: number }>({})

  // إعدادات أداة التطبيق الجماعي
  const [updateMode, setUpdateMode] = useState<
    'FIXED' | 'PERCENT_DISCOUNT' | 'PERCENT_INCREASE' | 'AMOUNT_DISCOUNT' | 'AMOUNT_INCREASE' | 'SET_DISCOUNT_PERCENT'
  >('FIXED')
  const [applyValue, setApplyValue] = useState<string>('')

  const [isApplying, setIsApplying] = useState(false)

  // تحميل المنتجات (تقبل معاملات للبحث وإرجاع الكل عند مسح البحث)
  const fetchProducts = async (searchQuery?: string, vendorQuery?: string) => {
    setLoading(true)
    const q = searchQuery !== undefined ? searchQuery : searchTerm
    const v = vendorQuery !== undefined ? vendorQuery : selectedVendor

    const res = await getProductsForOffers(q, v)
    if (res.success && res.products) {
      setProducts(res.products)
      setSelectedIds(res.products.map((p: ProductItem) => p.id))
      setCustomPrices({})

      // حفظ قائمة الموردين بالكامل عند أول تحميل
      if (!q && !v) {
        const vSet = new Set<string>()
        res.products.forEach((p: ProductItem) => {
          if (p.vendor) vSet.add(p.vendor.trim())
        })
        setAllVendors(Array.from(vSet).sort())
      }
    } else {
      alert(res.error || 'حدث خطأ أثناء تحميل الأصناف')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProducts('', '')
  }, [])

  // تفريغ البحث وإعادة عرض كل الأصناف
  const handleResetSearch = () => {
    setSearchTerm('')
    setSelectedVendor('')
    fetchProducts('', '')
  }

  // فلترة المنتجات في الـ UI بالبحث الفوري
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchTerm.toLowerCase().trim()
      const matchSearch =
        q === '' ||
        p.modelNo.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.color && p.color.toLowerCase().includes(q)) ||
        (p.vendor && p.vendor.toLowerCase().includes(q))

      const matchVendor = selectedVendor === '' || p.vendor === selectedVendor

      return matchSearch && matchVendor
    })
  }, [products, searchTerm, selectedVendor])

  // منطق تحديد الكل أو إلغاء التحديد
  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.includes(p.id))

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredIdSet = new Set(filteredProducts.map(p => p.id))
      setSelectedIds(prev => prev.filter(id => !filteredIdSet.has(id)))
    } else {
      const newIds = new Set([...selectedIds, ...filteredProducts.map(p => p.id)])
      setSelectedIds(Array.from(newIds))
    }
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    )
  }

  // حساب السعر الجديد المقترح للصنف مع الجبر لأقرب 5
  const getCalculatedPrice = (p: ProductItem): number => {
    if (customPrices[p.id] !== undefined) {
      return customPrices[p.id]
    }

    const val = parseFloat(applyValue)
    if (isNaN(val) || val <= 0) return p.price

    if (updateMode === 'FIXED') {
      return val
    } else if (updateMode === 'PERCENT_DISCOUNT') {
      const rawPrice = p.price * (1 - val / 100)
      return roundToNearest5(rawPrice)
    } else if (updateMode === 'PERCENT_INCREASE') {
      const rawPrice = p.price * (1 + val / 100)
      return roundToNearest5(rawPrice)
    } else if (updateMode === 'AMOUNT_DISCOUNT') {
      const rawPrice = Math.max(0, p.price - val)
      return roundToNearest5(rawPrice)
    } else if (updateMode === 'AMOUNT_INCREASE') {
      const rawPrice = p.price + val
      return roundToNearest5(rawPrice)
    }

    return p.price
  }

  // تطبيق التعديل الجماعي في الذاكرة مع جبر الأرقام لأقرب 5
  const handlePreviewApply = () => {
    const val = parseFloat(applyValue)
    if (isNaN(val) || val <= 0) {
      alert('يرجى إدخال قيمة صحيحة وموجبة')
      return
    }

    if (selectedIds.length === 0) {
      alert('يرجى تحديد صنف واحد على الأقل بعلامة الصح')
      return
    }

    const newCustoms: { [id: string]: number } = { ...customPrices }

    filteredProducts.forEach(p => {
      if (selectedIds.includes(p.id)) {
        if (updateMode === 'FIXED') {
          newCustoms[p.id] = val
        } else if (updateMode === 'PERCENT_DISCOUNT') {
          newCustoms[p.id] = roundToNearest5(p.price * (1 - val / 100))
        } else if (updateMode === 'PERCENT_INCREASE') {
          newCustoms[p.id] = roundToNearest5(p.price * (1 + val / 100))
        } else if (updateMode === 'AMOUNT_DISCOUNT') {
          newCustoms[p.id] = roundToNearest5(Math.max(0, p.price - val))
        } else if (updateMode === 'AMOUNT_INCREASE') {
          newCustoms[p.id] = roundToNearest5(p.price + val)
        }
      }
    })

    setCustomPrices(newCustoms)
    alert(`✅ تم احتساب وجبر الأسعار لأقرب 5 لـ (${selectedIds.length}) صنف بنجاح. راجعها في الجدول واضغط "حفظ وتطبيق الأسعار".`)
  }

  // حفظ الأسعار في قاعدة البيانات
  const handleSaveToDatabase = async () => {
    const targetItems = filteredProducts.filter(p => selectedIds.includes(p.id))

    if (targetItems.length === 0) {
      alert('لم تقم بتحديد أي أصناف للحفظ')
      return
    }

    const val = parseFloat(applyValue)
    const isUpdatingAutoDiscount = updateMode === 'SET_DISCOUNT_PERCENT' && !isNaN(val)

    const updates = targetItems.map(p => {
      const finalPrice = customPrices[p.id] !== undefined ? customPrices[p.id] : getCalculatedPrice(p)
      return {
        id: p.id,
        newPrice: finalPrice,
        ...(isUpdatingAutoDiscount && { newDiscount: val })
      }
    })

    const confirmMsg = `هل أنت متأكد من تطبيق وتعديل أسعار (${updates.length}) صنف في قاعدة البيانات فوراً؟`
    if (!confirm(confirmMsg)) return

    setIsApplying(true)
    const res = await applyBulkPriceUpdate(updates)
    setIsApplying(false)

    if (res.success) {
      alert(res.message)
      setCustomPrices({})
      setApplyValue('')
      fetchProducts(searchTerm, selectedVendor)
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
            <span className="text-3xl">🏷️</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">إدارة العروض وتعديل الأسعار المجمع</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            البحث في الأصناف بالوصف أو الموديل أو المورد وتطبيق سعر موحد أو تعديل نسبي (زيادة/خصم مع جبر الناتج لأقرب 5)
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/products"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition"
          >
            📦 جدول الأصناف
          </Link>
          <Link
            href="/admin"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition"
          >
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* 1. قسم البحث والتصفية */}
        <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                🔍 بحث بالوصف أو الموديل أو المورد (مثال: "فستان", "3700", "ابوسنة")
              </label>
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="ابحث بالوصف أو رقم الموديل أو اسم المورد..."
                    value={searchTerm}
                    onChange={(e) => {
                      const val = e.target.value
                      setSearchTerm(val)
                      // إذا تم مسح النص بالكامل تعود المنتجات كاملة فوراً
                      if (val.trim() === '') {
                        fetchProducts('', selectedVendor)
                      }
                    }}
                    onKeyDown={(e) => { 
                      if (e.key === 'Enter') fetchProducts(searchTerm, selectedVendor) 
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-3 pl-8 text-white text-base font-bold focus:border-purple-500 outline-none"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('')
                        fetchProducts('', selectedVendor)
                      }}
                      className="absolute left-2.5 top-3.5 text-slate-400 hover:text-white font-bold text-sm"
                      title="مسح البحث"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fetchProducts(searchTerm, selectedVendor)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-bold text-sm shrink-0 transition"
                >
                  بحث 🔍
                </button>

                {(searchTerm || selectedVendor) && (
                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-3 rounded-xl font-bold text-xs shrink-0 transition border border-slate-600"
                    title="إلغاء البحث واستعادة كل الأصناف"
                  >
                    عرض الكل ↺
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">المورد</label>
              <select
                value={selectedVendor}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedVendor(val)
                  fetchProducts(searchTerm, val)
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold focus:border-purple-500 outline-none"
              >
                <option value="">جميع الموردين</option>
                {allVendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* 2. وحدة التحكم في العرض والأسعار الجماعية */}
        <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-slate-800 border-2 border-purple-500/50 p-6 rounded-2xl shadow-2xl">
          <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
            <span>⚡ تطبيق سعر أو عرض على الأصناف المحددة</span>
            <span className="text-xs bg-purple-500/30 text-purple-200 border border-purple-400/40 px-2 py-0.5 rounded-full font-bold">
              المحدد: {selectedIds.length} من {filteredProducts.length} صنف
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">طريقة تسعير العرض</label>
              <select
                value={updateMode}
                onChange={(e: any) => setUpdateMode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold focus:border-purple-500 outline-none"
              >
                <option value="FIXED">سعر موحد مباشر (مثلاً 100 ج.م للكل)</option>
                <option value="PERCENT_DISCOUNT">خصم نسبة مئوية % (مع جبر الناتج لأقرب 5)</option>
                <option value="PERCENT_INCREASE">زيادة نسبة مئوية % (مع جبر الناتج لأقرب 5)</option>
                <option value="AMOUNT_DISCOUNT">خصم مبلغ ثابت (إنقاص مبلغ مع الجبر لأقرب 5)</option>
                <option value="AMOUNT_INCREASE">زيادة مبلغ ثابت (إضافة مبلغ مع الجبر لأقرب 5)</option>
                <option value="SET_DISCOUNT_PERCENT">تحديد نسبة الخصم التلقائي % للفواتير</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                {updateMode === 'FIXED' && 'السعر الموحد الجديد (ج.م)'}
                {updateMode === 'PERCENT_DISCOUNT' && 'نسبة الخصم المئوية (%) [تُجبر لأقرب 5]'}
                {updateMode === 'PERCENT_INCREASE' && 'نسبة الزيادة المئوية (%) [تُجبر لأقرب 5]'}
                {updateMode === 'AMOUNT_DISCOUNT' && 'المبلغ المخصوم (ج.م) [يُجبر لأقرب 5]'}
                {updateMode === 'AMOUNT_INCREASE' && 'مبلغ الزيادة (ج.م) [يُجبر لأقرب 5]'}
                {updateMode === 'SET_DISCOUNT_PERCENT' && 'نسبة خصم الفاتورة (%)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={updateMode === 'FIXED' ? 'مثال: 150' : 'مثال: 10'}
                value={applyValue}
                onChange={(e) => setApplyValue(e.target.value)}
                className="w-full bg-slate-900 border border-purple-500/50 rounded-xl p-3 text-white text-xl font-bold font-mono focus:border-purple-400 outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePreviewApply}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-xl font-bold text-sm transition shadow-lg shadow-purple-900/40"
              >
                معاينة وجبر السعر 👁️
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={isApplying || selectedIds.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-black text-sm transition shadow-lg shadow-emerald-900/40 disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isApplying ? '⏳ جاري الحفظ...' : '💾 حفظ وتطبيق الأسعار فوراً'}
              </button>
            </div>

          </div>

          <div className="mt-3 text-xs text-purple-200/90 flex flex-wrap items-center gap-2">
            <span>💡</span>
            <span>
              <b>قاعدة الجبر التلقائي لأقرب 5:</b> أي ناتج نسبي بالزيادة أو النقص يُجبر لأقرب 5 (مثلاً: 92 $\rightarrow$ 90، بينما 93 $\rightarrow$ 95).
            </span>
          </div>
        </div>

        {/* 3. جدول الأصناف */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
          
          <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
                <span>تحديد / إلغاء تحديد الكل ({filteredProducts.length})</span>
              </label>

              <span className="text-xs text-slate-400">
                المحدد حالياً: <b className="text-purple-400">{selectedIds.length}</b> صنف
              </span>
            </div>

            {Object.keys(customPrices).length > 0 && (
              <button
                onClick={() => setCustomPrices({})}
                className="text-xs text-amber-400 hover:underline font-bold"
              >
                إلغاء المعاينة والتراجع للأسعار الأصلية ↺
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 accent-purple-600"
                    />
                  </th>
                  <th className="p-3 w-36">الموديل</th>
                  <th className="p-3">الوصف</th>
                  <th className="p-3 w-28">اللون</th>
                  <th className="p-3 w-32">المورد</th>
                  <th className="p-3 w-24 text-center">المخزون</th>
                  <th className="p-3 w-28 text-center">سعر التكلفة</th>
                  <th className="p-3 w-32 text-center">السعر الحالي</th>
                  <th className="p-3 w-36 text-center text-purple-300">السعر بعد العرض (مقرب لـ 5)</th>
                  <th className="p-3 w-24 text-center">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400 font-bold">
                      جاري تحميل الأصناف...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد أصناف تطابق البحث الحالي
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isChecked = selectedIds.includes(p.id)
                    const projectedPrice = getCalculatedPrice(p)
                    const priceDiff = projectedPrice - p.price

                    return (
                      <tr
                        key={p.id}
                        className={`transition ${
                          isChecked ? 'bg-purple-950/20 hover:bg-purple-900/30' : 'opacity-60 hover:opacity-100 hover:bg-slate-700/30'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectOne(p.id)}
                            className="w-5 h-5 accent-purple-600 cursor-pointer rounded"
                          />
                        </td>

                        <td className="p-3 font-bold text-white font-mono">
                          {p.modelNo}
                        </td>

                        <td className="p-3 text-slate-300 text-xs">
                          {p.description || '-'}
                        </td>

                        <td className="p-3 text-slate-300">
                          <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-xs">
                            {p.color}
                          </span>
                        </td>

                        <td className="p-3 text-slate-400 text-xs font-medium">
                          {p.vendor || '-'}
                        </td>

                        <td className="p-3 text-center font-bold">
                          <span className={p.currentStock > 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {p.currentStock}
                          </span>
                        </td>

                        <td className="p-3 text-center text-slate-400 font-mono text-xs">
                          {p.cost.toFixed(2)} ج.م
                        </td>

                        <td className="p-3 text-center font-bold text-slate-200 font-mono">
                          {p.price.toFixed(2)} ج.م
                        </td>

                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="1"
                            disabled={!isChecked}
                            value={customPrices[p.id] !== undefined ? customPrices[p.id] : (isChecked ? projectedPrice : p.price)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              setCustomPrices(prev => ({ ...prev, [p.id]: val }))
                            }}
                            className={`w-28 p-2 text-center rounded-lg font-bold font-mono outline-none border text-sm transition ${
                              isChecked
                                ? 'bg-slate-900 text-emerald-400 border-purple-500 focus:ring-2 focus:ring-purple-400'
                                : 'bg-slate-950 text-slate-500 border-slate-800'
                            }`}
                          />
                        </td>

                        <td className="p-3 text-center font-mono text-xs font-bold">
                          {isChecked && priceDiff !== 0 ? (
                            <span className={priceDiff < 0 ? 'text-amber-400' : 'text-emerald-400'}>
                              {priceDiff > 0 ? `+${priceDiff.toFixed(2)}` : priceDiff.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400">
            <div>
              عدد الأصناف المطابقة: <b className="text-white">{filteredProducts.length}</b> صنف | الأصناف المشمولة بالعرض: <b className="text-purple-400">{selectedIds.length}</b>
            </div>

            <button
              type="button"
              onClick={handleSaveToDatabase}
              disabled={isApplying || selectedIds.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-8 rounded-xl font-black text-sm transition shadow-lg disabled:bg-slate-700 disabled:cursor-not-allowed"
            >
              {isApplying ? '⏳ جاري الحفظ والتطبيق...' : '💾 تأكيد وحفظ الأسعار المختارة'}
            </button>
          </div>

        </div>

      </div>

    </div>
  )
}