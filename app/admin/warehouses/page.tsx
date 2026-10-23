'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  getWarehouses, 
  createWarehouse, 
  updateWarehouse, 
  deleteWarehouse, 
  getWarehouseInventory, 
  transferStockBetweenWarehouses, 
  getStockTransfersLog 
} from '@/app/warehouse-management-actions'

export default function WarehousesManagementPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'LIST' | 'TRANSFER' | 'LOGS') || 'LIST'

  const [activeTab, setActiveTab] = useState<'LIST' | 'TRANSFER' | 'LOGS'>(initialTab)
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // مودال إضافة / تعديل مخزن
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<any | null>(null)
  const [whForm, setWhForm] = useState({ name: '', code: '', location: '', isDefault: false })
  const [isSavingWh, setIsSavingWh] = useState(false)

  // مودال عرض بضاعة مخزن محدد
  const [selectedWarehouseForView, setSelectedWarehouseForView] = useState<any | null>(null)
  const [whInventory, setWhInventory] = useState<any[]>([])
  const [invSearchQuery, setInvSearchQuery] = useState('')
  const [loadingInv, setLoadingInv] = useState(false)

  // شاشة تحويل البضاعة بين المخازن
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [transferNotes, setTransferNotes] = useState('')
  const [transferItems, setTransferItems] = useState<{ productId: string; modelNo: string; color: string; availableQty: number; quantity: number }[]>([])
  const [availableSourceProducts, setAvailableSourceProducts] = useState<any[]>([])
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  // سجل التحويلات السابقة
  const [transferLogs, setTransferLogs] = useState<any[]>([])
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<any | null>(null)

  const loadData = async () => {
    setLoading(true)
    const [resWh, resLogs] = await Promise.all([
      getWarehouses(),
      getStockTransfersLog(50)
    ])

    if (resWh.success) {
      setWarehouses(resWh.warehouses || [])
      if (resWh.warehouses.length > 0) {
        const def = resWh.warehouses.find((w: any) => w.isDefault) || resWh.warehouses[0]
        setFromWarehouseId(def.id)
        const second = resWh.warehouses.find((w: any) => w.id !== def.id)
        if (second) setToWarehouseId(second.id)
      }
    }

    if (resLogs.success) {
      setTransferLogs(resLogs.transfers || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // عند تغيير المخزن المصدر، نحمل الأصناف المتاحة فيه فقط للتحويل
  useEffect(() => {
    if (fromWarehouseId) {
      getWarehouseInventory(fromWarehouseId).then(res => {
        if (res.success) {
          setAvailableSourceProducts(res.items || [])
          setTransferItems([])
        }
      })
    }
  }, [fromWarehouseId])

  // فتح كشف بضاعة مخزن
  const handleOpenWarehouseInventory = async (wh: any) => {
    setSelectedWarehouseForView(wh)
    setLoadingInv(true)
    setInvSearchQuery('')
    const res = await getWarehouseInventory(wh.id)
    if (res.success) {
      setWhInventory(res.items || [])
    }
    setLoadingInv(false)
  }

  // فلترة بضاعة المخزن المعروضة
  const filteredWhInventory = useMemo(() => {
    const q = invSearchQuery.trim().toLowerCase()
    if (!q) return whInventory
    return whInventory.filter((it: any) =>
      it.product.modelNo.toLowerCase().includes(q) ||
      it.product.color.toLowerCase().includes(q) ||
      (it.product.vendor && it.product.vendor.toLowerCase().includes(q))
    )
  }, [whInventory, invSearchQuery])

  // نتائج البحث عن صنف لإضافته لإذن التحويل
  const filteredSearchSourceProducts = useMemo(() => {
    const q = productSearchTerm.trim().toLowerCase()
    if (!q) return []
    return availableSourceProducts.filter((st: any) =>
      st.product.modelNo.toLowerCase().includes(q) ||
      st.product.color.toLowerCase().includes(q)
    ).slice(0, 15)
  }, [availableSourceProducts, productSearchTerm])

  // إضافة صنف لجدول التحويل
  const handleAddItemToTransfer = (st: any) => {
    const exists = transferItems.find(i => i.productId === st.productId)
    if (exists) {
      alert('الصنف مضاف بالفعل في إذن التحويل')
      return
    }

    setTransferItems(prev => [
      ...prev,
      {
        productId: st.productId,
        modelNo: st.product.modelNo,
        color: st.product.color,
        availableQty: st.quantity,
        quantity: 1
      }
    ])
    setProductSearchTerm('')
  }

  // تعديل كمية النقل
  const handleUpdateItemQty = (productId: string, val: number) => {
    setTransferItems(prev => prev.map(it => {
      if (it.productId === productId) {
        const safeQty = Math.max(1, Math.min(val, it.availableQty))
        return { ...it, quantity: safeQty }
      }
      return it
    }))
  }

  const handleRemoveTransferItem = (productId: string) => {
    setTransferItems(prev => prev.filter(i => i.productId !== productId))
  }

  // تنفيذ إذن التحويل
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault()

    if (transferItems.length === 0) {
      return alert('يرجى إضافة صنف واحد على الأقل للتحويل')
    }

    if (fromWarehouseId === toWarehouseId) {
      return alert('المخزن المصدر هو نفسه المخزن المستلم!')
    }

    setIsTransferring(true)
    const res = await transferStockBetweenWarehouses({
      fromWarehouseId,
      toWarehouseId,
      date: transferDate,
      notes: transferNotes,
      items: transferItems.map(it => ({ productId: it.productId, quantity: it.quantity }))
    })
    setIsTransferring(false)

    if (res.success) {
      alert(res.message)
      setTransferItems([])
      setTransferNotes('')
      loadData()
      setActiveTab('LOGS')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // حفظ أو تعديل مخزن
  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingWh(true)

    let res
    if (editingWarehouse) {
      res = await updateWarehouse(editingWarehouse.id, whForm)
    } else {
      res = await createWarehouse(whForm)
    }
    setIsSavingWh(false)

    if (res.success) {
      alert(res.message)
      setShowAddEditModal(false)
      setEditingWarehouse(null)
      setWhForm({ name: '', code: '', location: '', isDefault: false })
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleDeleteWarehouse = async (wh: any) => {
    if (!confirm(`هل أنت متأكد من حذف المخزن (${wh.name})؟`)) return
    const res = await deleteWarehouse(wh.id)
    if (res.success) {
      alert(res.message)
      loadData()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans pb-36" dir="rtl">
      
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-xl mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏢</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">إدارة المخازن المتعددة والمناقلات</h1>
              <p className="text-slate-400 text-xs mt-1">
                إدارة الفروع والمخازن، مناقلة البضاعة بين المخازن، والرقابة على رصيد كل مخزن
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-700 flex gap-1">
            <button
              onClick={() => setActiveTab('LIST')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'LIST' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>🏬</span>
              <span>المخازن والأرصدة ({warehouses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('TRANSFER')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'TRANSFER' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>🔄</span>
              <span>تحويل ونقل بضاعة</span>
            </button>

            <button
              onClick={() => setActiveTab('LOGS')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'LOGS' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span>📑</span>
              <span>سجل التحويلات ({transferLogs.length})</span>
            </button>
          </div>

          <Link href="/admin" className="text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 px-3.5 py-2 rounded-xl font-bold transition">
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* ========================================================= */}
        {/* التبويب 1: كروت وجداول المخازن */}
        {/* ========================================================= */}
        {activeTab === 'LIST' && (
          <div className="space-y-4">
            
            <div className="flex justify-between items-center bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm">
              <span className="text-xs font-bold text-slate-300">
                المخازن المسجلة بالنظام ومتابعة بضاعتها وقيمتها المالية
              </span>

              <button
                onClick={() => {
                  setEditingWarehouse(null)
                  setWhForm({ name: '', code: '', location: '', isDefault: false })
                  setShowAddEditModal(true)
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>إضافة مخزن جديد</span>
              </button>
            </div>

            {loading ? (
              <div className="p-16 text-center text-slate-400 font-bold">جاري تحميل بيانات المخازن...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {warehouses.map((wh) => (
                  <div key={wh.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start border-b border-slate-700 pb-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-lg text-white">{wh.name}</h3>
                            {wh.isDefault && (
                              <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                المخزن الرئيسي الافتراضي
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono block mt-0.5">كود: {wh.code} | الموقع: {wh.location}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block mb-0.5">عدد الموديلات:</span>
                          <span className="text-lg font-black font-mono text-cyan-400">{wh.modelsCount} صنف</span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block mb-0.5">إجمالي القطع:</span>
                          <span className="text-lg font-black font-mono text-emerald-400">{wh.totalPieces.toLocaleString()} قطعة</span>
                        </div>
                      </div>

                      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>قيمة البضاعة بالتكلفة:</span>
                          <span className="font-mono font-bold text-slate-200">{wh.totalValueCost.toLocaleString()} ج.م</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>القيمة البيعية المتوقعة:</span>
                          <span className="font-mono font-bold text-amber-400">{wh.totalValuePrice.toLocaleString()} ج.م</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-700 flex justify-between items-center gap-2">
                      <button
                        onClick={() => handleOpenWarehouseInventory(wh)}
                        className="flex-1 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white py-2 rounded-xl text-xs font-bold transition border border-cyan-500/40"
                      >
                        📦 جرد وبضاعة المخزن
                      </button>

                      <button
                        onClick={() => {
                          setEditingWarehouse(wh)
                          setWhForm({ name: wh.name, code: wh.code, location: wh.location === '-' ? '' : wh.location, isDefault: wh.isDefault })
                          setShowAddEditModal(true)
                        }}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-xl text-xs font-bold transition"
                        title="تعديل"
                      >
                        ✏️
                      </button>

                      {!wh.isDefault && (
                        <button
                          onClick={() => handleDeleteWarehouse(wh)}
                          className="bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white p-2 rounded-xl text-xs font-bold transition border border-red-500/30"
                          title="حذف"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ========================================================= */}
        {/* التبويب 2: شاشة تحويل ومناقلة بضاعة بين المخازن */}
        {/* ========================================================= */}
        {activeTab === 'TRANSFER' && (
          <form onSubmit={handleExecuteTransfer} className="space-y-6">
            
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-lg grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">من مخزن (المصدر) *</label>
                <select
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500"
                  required
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} {w.isDefault ? '(الرئيسي)' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">إلى مخزن (المستلم) *</label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500"
                  required
                >
                  {warehouses.filter(w => w.id !== fromWarehouseId).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ التحويل *</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات الإذن</label>
                <input
                  type="text"
                  placeholder="سبب النقل أو توجيهات..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* حقل البحث وإضافة الأصناف للتحويل */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-700 pb-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>📦 الأصناف المراد مناقلتها</span>
                  <span className="text-xs text-slate-400">(ابحث بالموديل أو اللون من رصيد المخزن المصدر)</span>
                </h3>

                <span className="text-xs text-cyan-400 font-mono">
                  الأصناف المتاحة بالمصدر: {availableSourceProducts.length} صنف
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 ابحث برقم الموديل أو اللون لإضافته لإذن التحويل..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500"
                />

                {filteredSearchSourceProducts.length > 0 && (
                  <div className="absolute top-full right-0 left-0 z-50 bg-slate-950 border-2 border-blue-500 rounded-xl shadow-2xl mt-1 max-h-52 overflow-y-auto divide-y divide-slate-800">
                    {filteredSearchSourceProducts.map((st: any) => (
                      <div
                        key={st.productId}
                        onClick={() => handleAddItemToTransfer(st)}
                        className="p-3 hover:bg-slate-800 cursor-pointer flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-white text-sm">{st.product.modelNo}</span>
                          <span className="text-amber-400 font-bold mr-2">({st.product.color})</span>
                          {st.product.vendor && <span className="text-slate-500 text-[11px] block">{st.product.vendor}</span>}
                        </div>
                        <div className="text-left font-mono">
                          <span className="text-emerald-400 font-bold block">متاح: {st.quantity} قطعة</span>
                          <span className="text-[10px] text-blue-400">+ إضافة للإذن</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* جدول بنود التحويل */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="text-xs font-bold text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">الموديل</th>
                      <th className="p-2.5 w-32">اللون</th>
                      <th className="p-2.5 text-center w-36">الرصيد المتاح بالمصدر</th>
                      <th className="p-2.5 text-center w-40 text-blue-400">الكمية المراد نقلها</th>
                      <th className="p-2.5 w-12 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {transferItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500 font-bold text-xs">
                          لم تقم بإضافة أصناف للإذن بعد. ابحث في الحقل أعلاه لاختيار الأصناف.
                        </td>
                      </tr>
                    ) : (
                      transferItems.map((item, idx) => (
                        <tr key={item.productId} className="hover:bg-slate-700/20">
                          <td className="p-2.5 text-center font-bold text-xs text-slate-500">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-white">{item.modelNo}</td>
                          <td className="p-2.5 text-amber-400 text-xs font-bold">{item.color}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-300">{item.availableQty} قطعة</td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="1"
                              max={item.availableQty}
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemQty(item.productId, parseInt(e.target.value) || 1)}
                              className="w-24 bg-slate-950 border border-blue-500/60 rounded-xl p-2 text-center font-black font-mono text-blue-400 text-sm outline-none focus:border-blue-400"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveTransferItem(item.productId)}
                              className="text-red-400 hover:text-red-300 p-1 font-bold"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-4 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-slate-400 font-mono">
                  إجمالي القطع في هذا الإذن: <b className="text-white text-base">{transferItems.reduce((s, it) => s + it.quantity, 0)}</b> قطعة
                </div>

                <button
                  type="submit"
                  disabled={isTransferring || transferItems.length === 0}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-40 text-white px-8 py-3 rounded-xl font-black text-sm shadow-xl transition flex items-center justify-center gap-2"
                >
                  <span>{isTransferring ? 'جاري النقل...' : '🚀 تأكيد وتنفيذ إذن التحويل'}</span>
                </button>
              </div>

            </div>

          </form>
        )}

        {/* ========================================================= */}
        {/* التبويب 3: سجل أذونات التحويل السابقة */}
        {/* ========================================================= */}
        {activeTab === 'LOGS' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">سجل أذونات المناقلة والتحويل بين المخازن</h3>
              <span className="text-xs text-slate-400 font-mono">عدد الأذونات: {transferLogs.length}</span>
            </div>

            <div className="divide-y divide-slate-700/60">
              {transferLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold">
                  لا توجد عمليات تحويل مسجلة بعد.
                </div>
              ) : (
                transferLogs.map((log) => {
                  const totalPieces = log.items?.reduce((s: number, it: any) => s + it.quantity, 0) || 0

                  return (
                    <div key={log.id} className="p-4 hover:bg-slate-800/40 transition space-y-2">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-base text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                            إذن #{log.transferNo}
                          </span>
                          <span className="font-bold text-white text-sm">
                            من: <b className="text-rose-400">{log.fromWarehouse?.name}</b> ➔ إلى: <b className="text-emerald-400">{log.toWarehouse?.name}</b>
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                          <span className="text-slate-400">التاريخ: {new Date(log.date).toLocaleDateString('ar-EG')}</span>
                          <span className="text-blue-400 font-black text-sm">{totalPieces} قطعة</span>
                          <button
                            type="button"
                            onClick={() => setSelectedLogForDetails(log)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded font-bold"
                          >
                            عرض الأصناف 👁️
                          </button>
                        </div>
                      </div>

                      {log.notes && (
                        <p className="text-xs text-slate-400 pr-2">ملاحظة: {log.notes}</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

      </div>

      {/* مودال كشف بضاعة المخزن */}
      {selectedWarehouseForView && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl p-6 shadow-2xl max-h-[90vh] flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-white">📦 بضاعة مخزن: {selectedWarehouseForView.name}</h3>
                <span className="text-xs text-slate-400 font-mono">كود: {selectedWarehouseForView.code}</span>
              </div>
              <button onClick={() => setSelectedWarehouseForView(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="🔍 بحث داخل بضاعة المخزن بالموديل أو اللون أو المورد..."
                value={invSearchQuery}
                onChange={(e) => setInvSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingInv ? (
                <div className="p-12 text-center text-slate-400">جاري تحميل البضاعة...</div>
              ) : filteredWhInventory.length === 0 ? (
                <div className="p-12 text-center text-slate-500">لا توجد أصناف مطابقة في هذا المخزن</div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">الموديل</th>
                      <th className="p-2.5 w-28">اللون</th>
                      <th className="p-2.5">المورد</th>
                      <th className="p-2.5 text-center w-28 text-cyan-400">الرصيد بالمخزن</th>
                      <th className="p-2.5 text-center w-24">سعر التكلفة</th>
                      <th className="p-2.5 text-center w-24">سعر البيع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredWhInventory.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-bold text-white text-sm">{item.product.modelNo}</td>
                        <td className="p-2.5 text-amber-400 font-bold">{item.product.color}</td>
                        <td className="p-2.5 text-slate-400">{item.product.vendor || '-'}</td>
                        <td className="p-2.5 text-center font-black font-mono text-emerald-400 text-sm">{item.quantity} قطعة</td>
                        <td className="p-2.5 text-center font-mono text-slate-300">{item.product.cost} ج.م</td>
                        <td className="p-2.5 text-center font-mono text-slate-300">{item.product.price} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs">
              <span className="text-slate-400">عدد الأصناف: <b className="text-white font-mono">{filteredWhInventory.length}</b> صنف</span>
              <button onClick={() => setSelectedWarehouseForView(null)} className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال تفاصيل إذن التحويل السابق */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">تفاصيل إذن تحويل رقم #{selectedLogForDetails.transferNo}</h3>
              <button onClick={() => setSelectedLogForDetails(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl text-xs space-y-1">
              <div>من: <b className="text-rose-400">{selectedLogForDetails.fromWarehouse?.name}</b> ➔ إلى: <b className="text-emerald-400">{selectedLogForDetails.toWarehouse?.name}</b></div>
              <div>التاريخ: <b className="text-slate-300 font-mono">{new Date(selectedLogForDetails.date).toLocaleDateString('ar-EG')}</b></div>
              <div>المسؤول: <b className="text-slate-300">{selectedLogForDetails.user?.name || 'الإدارة'}</b></div>
            </div>

            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2">الموديل</th>
                  <th className="p-2">اللون</th>
                  <th className="p-2 text-center w-24">الكمية المنقولة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {selectedLogForDetails.items?.map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="p-2 font-bold text-white font-sans">{it.product.modelNo}</td>
                    <td className="p-2 text-amber-400 font-sans">{it.product.color}</td>
                    <td className="p-2 text-center font-bold text-emerald-400">{it.quantity} قطعة</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button onClick={() => setSelectedLogForDetails(null)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال إنشاء / تعديل مخزن */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">
                {editingWarehouse ? `✏️ تعديل مخزن: ${editingWarehouse.name}` : '➕ إضافة مخزن جديد'}
              </h3>
              <button onClick={() => setShowAddEditModal(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم المخزن *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مخزن المعرض، مخزن التوزيع، فرع الإسكندرية..."
                  value={whForm.name}
                  onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كود المخزن (تلقائي لو فارغ)</label>
                <input
                  type="text"
                  placeholder="مثال: WH-02..."
                  value={whForm.code}
                  onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الموقع / العنوان</label>
                <input
                  type="text"
                  placeholder="مثال: الدور الثاني - المعرض الرئيسي..."
                  value={whForm.location}
                  onChange={(e) => setWhForm({ ...whForm, location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 outline-none"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    checked={whForm.isDefault}
                    onChange={(e) => setWhForm({ ...whForm, isDefault: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                  <span className="text-xs font-bold text-slate-200">تعيين كمخزن افتراضي لاستقبال البضاعة والمشتريات</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingWh}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl font-bold text-xs shadow-lg transition"
                >
                  {isSavingWh ? 'جاري الحفظ...' : (editingWarehouse ? 'حفظ التعديلات ✅' : 'إنشاء المخزن ✅')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}