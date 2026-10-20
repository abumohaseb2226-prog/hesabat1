'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  deleteBulkProducts,
  deleteAllProducts,
  addBulkProducts,
  updateInitialStockBulk,
  resetInitialStockBulk,
  syncFromGoogleSheets,
  getSyncOperations,
  revertSyncOperation
} from '@/app/admin-actions'

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // الفلاتر والبحث
  const [searchTerm, setSearchTerm] = useState('')
  const [vendorFilter, setVendorFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // التحديد المتعدد مع دعم Shift + Click
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // مؤشرات العمليات والرفع
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResettingInitial, setIsResettingInitial] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')

  // أقسام الأكورديون / النوافذ
  const [showAddForm, setShowAddForm] = useState(false)
  const [showExcelSection, setShowExcelSection] = useState(false)
  const [showSyncSection, setShowSyncSection] = useState(false)

  // مودال التعديل
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // فورم إضافة صنف جديد
  const [newProduct, setNewProduct] = useState({
    modelNo: '',
    description: '',
    vendor: '',
    price: '',
    cost: '',
    discount: '0',
    status: 'OPEN',
    colors: [{ color: '', stock: '0' }]
  })

  // مزامنة جوجل شيت
  const [syncStartDate, setSyncStartDate] = useState(new Date().toISOString().split('T')[0])
  const [syncOperations, setSyncOperations] = useState<any[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  // تحميل البيانات
  const refreshProducts = async () => {
    setLoading(true)
    const data = await getProducts()
    setProducts(data || [])
    setSelectedIds([])
    setLastSelectedIndex(null)
    setLoading(false)
  }

  const loadSyncHistory = async () => {
    const ops = await getSyncOperations()
    setSyncOperations(ops || [])
  }

  useEffect(() => {
    refreshProducts()
    loadSyncHistory()
  }, [])

  // قائمة الموردين المتاحين للفلترة
  const availableVendors = useMemo(() => {
    const vSet = new Set<string>()
    products.forEach(p => {
      if (p.vendor && p.vendor.trim() !== '') {
        vSet.add(p.vendor.trim())
      }
    })
    return Array.from(vSet).sort()
  }, [products])

  // فلترة المنتجات
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim()
        const matchModel = p.modelNo?.toLowerCase().includes(q)
        const matchColor = p.color?.toLowerCase().includes(q)
        const matchVendor = p.vendor?.toLowerCase().includes(q)
        const matchDesc = p.description?.toLowerCase().includes(q)
        if (!matchModel && !matchColor && !matchVendor && !matchDesc) return false
      }

      if (vendorFilter !== 'ALL') {
        if (!p.vendor || p.vendor.trim() !== vendorFilter) return false
      }

      if (statusFilter !== 'ALL') {
        if (p.status !== statusFilter) return false
      }

      return true
    })
  }, [products, searchTerm, vendorFilter, statusFilter])

  // =========================================================================
  // ✅ التحديد السريع مع دعم زر Shift + Click
  // =========================================================================
  const handleCheckboxClick = (e: React.MouseEvent<HTMLInputElement>, id: string, index: number) => {
    const isChecked = (e.target as HTMLInputElement).checked

    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const rangeIds = filteredProducts.slice(start, end + 1).map((p: any) => p.id)

      setSelectedIds((prev: string[]) => {
        const nextSet = new Set(prev)
        rangeIds.forEach(rangeId => {
          if (isChecked) {
            nextSet.add(rangeId)
          } else {
            nextSet.delete(rangeId)
          }
        })
        return Array.from(nextSet)
      })
    } else {
      setSelectedIds((prev: string[]) =>
        isChecked ? [...prev, id] : prev.filter(item => item !== id)
      )
    }

    setLastSelectedIndex(index)
  }

  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.includes(p.id))

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredProducts.map(p => p.id))
    } else {
      setSelectedIds([])
    }
  }

  // =========================================================================
  // ✅ تصفير الرصيد الأولي للأصناف المحددة (stockQty = 0)
  // =========================================================================
  const handleResetInitialStock = async () => {
    if (selectedIds.length === 0) return

    const confirmMsg = `هل أنت متأكد من تصفير الرصيد الأولي لـ (${selectedIds.length}) صنف محدد؟\n\n✓ سيصبح المخزون الأولي = 0.\n✓ الرصيد المتاح للبيع سيظل كما هو دون تغيير.\n✓ سيتم تصحيح كشف حساب المورد فوراً.`

    if (!confirm(confirmMsg)) return

    setIsResettingInitial(true)
    const res = await resetInitialStockBulk(selectedIds)
    setIsResettingInitial(false)

    if (res.success) {
      alert(`✅ تم بنجاح تصفير الرصيد الأولي لـ ${res.count} صنف.`)
      setSelectedIds([])
      setLastSelectedIndex(null)
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // =========================================================================
  // 📥 أوبشنات الإكسيل (استيراد أصناف + تعديل الكميات + تحميل النماذج)
  // =========================================================================

  // 1. تحميل نموذج استيراد الأصناف الجديدة
  const downloadProductTemplate = () => {
    const templateData = [
      { modelNo: "4805", color: "أسود", vendor: "رؤية شتوي", price: 310, cost: 234, stockQty: 10, discount: 0, description: "صنف تجريبي", status: "OPEN" },
      { modelNo: "4805", color: "كحلي", vendor: "رؤية شتوي", price: 310, cost: 234, stockQty: 8, discount: 0, description: "صنف تجريبي", status: "OPEN" }
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Products")
    XLSX.writeFile(wb, "Products_Template.xlsx")
  }

  // رفع ملف أصناف جديدة من الإكسيل
  const handleUploadProductsExcel = (e: any) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt: any) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws) as any[]

        if (confirm(`تم قراءة ${data.length} صنف من الملف. هل تريد بدء الاستيراد؟`)) {
          setIsUploading(true)
          const BATCH_SIZE = 200
          let successCount = 0

          for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const chunk = data.slice(i, i + BATCH_SIZE)
            setUploadProgressText(`جاري معالجة الأصناف من ${i + 1} إلى ${Math.min(i + BATCH_SIZE, data.length)}...`)
            const res = await addBulkProducts(chunk)
            if (res.success) successCount += (res.count || 0)
          }

          setIsUploading(false)
          setUploadProgressText('')
          alert(`✅ تم الانتهاء بنجاح! تم استيراد/تحديث ${successCount} صنف.`)
          refreshProducts()
          e.target.value = ''
        }
      } catch (err: any) {
        setIsUploading(false)
        alert('❌ خطأ في معالجة ملف الإكسيل: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  // 2. تحميل نموذج تعديل المخزون الأولي
  const downloadStockTemplate = () => {
    const templateData = [
      { modelNo: "4805", color: "أسود", stockQty: 12 },
      { modelNo: "4805", color: "كحلي", stockQty: 15 }
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "StockUpdate")
    XLSX.writeFile(wb, "Initial_Stock_Template.xlsx")
  }

  // رفع ملف إكسيل لتحديث وتعديل المخزون الأولي
  const handleUploadInitialStockExcel = (e: any) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt: any) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws) as any[]

        if (confirm(`تم قراءة ${data.length} سطر لتحديث المخزون الأولي. هل تريد المتابعة؟`)) {
          setIsUploading(true)
          setUploadProgressText('جاري تحديث الكميات وإعادة ضبط الرصيد المتاح...')
          const res = await updateInitialStockBulk(data)
          setIsUploading(false)
          setUploadProgressText('')

          if (res.success) {
            alert(`✅ تقرير التحديث:\n- تم تحديث: ${res.updatedCount} صنف بنجاح.\n- لم يتم العثور على: ${res.notFoundCount} صنف.`)
            refreshProducts()
          } else {
            alert('❌ فشل التحديث: ' + res.error)
          }
          e.target.value = ''
        }
      } catch (err: any) {
        setIsUploading(false)
        alert('❌ خطأ في قراءة الملف: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  // =========================================================================
  // 🔄 مزامنة جوجل شيت (Google Sheets)
  // =========================================================================
  const handleSyncSheets = async () => {
    if (!syncStartDate) return alert('يرجى تحديد تاريخ البدء')
    setIsSyncing(true)
    const res = await syncFromGoogleSheets(syncStartDate)
    setIsSyncing(false)

    if (res.success) {
      alert(res.message)
      refreshProducts()
      loadSyncHistory()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleRevertSync = async (opId: string) => {
    if (!confirm('هل أنت متأكد من التراجع عن هذه المزامنة؟')) return
    const res = await revertSyncOperation(opId)
    if (res.success) {
      alert('✅ تم التراجع عن المزامنة بنجاح')
      refreshProducts()
      loadSyncHistory()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // =========================================================================
  // ➕ إضافة صنف جديد يدوياً مع جدول الألوان
  // =========================================================================
  const handleAddColorRow = () => {
    setNewProduct(prev => ({
      ...prev,
      colors: [...prev.colors, { color: '', stock: '0' }]
    }))
  }

  const handleRemoveColorRow = (index: number) => {
    if (newProduct.colors.length <= 1) return
    setNewProduct(prev => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== index)
    }))
  }

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProduct.modelNo.trim() || !newProduct.price) {
      return alert('رقم الموديل والسعر مطلوبان')
    }

    const validColors = newProduct.colors.filter(c => c.color.trim() !== '')
    if (validColors.length === 0) {
      return alert('يجب إدخال لون واحد على الأقل')
    }

    const res = await addProduct({
      ...newProduct,
      colors: validColors
    })

    if (res.success) {
      alert('✅ تمت إضافة الصنف بنجاح')
      setNewProduct({
        modelNo: '',
        description: '',
        vendor: '',
        price: '',
        cost: '',
        discount: '0',
        status: 'OPEN',
        colors: [{ color: '', stock: '0' }]
      })
      setShowAddForm(false)
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // =========================================================================
  // الحذف (محدد / الكل)
  // =========================================================================
  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`هل أنت متأكد من حذف (${selectedIds.length}) صنف محدد؟`)) return

    setIsDeleting(true)
    const res = await deleteBulkProducts(selectedIds)
    setIsDeleting(false)

    if (res.success) {
      alert(`✅ تقرير الحذف:\n- تم حذف: ${res.deleted} صنف.\n- تعذر حذف: ${res.failed} صنف لوجود أوردرات مرتبطة بها.`)
      setSelectedIds([])
      setLastSelectedIndex(null)
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('⚠️ تحذير: سيتم حذف جميع الأصناف غير المرتبطة بأوردرات.\nهل أنت متأكد تماماً؟')) return
    setIsDeleting(true)
    const res = await deleteAllProducts()
    setIsDeleting(false)

    if (res.success) {
      alert(`✅ تم حذف ${res.deleted} صنف. المتبقي: ${res.failed} صنف مرتبط بأوردرات.`)
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  const handleDeleteOne = async (id: string, modelNo: string) => {
    if (!confirm(`هل تريد حذف الصنف موديل: ${modelNo}؟`)) return
    const res = await deleteProduct(id)
    if (res.success) {
      alert('✅ تم الحذف بنجاح')
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // تعديل صنف
  const handleEditClick = (product: any) => {
    setEditingProduct({ ...product })
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return

    setIsUpdating(true)
    const res = await updateProduct(editingProduct.id, editingProduct)
    setIsUpdating(false)

    if (res.success) {
      alert('✅ تم تعديل الصنف بنجاح')
      setIsEditModalOpen(false)
      setEditingProduct(null)
      refreshProducts()
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-800 pb-36" dir="rtl">
      
      {/* 1. Header العلوي مع أزرار الأوبشنات */}
      <div className="bg-white p-4 shadow-sm mb-4 rounded-xl border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 flex items-center gap-2">
              <span>📦</span>
              <span>إدارة المخزون والأصناف</span>
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              إضافة الأصناف، استيراد الإكسيل، تعديل المخزون، مزامنة جوجل شيت، والتحديد السريع بـ Shift
            </p>
          </div>

          {/* أزرار فتح النوافذ والعمليات */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow"
            >
              {showAddForm ? '✕ إغلاق النموذج' : '➕ إضافة صنف جديد'}
            </button>

            <button
              onClick={() => setShowExcelSection(!showExcelSection)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow"
            >
              {showExcelSection ? '✕ إخفاء الإكسيل' : '📥 استيراد / تعديل بالإكسيل'}
            </button>

            <button
              onClick={() => setShowSyncSection(!showSyncSection)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow"
            >
              {showSyncSection ? '✕ إخفاء المزامنة' : '🔄 مزامنة جوجل شيت'}
            </button>

            <Link
              href="/admin"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3.5 py-2 rounded-lg text-xs font-bold transition border border-gray-200"
            >
              ← لوحة التحكم
            </Link>
          </div>
        </div>

        {/* 2. قسم الإكسيل الموسع (استيراد أصناف جديدة + تعديل كميات المخزون الأولي) */}
        {showExcelSection && (
          <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-xl mb-4 space-y-4 animate-in fade-in duration-200">
            <h3 className="font-bold text-emerald-900 text-sm border-b border-emerald-200 pb-2">
              📥 استيراد وتحديث البيانات عبر ملفات Excel
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* أ. رفع أصناف جديدة بالكامل */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-gray-800">1. استيراد أصناف جديدة (كاملة البيانات)</span>
                  <button
                    onClick={downloadProductTemplate}
                    className="text-[11px] text-emerald-700 underline font-bold"
                  >
                    📄 تحميل النموذج
                  </button>
                </div>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleUploadProductsExcel}
                  disabled={isUploading}
                  className="w-full text-xs p-1.5 border rounded bg-gray-50 cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 block">الأعمدة: modelNo, color, vendor, price, cost, stockQty, discount</span>
              </div>

              {/* ب. تعديل وتحديث المخزون الأولي للأصناف الموجودة */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-gray-800">2. تعديل وتحديث المخزون الأولي فقط</span>
                  <button
                    onClick={downloadStockTemplate}
                    className="text-[11px] text-blue-700 underline font-bold"
                  >
                    📄 تحميل نموذج الكميات
                  </button>
                </div>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleUploadInitialStockExcel}
                  disabled={isUploading}
                  className="w-full text-xs p-1.5 border rounded bg-gray-50 cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 block">الأعمدة: modelNo, color, stockQty (يعيد ضبط الرصيد المتاح تلقائياً)</span>
              </div>

            </div>

            {isUploading && (
              <div className="p-2 bg-emerald-100 rounded text-xs text-emerald-900 font-bold animate-pulse text-center">
                ⏳ {uploadProgressText || 'جاري معالجة ورفع الملف...'}
              </div>
            )}
          </div>
        )}

        {/* 3. قسم مزامنة جوجل شيت */}
        {showSyncSection && (
          <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-xl mb-4 space-y-4 animate-in fade-in duration-200">
            <h3 className="font-bold text-purple-900 text-sm border-b border-purple-200 pb-2">
              🔄 سحب ومزامنة الحركات من Google Sheets
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-purple-950">سحب الحركات من تاريخ:</label>
              <input
                type="date"
                value={syncStartDate}
                onChange={(e) => setSyncStartDate(e.target.value)}
                className="p-2 bg-white border border-purple-300 rounded text-xs font-bold outline-none"
              />
              <button
                onClick={handleSyncSheets}
                disabled={isSyncing}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded text-xs font-bold shadow"
              >
                {isSyncing ? 'جاري السحب والمزامنة...' : '⚡ بدء المزامنة الآن'}
              </button>
            </div>

            {syncOperations.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-purple-200">
                <span className="text-xs font-bold text-gray-700 block mb-2">آخر عمليات مزامنة:</span>
                <div className="space-y-1 text-xs">
                  {syncOperations.slice(0, 3).map((op) => (
                    <div key={op.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                      <span>تاريخ: {new Date(op.createdAt).toLocaleDateString('ar-EG')} - تم سحب {op.itemsCount} حركة</span>
                      <button
                        onClick={() => handleRevertSync(op.id)}
                        className="text-red-600 hover:underline font-bold text-[11px]"
                      >
                        تراجع ↩
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. فورم إضافة صنف جديد يدوياً */}
        {showAddForm && (
          <form onSubmit={handleSaveNewProduct} className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-4 space-y-3 animate-in fade-in duration-200">
            <h3 className="font-bold text-blue-900 text-sm border-b border-blue-200 pb-2">➕ إضافة صنف جديد</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الموديل *</label>
                <input
                  type="text"
                  required
                  value={newProduct.modelNo}
                  onChange={(e) => setNewProduct({ ...newProduct, modelNo: e.target.value })}
                  className="w-full bg-white border p-2 rounded text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المورد</label>
                <input
                  type="text"
                  value={newProduct.vendor}
                  onChange={(e) => setNewProduct({ ...newProduct, vendor: e.target.value })}
                  className="w-full bg-white border p-2 rounded text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">السعر (قطعة) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="w-full bg-white border p-2 rounded text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">التكلفة</label>
                <input
                  type="number"
                  step="0.01"
                  value={newProduct.cost}
                  onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                  className="w-full bg-white border p-2 rounded text-xs font-mono"
                />
              </div>
            </div>

            {/* الألوان والكميات */}
            <div className="bg-white p-3 rounded-lg border border-blue-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700">الألوان والمخزون الأولي:</span>
                <button
                  type="button"
                  onClick={handleAddColorRow}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-200"
                >
                  + لون آخر
                </button>
              </div>

              {newProduct.colors.map((c, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="اسم اللون"
                    value={c.color}
                    onChange={(e) => {
                      const copy = [...newProduct.colors]
                      copy[idx].color = e.target.value
                      setNewProduct({ ...newProduct, colors: copy })
                    }}
                    className="flex-1 border p-1.5 rounded text-xs"
                  />
                  <input
                    type="number"
                    placeholder="الرصيد الأولي"
                    value={c.stock}
                    onChange={(e) => {
                      const copy = [...newProduct.colors]
                      copy[idx].stock = e.target.value
                      setNewProduct({ ...newProduct, colors: copy })
                    }}
                    className="w-28 border p-1.5 rounded text-xs font-mono text-center"
                  />
                  {newProduct.colors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveColorRow(idx)}
                      className="text-red-500 font-bold px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-200 px-4 py-2 rounded text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-xs font-bold shadow"
              >
                حفظ الصنف والألوان ✅
              </button>
            </div>
          </form>
        )}

        {/* 5. شريط البحث والفلترة المباشرة */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="🔍 بحث سريع بالموديل أو اللون أو المورد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-xs font-bold text-gray-700 outline-none"
            >
              <option value="ALL">جميع الموردين ({availableVendors.length})</option>
              {availableVendors.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-xs font-bold text-gray-700 outline-none"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="OPEN">مفتوح</option>
              <option value="CLOSED">مغلق</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6. الشريط العلوي للجدول (العدد، المحدد، أزرار التصفير والحذف) */}
      <div className="bg-white px-4 py-3 rounded-t-xl border border-b-0 border-gray-200 flex flex-wrap justify-between items-center gap-3">
        
        <div className="text-xs font-bold text-gray-600">
          عدد الأصناف المصفاة: <span className="font-mono text-blue-700 text-sm font-black">{filteredProducts.length}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-700">
            المحدد: <span className="font-mono text-purple-700 font-bold">({selectedIds.length})</span>
          </span>

          {selectedIds.length > 0 && (
            <>
              {/* ✅ زر تصفير الرصيد الأولي الجديد */}
              <button
                type="button"
                onClick={handleResetInitialStock}
                disabled={isResettingInitial}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center gap-1"
                title="تصفير الرصيد الأولي فقط مع الإبقاء على الرصيد المتاح"
              >
                <span>⚡</span>
                <span>{isResettingInitial ? 'جاري التصفير...' : `تصفير الرصيد الأولي (${selectedIds.length})`}</span>
              </button>

              {/* زر حذف المحدد */}
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center gap-1"
              >
                <span>🗑️</span>
                <span>{isDeleting ? 'جاري الحذف...' : `حذف المحدد (${selectedIds.length})`}</span>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedIds([]); setLastSelectedIndex(null); }}
                className="text-gray-500 hover:text-gray-700 text-xs font-bold underline px-1"
              >
                إلغاء التحديد
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={isDeleting}
            className="text-red-700 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition mr-2"
          >
            ⚠️ حذف الكل (غير المرتبط)
          </button>
        </div>
      </div>

      {/* 7. جدول الأصناف المطابق للصورة 100% مع ميزة Shift + Click */}
      <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 text-gray-700 border-b border-gray-200 text-xs font-bold">
            <tr>
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 cursor-pointer accent-blue-600 rounded"
                />
              </th>
              <th className="p-3 w-32 font-bold">الموديل</th>
              <th className="p-3 w-28 font-bold">اللون</th>
              <th className="p-3 font-bold">المورد</th>
              <th className="p-3 text-center w-24 font-bold">الحالة</th>
              <th className="p-3 text-center w-32 font-bold">المخزون الأولي</th>
              <th className="p-3 text-center w-32 font-bold">الرصيد المتاح</th>
              <th className="p-3 text-center w-28 font-bold">التكلفة</th>
              <th className="p-3 text-center w-28 font-bold">السعر</th>
              <th className="p-3 text-center w-24 font-bold">خصم تلقائي</th>
              <th className="p-3 text-center w-36 font-bold">تحكم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={11} className="p-12 text-center text-gray-400 font-bold">
                  جاري تحميل الأصناف...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-12 text-center text-gray-400 font-bold">
                  لا توجد أصناف مطابقة للبحث
                </td>
              </tr>
            ) : (
              filteredProducts.map((product, index) => {
                const isChecked = selectedIds.includes(product.id)

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-gray-50 transition ${
                      isChecked ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    {/* Checkbox مع دعم Shift + Click */}
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => handleCheckboxClick(e, product.id, index)}
                        onChange={() => {}}
                        className="w-4 h-4 cursor-pointer accent-blue-600 rounded"
                      />
                    </td>

                    <td className="p-3 font-bold text-gray-900 font-mono text-base">
                      {product.modelNo}
                    </td>

                    <td className="p-3 text-gray-700 text-xs">
                      {product.color}
                    </td>

                    <td className="p-3 text-gray-600 text-xs">
                      {product.vendor || '-'}
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        product.status === 'OPEN'
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}>
                        {product.status === 'OPEN' ? 'مفتوح' : 'مغلق'}
                      </span>
                    </td>

                    {/* المخزون الأولي */}
                    <td className="p-3 text-center font-mono font-bold text-gray-800 text-sm">
                      {product.stockQty}
                    </td>

                    {/* الرصيد المتاح (أخضر وواضح) */}
                    <td className="p-3 text-center font-mono font-black text-emerald-600 text-base">
                      {product.currentStock}
                    </td>

                    <td className="p-3 text-center font-mono text-xs text-gray-800">
                      {product.cost}
                    </td>

                    <td className="p-3 text-center font-mono font-bold text-gray-900 text-sm">
                      {product.price}
                    </td>

                    <td className="p-3 text-center font-mono font-bold text-red-600 text-xs">
                      {product.discount || 0}%
                    </td>

                    {/* أزرار التحكم: تعديل وحذف */}
                    <td className="p-3 text-center">
                      <div className="flex justify-center items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditClick(product)}
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-bold transition shadow-sm"
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteOne(product.id, product.modelNo)}
                          className="bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1 rounded text-xs font-bold transition shadow-sm"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 8. مودال تعديل بيانات الصنف */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-base text-gray-800">
                تعديل الصنف: {editingProduct.modelNo} ({editingProduct.color})
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-red-500 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الموديل</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.modelNo}
                    onChange={(e) => setEditingProduct({ ...editingProduct, modelNo: e.target.value })}
                    className="w-full border p-2 rounded text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">اللون</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.color}
                    onChange={(e) => setEditingProduct({ ...editingProduct, color: e.target.value })}
                    className="w-full border p-2 rounded text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">المورد</label>
                  <input
                    type="text"
                    value={editingProduct.vendor || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, vendor: e.target.value })}
                    className="w-full border p-2 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">الحالة</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e) => setEditingProduct({ ...editingProduct, status: e.target.value })}
                    className="w-full border p-2 rounded text-xs font-bold"
                  >
                    <option value="OPEN">مفتوح</option>
                    <option value="CLOSED">مغلق</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">السعر</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full border p-2 rounded text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">التكلفة</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.cost || 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full border p-2 rounded text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">خصم تلقائي %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.discount || 0}
                    onChange={(e) => setEditingProduct({ ...editingProduct, discount: parseFloat(e.target.value) || 0 })}
                    className="w-full border p-2 rounded text-xs font-mono text-red-600 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">المخزون الأولي</label>
                <input
                  type="number"
                  value={editingProduct.stockQty}
                  onChange={(e) => setEditingProduct({ ...editingProduct, stockQty: parseInt(e.target.value) || 0 })}
                  className="w-full border p-2 rounded text-xs font-mono font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 bg-gray-100 py-2 rounded text-xs font-bold hover:bg-gray-200"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-xs font-bold shadow transition"
                >
                  {isUpdating ? 'جاري الحفظ...' : 'حفظ التعديل ✅'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}