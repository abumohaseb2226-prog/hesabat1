'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  getInventoryAudits, 
  getInventoryAuditDetails, 
  updateInventoryAuditItems, 
  reconcileInventoryAudit 
} from '@/app/audit-actions'

export default function InventoryAuditsManagementPage() {
  const [audits, setAudits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAudit, setSelectedAudit] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isReconciling, setIsReconciling] = useState(false)
  const [isUpdatingItems, setIsUpdatingItems] = useState(false)

  // حالة البحث والتعديل داخل وثيقة الجرد المفتوحة
  const [docSearchTerm, setDocSearchTerm] = useState('')
  const [editedActualStock, setEditedActualStock] = useState<{ [itemId: string]: number }>({})

  const loadAudits = async () => {
    setLoading(true)
    const res = await getInventoryAudits()
    if (res.success && res.audits) {
      setAudits(res.audits)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAudits()
  }, [])

  const openAuditDetails = async (auditId: string) => {
    setLoadingDetails(true)
    const res = await getInventoryAuditDetails(auditId)
    if (res.success && res.audit) {
      setSelectedAudit(res.audit)
      setDocSearchTerm('')
      // تهيئة الكميات القابلة للتعديل
      const initialMap: { [id: string]: number } = {}
      res.audit.items.forEach((it: any) => {
        initialMap[it.id] = it.actualStock
      })
      setEditedActualStock(initialMap)
    } else {
      alert(res.error || 'فشل جلب تفاصيل الجرد')
    }
    setLoadingDetails(false)
  }

  // فلترة الأصناف داخل وثيقة الجرد الحالية
  const filteredDocItems = useMemo(() => {
    if (!selectedAudit?.items) return []
    const term = docSearchTerm.toLowerCase().trim()
    if (!term) return selectedAudit.items

    return selectedAudit.items.filter((it: any) =>
      it.product.modelNo.toLowerCase().includes(term) ||
      it.product.color.toLowerCase().includes(term) ||
      (it.product.description && it.product.description.toLowerCase().includes(term))
    )
  }, [selectedAudit, docSearchTerm])

  // تغيير كمية الجرد الفعلي لصنف داخل الوثيقة
  const handleItemActualStockChange = (itemId: string, val: number) => {
    setEditedActualStock(prev => ({
      ...prev,
      [itemId]: Math.max(0, val)
    }))
  }

  // حفظ التعديلات التي أجراها الأدمن/المحاسب على كميات الجرد الفعلي
  const handleSaveAuditChanges = async () => {
    if (!selectedAudit) return

    const payloadItems = Object.entries(editedActualStock).map(([id, actualStock]) => ({
      id,
      actualStock: Number(actualStock) || 0
    }))

    setIsUpdatingItems(true)
    const res = await updateInventoryAuditItems(selectedAudit.id, payloadItems)
    setIsUpdatingItems(false)

    if (res.success) {
      alert(res.message)
      // إعادة تحميل تفاصيل الوثيقة بعد التعديل
      openAuditDetails(selectedAudit.id)
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // تسوية واعتماد الجرد
  const handleReconcile = async (auditId: string) => {
    // التأكد من حفظ أي تعديلات قبل التسوية إن وجدت
    const hasUnsavedEdits = selectedAudit.items.some(
      (it: any) => editedActualStock[it.id] !== undefined && editedActualStock[it.id] !== it.actualStock
    )

    if (hasUnsavedEdits) {
      if (!confirm('⚠️ تنبيه: قمت بتعديل أرقام الجرد الفعلي لبعض الأصناف.\nهل تريد حفظ التعديلات ثم تسوية المخزون فوراً؟')) {
        return
      }
      await handleSaveAuditChanges()
    } else {
      if (!confirm('⚠️ تأكيد تسوية الجرد:\nسيتم تعديل الرصيد المتاح الفعلي للأصناف المجرودة فقط في المخزن، مع الاحتفاظ ببيانات الجرد كأرشيف تاريخي.')) {
        return
      }
    }

    setIsReconciling(true)
    const res = await reconcileInventoryAudit(auditId)
    setIsReconciling(false)

    if (res.success) {
      alert(res.message)
      setSelectedAudit(null)
      loadAudits()
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
            <span className="text-3xl">⚖️</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">إدارة ومطابقة الجرد المخزني</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            مراجعة عمليات الجرد وتعديل أرقام الفعلي والبحث داخل الوثيقة وتسوية المخزون مع الأرشيف التاريخي
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/inventory/audit"
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg transition flex items-center gap-1.5"
          >
            <span>📱</span>
            <span>فتح شاشة جرد جديدة</span>
          </Link>

          <Link
            href="/admin"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition"
          >
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold">جاري تحميل وثائق الجرد...</div>
        ) : audits.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center text-slate-400">
            لا توجد وثائق جرد مسجلة حتى الآن. يمكنك استخدام شاشة جرد الموبايل للبدء في جرد المخزن.
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                  <tr>
                    <th className="p-4">رقم الجرد</th>
                    <th className="p-4">تاريخ ووقت الجرد</th>
                    <th className="p-4">العنوان / الملاحظات</th>
                    <th className="p-4">القائم بالجرد</th>
                    <th className="p-4 text-center">عدد الأصناف</th>
                    <th className="p-4 text-center">الحالة</th>
                    <th className="p-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {audits.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-700/30 transition">
                      <td className="p-4 font-bold font-mono text-cyan-400 text-base">
                        #{a.auditNo}
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-300">
                        {new Date(a.createdAt).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-4 text-slate-200">
                        {a.title || a.notes || 'جرد مخزن'}
                      </td>
                      <td className="p-4 text-slate-300 font-medium">
                        {a.user?.name}
                      </td>
                      <td className="p-4 text-center font-bold font-mono text-blue-400">
                        {a._count.items} صنف
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          a.status === 'RECONCILED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {a.status === 'RECONCILED' ? '✅ تم التسوية والتعديل' : '⏳ قيد المراجعة'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => openAuditDetails(a.id)}
                          className="bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow"
                        >
                          عرض ومطابقة 🔍
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* مودال تفاصيل الجرد، والبحث الداخلي، وتعديل الفعلي، والتسوية */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-3xl p-6 shadow-2xl max-h-[92vh] flex flex-col">
            
            {/* رأس المودال */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-white">وثيقة جرد رقم #{selectedAudit.auditNo}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedAudit.status === 'RECONCILED' 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  }`}>
                    {selectedAudit.status === 'RECONCILED' ? 'تمت التسوية والاعتماد' : 'قيد المراجعة والتسوية'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  القائم بالجرد: {selectedAudit.user.name} ({selectedAudit.user.role}) | التاريخ: {new Date(selectedAudit.createdAt).toLocaleString('ar-EG')}
                  {selectedAudit.reconciledAt && ` | تاريخ الاعتماد: ${new Date(selectedAudit.reconciledAt).toLocaleString('ar-EG')}`}
                </p>
              </div>

              <button onClick={() => setSelectedAudit(null)} className="text-slate-400 hover:text-white text-2xl font-bold">✕</button>
            </div>

            {/* شريط البحث السريع داخل وثيقة الجرد */}
            <div className="mb-3 flex flex-wrap gap-2 justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="flex-1 min-w-[240px] relative">
                <input
                  type="text"
                  placeholder="🔍 ابحث داخل الوثيقة (بالموديل أو اللون أو الوصف)..."
                  value={docSearchTerm}
                  onChange={(e) => setDocSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-white focus:border-cyan-500 outline-none"
                />
                {docSearchTerm && (
                  <button onClick={() => setDocSearchTerm('')} className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">✕</button>
                )}
              </div>

              <div className="text-xs text-slate-400">
                المعروض: <b className="text-cyan-400">{filteredDocItems.length}</b> من أصل {selectedAudit.items.length} صنف
              </div>
            </div>

            {/* جدول بنود الجرد ومقارنة الفروق وتعديل الفعلي */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950 text-slate-400 text-xs font-bold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-3">الموديل</th>
                    <th className="p-3">اللون</th>
                    <th className="p-3 text-center">كمية البرنامج وقتها</th>
                    <th className="p-3 text-center bg-cyan-950/40 text-cyan-300 w-36">الجرد الفعلي (قابل للتعديل)</th>
                    <th className="p-3 text-center">فرق الجرد</th>
                    <th className="p-3 text-center">رصيد البرنامج حالياً</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredDocItems.map((it: any) => {
                    const currentActual = editedActualStock[it.id] !== undefined ? editedActualStock[it.id] : it.actualStock
                    const currentDiff = currentActual - it.systemStock
                    const isPendingAudit = selectedAudit.status === 'PENDING'

                    return (
                      <tr key={it.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-white">{it.product.modelNo}</td>
                        <td className="p-3 text-slate-300">{it.product.color}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-400">{it.systemStock}</td>
                        
                        {/* خانة الجرد الفعلي قابلة للتعديل إن لم تتم التسوية بعد */}
                        <td className="p-2 text-center bg-cyan-950/20">
                          {isPendingAudit ? (
                            <input
                              type="number"
                              min="0"
                              value={currentActual}
                              onChange={(e) => handleItemActualStockChange(it.id, parseInt(e.target.value) || 0)}
                              className="w-24 bg-slate-900 border border-cyan-500/60 rounded-lg p-1.5 text-center font-black font-mono text-cyan-300 text-sm focus:border-cyan-400 outline-none"
                            />
                          ) : (
                            <span className="font-black font-mono text-cyan-400 text-base">{it.actualStock}</span>
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold">
                          <span className={currentDiff === 0 ? 'text-slate-400' : currentDiff > 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {currentDiff > 0 ? `+${currentDiff}` : currentDiff}
                          </span>
                        </td>

                        <td className="p-3 text-center font-mono text-xs text-slate-400">
                          {it.product.currentStock}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* فوتر المودال وزر الحفظ والتسوية */}
            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="text-xs text-slate-400">
                إجمالي الأصناف بالوثيقة: <b className="text-white font-mono">{selectedAudit.items.length}</b> صنف
              </div>

              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setSelectedAudit(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs"
                >
                  إغلاق
                </button>

                {/* زر حفظ تعديلات الكميات إن كان قيد المراجعة */}
                {selectedAudit.status === 'PENDING' && (
                  <button
                    onClick={handleSaveAuditChanges}
                    disabled={isUpdatingItems}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition"
                  >
                    {isUpdatingItems ? 'جاري الحفظ...' : 'حفظ تعديلات الجرد 💾'}
                  </button>
                )}

                {/* زر اعتماد وتسوية المخزون الفعلي */}
                {selectedAudit.status === 'PENDING' && (
                  <button
                    onClick={() => handleReconcile(selectedAudit.id)}
                    disabled={isReconciling || isUpdatingItems}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-1.5"
                  >
                    <span>{isReconciling ? '⏳ جاري التسوية...' : '⚖️ تسوية الجرد واعتماد الكميات الفعلية'}</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}