'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { searchProductsForAudit, saveInventoryAudit } from '@/app/audit-actions'
import { getWarehouses } from '@/app/warehouse-management-actions'

interface AuditLine {
  productId: string
  modelNo: string
  color: string
  description?: string
  totalStock: number // إجمالي رصيد الشركة بكل المخازن
  warehouseStocks: { warehouseId: string; quantity: number }[] // تفصيل كل مخزن
  actualStock: number
}

export default function MobileInventoryAuditPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = session?.user?.role || 'EMPLOYEE'

  // إذا كان المستخدم موظفاً، يتم إخفاء رصيد البرنامج وفروق العجز لحمايته من التلاعب
  const isStaffBlindAudit = userRole === 'EMPLOYEE'

  // قائمة المخازن
  const [warehouses, setWarehouses] = useState<any[]>([])
  // 'ALL' يعني جرد عام شامل لكل المخازن، أو ID مخزن معين
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('ALL')

  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [auditList, setAuditList] = useState<AuditLine[]>([])
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // تحميل قائمة المخازن وتعيين المخزن الرئيسي كافتراضي مع إتاحة "الكل"
  useEffect(() => {
    getWarehouses().then(res => {
      if (res?.success && res.warehouses) {
        setWarehouses(res.warehouses)
        const defaultWh = res.warehouses.find((w: any) => w.isDefault) || res.warehouses[0]
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id) // يبدأ بالمخزن الرئيسي افتراضياً
        }
      }
    })
  }, [])

  // البحث الحي بالأصناف متضمناً أرصدة المخازن
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.trim().length >= 1) {
        const results = await searchProductsForAudit(searchTerm)
        setSearchResults(results)
      } else {
        setSearchResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // دالة مساعدة لحساب العدد الاسترشادي حسب المخزن المختار حالياً
  const getExpectedStock = (item: { totalStock: number; warehouseStocks?: { warehouseId: string; quantity: number }[] }) => {
    if (selectedWarehouseId === 'ALL') {
      return item.totalStock || 0
    }
    const ws = item.warehouseStocks?.find(w => w.warehouseId === selectedWarehouseId)
    return ws ? ws.quantity : 0
  }

  // إضافة صنف لقائمة الجرد
  const handleAddProduct = (prod: any, defaultQty: number = 1) => {
    setAuditList(prev => {
      const idx = prev.findIndex(item => item.productId === prod.id)
      if (idx > -1) {
        const copy = [...prev]
        copy[idx].actualStock += 1
        return copy
      } else {
        return [
          {
            productId: prod.id,
            modelNo: prod.modelNo,
            color: prod.color,
            description: prod.description,
            totalStock: prod.currentStock,
            warehouseStocks: prod.warehouseStocks || [],
            actualStock: defaultQty
          },
          ...prev
        ]
      }
    })
    setSearchTerm('')
    setSearchResults([])
  }

  // قراءة الباركود بالكاميرا
  const handleScan = (code: string) => {
    if (code) {
      setSearchTerm(code.trim())
      setShowScanner(false)
    }
  }

  // تحديث كمية الجرد الفعلي
  const updateActualQty = (productId: string, val: number) => {
    setAuditList(prev =>
      prev.map(item => item.productId === productId ? { ...item, actualStock: Math.max(0, val) } : item)
    )
  }

  // إزالة صنف
  const removeItem = (productId: string) => {
    setAuditList(prev => prev.filter(item => item.productId !== productId))
  }

  // حفظ الجرد
  const handleSave = async () => {
    if (auditList.length === 0) {
      alert('لا توجد أصناف في كشف الجرد!')
      return
    }

    const isAll = selectedWarehouseId === 'ALL'
    const targetWhName = isAll 
      ? 'جميع المخازن (جرد عام شامل)' 
      : (warehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي')

    if (!confirm(`تأكيد حفظ وثيقة الجرد لـ (${auditList.length}) صنف في (${targetWhName})؟\n\nملاحظة: هذا الحفظ توثيقي ولن يمس المخزون الفعلي حتى تعتمده الإدارة من لوحة التحكم.`)) {
      return
    }

    setIsSaving(true)
    const res = await saveInventoryAudit({
      title: `جرد: ${targetWhName}`,
      warehouseId: isAll ? undefined : selectedWarehouseId,
      notes,
      items: auditList.map(i => ({
        productId: i.productId,
        actualStock: i.actualStock
      }))
    })
    setIsSaving(false)

    if (res.success) {
      alert(res.message)
      setAuditList([])
      router.push('/')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // إجماليات الكشف الحالية المحسوبة ديناميكياً بناءً على المخزن المختار
  const totals = useMemo(() => {
    let actualSum = 0
    let expectedSum = 0

    auditList.forEach(item => {
      actualSum += item.actualStock
      expectedSum += getExpectedStock(item)
    })

    return {
      actualSum,
      expectedSum,
      diffSum: actualSum - expectedSum
    }
  }, [auditList, selectedWarehouseId])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 font-sans pb-36" dir="rtl">
      
      {/* رأس الشاشة */}
      <header className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex justify-between items-center gap-2 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
            📋
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>جرد المخزن الفعلي</span>
              {isStaffBlindAudit ? (
                <span className="text-[10px] bg-slate-800 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
                  جرد أعمى
                </span>
              ) : (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                  إدارة ومطابقة
                </span>
              )}
            </h1>
            <p className="text-slate-400 text-xs">جرد سريع بالكاميرا والباركود لمخازن وفروع الشركة</p>
          </div>
        </div>

        <Link href="/" className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition">
          ← خروج
        </Link>
      </header>

      <div className="max-w-4xl mx-auto space-y-4">

        {/* اختيار المخزن المراد جرده (مع خيار كل المخازن وتغيير العدد لحظياً) */}
        <div className="bg-slate-900 border-2 border-cyan-500/50 p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏢</span>
            <div>
              <span className="text-sm font-black text-cyan-400 block">المخزن المراد جرده:</span>
              <span className="text-[11px] text-slate-400">
                {selectedWarehouseId === 'ALL' 
                  ? 'يتم عرض إجمالي رصيد الشركة في كل الفروع' 
                  : `يتم احتساب الرصيد الاسترشادي لمخزن: (${warehouses.find(w => w.id === selectedWarehouseId)?.name || ''})`}
              </span>
            </div>
          </div>

          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-full sm:w-auto min-w-[260px] bg-slate-950 border-2 border-cyan-400/80 rounded-xl p-3 text-xs sm:text-sm font-black text-white outline-none focus:border-cyan-300 cursor-pointer shadow-inner"
          >
            <option value="ALL">🌐 جميع المخازن (جرد عام شامل لكل الفروع)</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>
                🏢 {wh.name} {wh.isDefault ? '⭐ (المخزن الرئيسي)' : ''}
              </option>
            ))}
          </select>
        </div>
        
        {/* خانة البحث والكاميرا */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="🔍 ابحث برقم الموديل أو اللون للجرد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-bold text-sm sm:text-base focus:border-cyan-500 outline-none"
            />
            <button
              onClick={() => setShowScanner(true)}
              className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white px-4 py-3 rounded-xl border border-slate-700 font-bold flex items-center justify-center shrink-0 transition"
              title="كاميرا الباركود"
            >
              <span className="text-xl">📷</span>
            </button>
          </div>

          {/* الكاميرا */}
          {showScanner && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-3">
              <div className="w-full max-w-sm bg-slate-900 rounded-3xl overflow-hidden relative border-2 border-cyan-500 shadow-2xl">
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-white">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <span>📷</span>
                    <span>وجه الكاميرا نحو باركود الصنف</span>
                  </span>
                  <button onClick={() => setShowScanner(false)} className="bg-red-600 text-white w-7 h-7 rounded-full font-bold flex items-center justify-center text-sm">✕</button>
                </div>
                <div className="aspect-square w-full bg-black relative flex items-center justify-center">
                  <Scanner onScan={(res) => { if (res && res.length > 0) handleScan(res[0].rawValue) }} />
                  <div className="absolute inset-0 pointer-events-none border-2 border-cyan-400/30 m-8 rounded-2xl flex items-center justify-center">
                    <div className="w-full h-0.5 bg-red-500/80 animate-pulse"></div>
                  </div>
                </div>
                <div className="p-2 bg-slate-950">
                  <button onClick={() => setShowScanner(false)} className="w-full py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl">إلغاء</button>
                </div>
              </div>
            </div>
          )}

          {/* نتائج البحث المباشرة مع إظهار رصيد المخزن المختار تحديداً */}
          {searchResults.length > 0 && (
            <div className="mt-2 divide-y divide-slate-800 bg-slate-950 border border-slate-800 rounded-xl max-h-60 overflow-y-auto">
              {searchResults.map(prod => {
                const whQty = selectedWarehouseId === 'ALL'
                  ? prod.currentStock
                  : (prod.warehouseStocks?.find((w: any) => w.warehouseId === selectedWarehouseId)?.quantity || 0)

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleAddProduct(prod, 1)}
                    className="p-3 hover:bg-slate-900 cursor-pointer flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-black text-white text-base">{prod.modelNo}</span>
                      <span className="text-cyan-400 font-bold text-xs mr-2">({prod.color})</span>
                      {prod.description && <span className="text-slate-500 text-xs block">{prod.description}</span>}
                    </div>

                    <div className="text-left font-mono">
                      {!isStaffBlindAudit && (
                        <div>
                          <span className="text-cyan-300 font-bold text-xs block">
                            {selectedWarehouseId === 'ALL' ? `الرصيد الكلي: ${whQty}` : `رصيد المخزن: ${whQty}`}
                          </span>
                          {selectedWarehouseId !== 'ALL' && (
                            <span className="text-[10px] text-slate-500 block">الكلي: {prod.currentStock}</span>
                          )}
                        </div>
                      )}
                      <span className="text-xs text-emerald-400 font-bold">+ أضف للجرد</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* قائمة الأصناف المجرودة (تتحدث أرقامها تلقائياً عند تغيير المخزن) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-3">
            <h2 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              <span>📦 كشف الأصناف المجرودة</span>
              <span className="text-xs bg-slate-800 px-2.5 py-0.5 rounded-full text-cyan-400 font-mono font-bold">
                {auditList.length} صنف
              </span>
            </h2>

            {auditList.length > 0 && (
              <button onClick={() => setAuditList([])} className="text-xs text-red-400 hover:text-red-300 font-bold">
                مسح الكل ✕
              </button>
            )}
          </div>

          {auditList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-bold text-sm">
              لم تبدأ في إضافة أصناف بعد. ابحث عن الموديل أو استخدم الكاميرا للبدء.
            </div>
          ) : (
            <div className="space-y-2.5">
              {auditList.map((item) => {
                // حساب الرصيد الاسترشادي للمخزن المختار ديناميكياً في ثوانٍ
                const expectedStock = getExpectedStock(item)
                const diff = item.actualStock - expectedStock

                return (
                  <div
                    key={item.productId}
                    className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-wrap sm:flex-nowrap justify-between items-center gap-3 transition"
                  >
                    <div>
                      <span className="font-black text-white text-base block">{item.modelNo}</span>
                      <span className="text-xs text-cyan-400 font-bold">اللون: {item.color}</span>
                      
                      {!isStaffBlindAudit && (
                        <div className="text-xs font-mono mt-0.5">
                          <span className="text-slate-400">
                            {selectedWarehouseId === 'ALL' 
                              ? `(الرصيد الكلي: ${expectedStock})` 
                              : `(رصيد المخزن المختار: ${expectedStock} | الكلي: ${item.totalStock})`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mr-auto">
                      
                      {/* عداد الجرد الفعلي */}
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                        <button
                          onClick={() => updateActualQty(item.productId, item.actualStock - 1)}
                          className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.actualStock}
                          onChange={(e) => updateActualQty(item.productId, parseInt(e.target.value) || 0)}
                          className="w-12 text-center font-black font-mono text-cyan-300 text-sm bg-transparent outline-none"
                        />
                        <button
                          onClick={() => updateActualQty(item.productId, item.actualStock + 1)}
                          className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded text-sm"
                        >
                          +
                        </button>
                      </div>

                      {/* الفرق المحسوب بناءً على المخزن المحدد */}
                      {!isStaffBlindAudit && (
                        <div className="text-left font-mono text-xs min-w-[75px]">
                          <span className="block text-slate-500 text-[10px]">الفرق بالمخزن:</span>
                          <span className={`font-black text-sm ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                      )}

                      <button onClick={() => removeItem(item.productId)} className="text-red-400 hover:text-red-300 p-1">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {auditList.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              <label className="block text-xs font-bold text-slate-400 mb-1">ملاحظات الجرد</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: جرد استاند الجيب، الرف العلوي..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none"
              />
            </div>
          )}
        </div>

      </div>

      {/* الشريط السفلي للحفظ */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 shadow-2xl z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center gap-3">
          
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">إجمالي الجرد الفعلي:</span>
              <span className="font-black text-cyan-400 text-lg">{totals.actualSum} قطعة</span>
            </div>

            {!isStaffBlindAudit && (
              <div className="border-r border-slate-800 pr-4">
                <span className="text-slate-400 block text-[10px]">صافي الفرق بالمخزن المختار:</span>
                <span className={`font-black text-lg ${totals.diffSum === 0 ? 'text-slate-300' : totals.diffSum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totals.diffSum > 0 ? `+${totals.diffSum}` : totals.diffSum}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || auditList.length === 0}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-8 py-3.5 rounded-xl font-black text-sm sm:text-base shadow-lg shadow-cyan-900/40 transition active:scale-95"
          >
            {isSaving ? 'جاري الحفظ...' : 'حفظ كشف الجرد 💾'}
          </button>

        </div>
      </div>

    </div>
  )
}