'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { getVendors, addVendor } from '@/app/vendor-actions'
import { getSafesList } from '@/app/report-actions'
import { getWarehouses } from '@/app/warehouse-management-actions'
import { 
  createPurchaseInvoice, 
  searchProductsForPurchase, 
  getModelColors,
  fetchProductsForExcelImport,
  createQuickProduct 
} from '@/app/purchase-actions'

interface InvoiceRow {
  id: string
  modelNo: string
  color: string
  quantity: number | string
  cost: number | string
  price: number | string
  description?: string
  isExisting?: boolean
  currentStock?: number
}

export default function NewPurchaseInvoicePage() {
  const router = useRouter()

  // حالة الفاتورة العامة
  const [invoiceType, setInvoiceType] = useState<'PURCHASE' | 'RETURN'>('PURCHASE')
  const [paymentStatus, setPaymentStatus] = useState<'CREDIT' | 'CASH'>('CREDIT') // الافتراضي آجل
  const [invoiceNo, setInvoiceNo] = useState(`PUR-${Date.now().toString().slice(-6)}`)
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // خيار وضع استيراد الأصناف: أصناف متوفرة مسبقاً أو أصناف جديدة بالكامل
  const [importMode, setImportMode] = useState<'EXISTING' | 'NEW_PRODUCTS'>('NEW_PRODUCTS')

  // المخازن (تحديد المخزن المستلم)
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  // الخزائن والموردين
  const [safes, setSafes] = useState<any[]>([])
  const [selectedSafeId, setSelectedSafeId] = useState('')
  const [vendors, setVendors] = useState<any[]>([])
  const [selectedVendor, setSelectedVendor] = useState<any>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const vendorRef = useRef<HTMLDivElement>(null)

  // أسطر الفاتورة
  const [rows, setRows] = useState<InvoiceRow[]>([
    { id: 'row-1', modelNo: '', color: '', quantity: 1, cost: '', price: '', description: '' }
  ])

  // حالة البحث الحي واقتراحات الموديلات
  const [activeModelSearchIndex, setActiveModelSearchIndex] = useState<number | null>(null)
  const [modelSuggestions, setModelSuggestions] = useState<any[]>([])

  // حالة اقتراحات الألوان عند الوقوف على حقل اللون
  const [activeColorRowIndex, setActiveColorRowIndex] = useState<number | null>(null)
  const [availableColors, setAvailableColors] = useState<any[]>([])
  const [isLoadingColors, setIsLoadingColors] = useState(false)

  const dropdownContainerRef = useRef<HTMLDivElement>(null)

  // النوافذ المنبثقة
  const [showAddVendorModal, setShowAddVendorModal] = useState(false)
  const [newVendorData, setNewVendorData] = useState({ name: '', phone: '', address: '' })

  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [targetRowForNewProduct, setTargetRowForNewProduct] = useState<number | null>(null)
  const [newProductData, setNewProductData] = useState({ modelNo: '', color: '', cost: '', price: '', description: '' })

  // مؤشرات التحميل
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // مراجع لحقول الإدخال لتسهيل التنقل بـ Enter
  const inputRefs = useRef<{ [key: string]: HTMLElement | null }>({})

  // تحميل الموردين والخزن والمخازن وإغلاق النوافذ عند الضغط خارجها
  useEffect(() => {
    getVendors().then(setVendors)
    getSafesList().then((resSafes: any[]) => {
      setSafes(resSafes || [])
      if (resSafes && resSafes.length > 0) {
        const main = resSafes.find(s => s.name?.includes('الرئيسية')) || resSafes[0]
        setSelectedSafeId(main.id)
      }
    })

    // جلب المخازن وتعيين المخزن الرئيسي افتراضياً
    getWarehouses().then((resWh: any) => {
      if (resWh?.success && resWh.warehouses) {
        setWarehouses(resWh.warehouses)
        const defaultWh = resWh.warehouses.find((w: any) => w.isDefault) || resWh.warehouses[0]
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id)
        }
      }
    })

    const handleClickOutside = (e: MouseEvent) => {
      if (vendorRef.current && !vendorRef.current.contains(e.target as Node)) {
        setShowVendorDropdown(false)
      }
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setActiveModelSearchIndex(null)
        setActiveColorRowIndex(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // فلترة الموردين
  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    (v.code && v.code.toLowerCase().includes(vendorSearch.toLowerCase()))
  )

  // إضافة سطر جديد
  const addNewRow = () => {
    const newId = `row-${Date.now()}`
    setRows(prev => [
      ...prev,
      { id: newId, modelNo: '', color: '', quantity: 1, cost: '', price: '', description: '' }
    ])
    setTimeout(() => {
      inputRefs.current[`${newId}-modelNo`]?.focus()
    }, 50)
  }

  // حذف سطر
  const removeRow = (index: number) => {
    if (rows.length === 1) {
      setRows([{ id: `row-${Date.now()}`, modelNo: '', color: '', quantity: 1, cost: '', price: '', description: '' }])
      return
    }
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  // تحديث بيانات سطر
  const updateRow = (index: number, field: keyof InvoiceRow, value: any) => {
    setRows(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  // البحث الحي لكود الموديل وتجهيز الاقتراحات
  const handleModelSearch = async (index: number, term: string) => {
    updateRow(index, 'modelNo', term)
    if (term.trim().length >= 1) {
      setActiveModelSearchIndex(index)
      setActiveColorRowIndex(null)
      const results = await searchProductsForPurchase(term)
      
      const seen = new Set<string>()
      const uniqueModels: any[] = []
      for (const item of results) {
        const key = `${item.modelNo}`
        if (!seen.has(key)) {
          seen.add(key)
          uniqueModels.push(item)
        }
      }
      setModelSuggestions(uniqueModels.length > 0 ? uniqueModels : results)
    } else {
      setModelSuggestions([])
      setActiveModelSearchIndex(null)
    }
  }

  // اختيار موديل من قائمة اقتراحات الموديلات
  const handleSelectModel = async (index: number, item: any) => {
    updateRow(index, 'modelNo', item.modelNo)
    if (item.cost) updateRow(index, 'cost', item.cost)
    if (item.price) updateRow(index, 'price', item.price)
    if (item.description) updateRow(index, 'description', item.description)

    setActiveModelSearchIndex(null)

    setTimeout(() => {
      inputRefs.current[`${rows[index].id}-color`]?.focus()
      handleColorFocus(index, item.modelNo)
    }, 50)
  }

  // عند الوقوف على حقل اللون: جلب واقتراح جميع ألوان الموديل
  const handleColorFocus = async (index: number, explicitModelNo?: string) => {
    const targetModel = (explicitModelNo || rows[index].modelNo || '').trim()
    if (!targetModel) return

    setActiveModelSearchIndex(null)
    setActiveColorRowIndex(index)
    setIsLoadingColors(true)

    const colorsList = await getModelColors(targetModel)
    setAvailableColors(colorsList)
    setIsLoadingColors(false)
  }

  // عند اختيار لون من قائمة الألوان المقترحة
  const handleSelectColor = (index: number, colorItem: any) => {
    setRows(prev => {
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        color: colorItem.color,
        cost: colorItem.cost || copy[index].cost,
        price: colorItem.price || copy[index].price,
        description: colorItem.description || copy[index].description,
        isExisting: true,
        currentStock: colorItem.currentStock
      }
      return copy
    })
    setActiveColorRowIndex(null)

    setTimeout(() => {
      inputRefs.current[`${rows[index].id}-qty`]?.focus()
    }, 50)
  }

  // التنقل عند الضغط على Enter
  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const rowId = rows[rowIndex].id

      if (field === 'modelNo') {
        setActiveModelSearchIndex(null)
        inputRefs.current[`${rowId}-color`]?.focus()
        handleColorFocus(rowIndex)
      } else if (field === 'color') {
        setActiveColorRowIndex(null)
        inputRefs.current[`${rowId}-qty`]?.focus()
      } else if (field === 'qty') {
        inputRefs.current[`${rowId}-cost`]?.focus()
      } else if (field === 'cost') {
        inputRefs.current[`${rowId}-price`]?.focus()
      } else if (field === 'price') {
        if (rowIndex === rows.length - 1) {
          addNewRow()
        } else {
          const nextRowId = rows[rowIndex + 1].id
          inputRefs.current[`${nextRowId}-modelNo`]?.focus()
        }
      }
    }
  }

  // فتح نافذة صنف جديد إذا لم يكن موجوداً
  const handleOpenQuickProductModal = (rowIndex: number) => {
    const r = rows[rowIndex]
    setTargetRowForNewProduct(rowIndex)
    setNewProductData({
      modelNo: r.modelNo || '',
      color: r.color || '',
      cost: String(r.cost || ''),
      price: String(r.price || ''),
      description: r.description || ''
    })
    setActiveModelSearchIndex(null)
    setActiveColorRowIndex(null)
    setShowAddProductModal(true)
  }

  // حفظ صنف جديد سريعاً
  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProductData.modelNo || !newProductData.color) {
      alert('يرجى كتابة رقم الموديل واللون')
      return
    }

    const res = await createQuickProduct({
      modelNo: newProductData.modelNo,
      color: newProductData.color,
      cost: parseFloat(newProductData.cost) || 0,
      price: parseFloat(newProductData.price) || 0,
      description: newProductData.description,
      vendorId: selectedVendor?.id
    })

    if (res.success && res.product) {
      if (targetRowForNewProduct !== null && rows[targetRowForNewProduct]) {
        updateRow(targetRowForNewProduct, 'modelNo', res.product.modelNo)
        updateRow(targetRowForNewProduct, 'color', res.product.color)
        updateRow(targetRowForNewProduct, 'cost', res.product.cost)
        updateRow(targetRowForNewProduct, 'price', res.product.price)
        updateRow(targetRowForNewProduct, 'description', res.product.description || '')
        updateRow(targetRowForNewProduct, 'isExisting', true)
        updateRow(targetRowForNewProduct, 'currentStock', res.product.currentStock)
      }
      setShowAddProductModal(false)
      alert('✅ تم تسجيل الصنف بنجاح في قاعدة البيانات')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // حفظ مورد جديد سريعاً
  const handleSaveQuickVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVendorData.name.trim()) {
      alert('يرجى كتابة اسم المورد')
      return
    }

    const res = await addVendor({
      name: newVendorData.name.trim(),
      phone: newVendorData.phone.trim(),
      address: newVendorData.address.trim()
    })

    if (res.success && res.vendor) {
      setVendors(prev => [res.vendor, ...prev])
      setSelectedVendor(res.vendor)
      setVendorSearch(res.vendor.name)
      setShowAddVendorModal(false)
      setNewVendorData({ name: '', phone: '', address: '' })
      alert('✅ تم إنشاء المورد واختياره بنجاح')
    } else {
      alert('❌ خطأ: ' + res.error)
    }
  }

  // تحميل نموذج الإكسيل بحسب الوضع المختار
  const downloadExcelTemplate = () => {
    if (importMode === 'NEW_PRODUCTS') {
      const templateData = [
        {
          "كود_الموديل": "jp1001",
          "اللون": "لون",
          "الكمية": 31,
          "سعر_التكلفة": 127.5,
          "سعر_البيع": 150,
          "الوصف": "مشكل جيبة شتوي"
        },
        {
          "كود_الموديل": "sof1001",
          "اللون": "لون",
          "الكمية": 134,
          "سعر_التكلفة": 153,
          "سعر_البيع": 180,
          "الوصف": "مشكل صوف شتوي"
        },
        {
          "كود_الموديل": "tsh1001",
          "اللون": "لون",
          "الكمية": 100,
          "سعر_التكلفة": 187,
          "سعر_البيع": 220,
          "الوصف": "مشكل تيشيرت شتوي بيبي"
        },
        {
          "كود_الموديل": "sw1001",
          "اللون": "لون",
          "الكمية": 34,
          "سعر_التكلفة": 255,
          "سعر_البيع": 300,
          "الوصف": "مشكل سويت بيبي"
        },
        {
          "كود_الموديل": "fs1001",
          "اللون": "لون",
          "الكمية": 115,
          "سعر_التكلفة": 212.5,
          "سعر_البيع": 250,
          "الوصف": "مشكل فستان بيبي"
        }
      ]

      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "NewProducts")
      XLSX.writeFile(wb, "New_Products_Purchase_Template.xlsx")
    } else {
      const templateData = [
        { "الموديل": "5001", "اللون": "أسود", "الكمية": 20 },
        { "الموديل": "5001", "اللون": "أبيض", "الكمية": 15 }
      ]

      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "PurchaseItems")
      XLSX.writeFile(wb, "Existing_Products_Template.xlsx")
    }
  }

  // استيراد الأصناف من ملف الإكسيل بمرونة فائقة للنموذجين
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    const reader = new FileReader()

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]

        if (!data || data.length === 0) {
          alert('الملف فارغ أو لا يحتوي على بيانات صحيحة')
          setIsImporting(false)
          return
        }

        const rawItems = data.map(d => {
          const modelNo = String(
            d['كود_الموديل'] || d['كود الموديل'] || d['الموديل'] || d['الصنف'] || d['modelNo'] || ''
          ).trim()

          let color = String(d['اللون'] || d['لون'] || d['color'] || '').trim()
          if (!color) color = 'لون'

          const quantity = Number(d['الكمية'] || d['العدد'] || d['quantity'] || d['qty']) || 1

          const costVal = d['سعر_التكلفة'] || d['سعر التكلفة'] || d['التكلفة'] || d['cost']
          const priceVal = d['سعر_البيع'] || d['سعر البيع'] || d['السعر'] || d['price']
          const descVal = d['الوصف'] || d['وصف'] || d['description']

          return {
            modelNo,
            color,
            quantity,
            cost: costVal !== undefined && !isNaN(Number(costVal)) ? Number(costVal) : undefined,
            price: priceVal !== undefined && !isNaN(Number(priceVal)) ? Number(priceVal) : undefined,
            description: descVal ? String(descVal).trim() : undefined
          }
        }).filter(r => r.modelNo !== '')

        if (rawItems.length === 0) {
          alert('لم يتم العثور على أسطر صالحة. تأكد أن الملف يحتوي على عمود كود الموديل والكمية.')
          setIsImporting(false)
          return
        }

        const dbProducts = await fetchProductsForExcelImport(rawItems)
        const productMap = new Map<string, any>()
        dbProducts.forEach((p: any) => {
          const key = `${p.modelNo.toLowerCase().trim()}|${p.color.toLowerCase().trim()}`
          productMap.set(key, p)
        })

        let newItemsCount = 0
        let matchedCount = 0

        const importedRows: InvoiceRow[] = rawItems.map((r, index) => {
          const key = `${r.modelNo.toLowerCase()}|${r.color.toLowerCase()}`
          const dbItem = productMap.get(key)

          if (dbItem) matchedCount++
          else newItemsCount++

          const cost = r.cost !== undefined ? r.cost : (dbItem?.cost || 0)
          const price = r.price !== undefined ? r.price : (dbItem?.price || (cost > 0 ? cost * 1.25 : 0))
          const description = r.description !== undefined ? r.description : (dbItem?.description || '')

          return {
            id: `excel-row-${index}-${Date.now()}`,
            modelNo: r.modelNo,
            color: r.color,
            quantity: r.quantity,
            cost: cost > 0 ? cost : '',
            price: price > 0 ? price : '',
            description,
            isExisting: !!dbItem,
            currentStock: dbItem?.currentStock
          }
        })

        setRows(importedRows)
        alert(
          `✅ تم استيراد ${importedRows.length} صنف بنجاح!\n` +
          `- تم جلب أسعار وبيانات ${rawItems.filter(x => x.cost !== undefined).length} صنف من ملف الإكسيل مباشرة.\n` +
          `- أصناف مسجلة مسبقاً: ${matchedCount} | أصناف جديدة ستنشأ تلقائياً: ${newItemsCount}`
        )
      } catch (err: any) {
        console.error(err)
        alert('حدث خطأ أثناء قراءة ملف الإكسيل وتحديث البيانات')
      } finally {
        setIsImporting(false)
        e.target.value = ''
      }
    }

    reader.readAsBinaryString(file)
  }

  // حساب الإجماليات
  const totalQuantity = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const totalAmount = rows.reduce((sum, r) => sum + ((Number(r.quantity) || 0) * (Number(r.cost) || 0)), 0)

  // حفظ الفاتورة
  const handleSubmitInvoice = async () => {
    if (!selectedVendor) {
      alert('يرجى اختيار المورد أولاً')
      return
    }

    if (!selectedWarehouseId) {
      alert('يرجى تحديد المخزن المستلم للبضاعة')
      return
    }

    const validItems = rows.filter(r => r.modelNo.trim() !== '' && Number(r.quantity) > 0)

    if (validItems.length === 0) {
      alert('يرجى إدخال صنف واحد على الأقل يحتوي على كمية وسعر تكلفة')
      return
    }

    if (paymentStatus === 'CASH' && !selectedSafeId) {
      alert('يرجى تحديد الخزنة للسداد النقدي')
      return
    }

    const confirmMsg = invoiceType === 'PURCHASE'
      ? `تأكيد حفظ فاتورة المشتريات بقيمة ${totalAmount.toLocaleString()} ج.م (${paymentStatus === 'CASH' ? 'نقدي' : 'آجل'})؟`
      : `تأكيد حفظ مرتجع المشتريات بقيمة ${totalAmount.toLocaleString()} ج.م للمورد؟`

    if (!confirm(confirmMsg)) return

    setIsSaving(true)

    const payload = {
      vendorId: selectedVendor.id,
      warehouseId: selectedWarehouseId, // 👈 تمرير المخزن المختار
      invoiceType,
      paymentStatus,
      safeId: paymentStatus === 'CASH' ? selectedSafeId : undefined,
      invoiceNo,
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
    }

    const res = await createPurchaseInvoice(payload)
    setIsSaving(false)

    if (res.success) {
      alert(res.message)
      router.push(`/admin/vendors/${selectedVendor.id}`)
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
            <span className="text-3xl">🛒</span>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              {invoiceType === 'PURCHASE' ? 'فاتورة مشتريات بضاعة' : 'مرتجع مشتريات لمورد'}
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            إدخال المشتريات سطر بسطر أو عبر Excel بتفاصيل كاملة (موديل، لون، كمية، تكلفة، بيع، وصف)
          </p>
        </div>

        {/* أزرار العمليات ونموذج الإكسيل */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={downloadExcelTemplate}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 border border-slate-600"
          >
            <span>📥</span>
            <span>
              {importMode === 'NEW_PRODUCTS' ? 'تحميل نموذج أصناف جديدة' : 'تحميل نموذج أصناف حالية'}
            </span>
          </button>

          <label className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-900/30">
            <span>📊</span>
            <span>{isImporting ? 'جاري الاستيراد...' : 'استيراد Excel'}</span>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleExcelUpload}
              disabled={isImporting}
              className="hidden"
            />
          </label>

          <Link
            href="/admin"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition"
          >
            ← لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6" ref={dropdownContainerRef}>

        {/* كارت إعدادات الفاتورة وتحديد المخزن والمورد */}
        <div className="bg-slate-800/80 border border-slate-700/80 p-6 rounded-2xl shadow-lg">
          
          {/* الصف الأول: الأزرار والخيارات الأساسية متضمنة المخزن المستلم */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
            
            {/* 1. نوع الفاتورة */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">نوع الفاتورة</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setInvoiceType('PURCHASE')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    invoiceType === 'PURCHASE'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📥 شراء (وارد)
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceType('RETURN')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    invoiceType === 'RETURN'
                      ? 'bg-red-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📤 مرتجع (صادر)
                </button>
              </div>
            </div>

            {/* 2. طريقة السداد */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">طريقة السداد</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('CREDIT')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    paymentStatus === 'CREDIT'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ⏳ آجل (الافتراضي)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('CASH')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    paymentStatus === 'CASH'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  💵 نقدي (من الخزنة)
                </button>
              </div>
            </div>

            {/* 3. وضع الاستيراد */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">نوع استيراد الإكسيل</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setImportMode('NEW_PRODUCTS')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    importMode === 'NEW_PRODUCTS'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="نموذج: كود_الموديل، اللون، الكمية، سعر_التكلفة، سعر_البيع، الوصف"
                >
                  ✨ أصناف جديدة
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('EXISTING')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    importMode === 'EXISTING'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="نموذج: الموديل، اللون، الكمية فقط"
                >
                  📦 أصناف حالية
                </button>
              </div>
            </div>

            {/* 4. 🏢 المخزن المستلم للبضاعة (المطلوب) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-cyan-400">🏢 المخزن المستلم *</label>
                <span className="text-[10px] text-slate-400">الافتراضي: الرئيسي</span>
              </div>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full bg-slate-900 border-2 border-cyan-500/50 rounded-xl p-2.5 text-xs font-bold text-white focus:border-cyan-400 outline-none transition"
              >
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} {wh.isDefault ? '⭐ (الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. رقم الفاتورة والمرجع */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">رقم الفاتورة / المرجع</label>
              <input
                type="text"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm focus:border-blue-500 outline-none"
                placeholder="رقم الفاتورة"
              />
            </div>
          </div>

          {/* الصف الثاني: المورد والتاريخ والخزنة / الملاحظات */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700/60">
            
            {/* تاريخ الفاتورة */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">تاريخ الفاتورة</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold text-sm focus:border-blue-500 outline-none"
              />
            </div>

            {/* اختيار المورد مع البحث السريع */}
            <div className="relative" ref={vendorRef}>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-300">🏪 المورد (مطلوب)</label>
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold underline"
                >
                  + مورد جديد
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="ابحث باسم المورد أو الكود..."
                  value={vendorSearch}
                  onChange={(e) => {
                    setVendorSearch(e.target.value)
                    setShowVendorDropdown(true)
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold focus:border-blue-500 outline-none"
                />
                {selectedVendor && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVendor(null)
                      setVendorSearch('')
                    }}
                    className="absolute left-3 top-3 text-slate-400 hover:text-red-400 font-bold text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>

              {showVendorDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl mt-1 max-h-56 overflow-y-auto">
                  {filteredVendors.length > 0 ? (
                    filteredVendors.map(v => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVendor(v)
                          setVendorSearch(v.name)
                          setShowVendorDropdown(false)
                        }}
                        className="p-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between items-center"
                      >
                        <div>
                          <div className="font-bold text-white text-sm">{v.name}</div>
                          <div className="text-xs text-slate-400">{v.phone || 'بدون هاتف'}</div>
                        </div>
                        <span className="text-xs font-mono bg-slate-900 px-2 py-1 rounded text-blue-400">
                          {v.code}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-400">
                      لم يتم العثور على مورد بهذا الاسم.
                      <button
                        type="button"
                        onClick={() => {
                          setShowVendorDropdown(false)
                          setShowAddVendorModal(true)
                          setNewVendorData(prev => ({ ...prev, name: vendorSearch }))
                        }}
                        className="block w-full mt-2 text-blue-400 font-bold hover:underline"
                      >
                        ➕ أضف "{vendorSearch}" كمورد جديد الآن
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* الخزنة أو الملاحظات */}
            {paymentStatus === 'CASH' ? (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  🏦 الخزنة المسدد منها نقدياً
                </label>
                <select
                  value={selectedSafeId}
                  onChange={(e) => setSelectedSafeId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm font-bold focus:border-blue-500 outline-none"
                >
                  {safes.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">ملاحظات الفاتورة</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي بيان أو ملاحظة إضافية..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:border-blue-500 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* جدول بنود الفاتورة سطر بسطر */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl shadow-xl overflow-visible">
          <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center rounded-t-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📋 بنود الفاتورة</span>
              <span className="text-xs text-cyan-300 font-bold bg-cyan-950/60 border border-cyan-600/40 px-2.5 py-1 rounded-lg">
                المخزن المستلم: {warehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي'}
              </span>
              <span className="text-xs text-purple-300 font-bold bg-purple-950/60 border border-purple-600/40 px-2.5 py-1 rounded-lg">
                {importMode === 'NEW_PRODUCTS' ? 'وضع: أصناف جديدة كاملة التفاصيل' : 'وضع: أصناف حالية'}
              </span>
            </h3>

            <button
              type="button"
              onClick={addNewRow}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow flex items-center gap-1"
            >
              <span>+ سطر جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900 text-slate-300 text-xs font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 w-56">كود الموديل</th>
                  <th className="p-3 w-48">اللون</th>
                  <th className="p-3 w-28 text-center">الكمية</th>
                  <th className="p-3 w-32 text-center">سعر التكلفة</th>
                  <th className="p-3 w-32 text-center">سعر البيع</th>
                  <th className="p-3 w-36 text-center">الإجمالي</th>
                  <th className="p-3">الوصف</th>
                  <th className="p-3 w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {rows.map((row, index) => {
                  const lineTotal = (Number(row.quantity) || 0) * (Number(row.cost) || 0)

                  return (
                    <tr key={row.id} className="hover:bg-slate-700/30 transition">
                      <td className="p-3 text-center text-slate-400 font-bold text-xs">
                        {index + 1}
                      </td>

                      {/* 1. كود الموديل مع قائمة الاقتراحات الحية */}
                      <td className="p-2 relative">
                        <input
                          ref={(el) => { inputRefs.current[`${row.id}-modelNo`] = el }}
                          type="text"
                          value={row.modelNo}
                          onChange={(e) => handleModelSearch(index, e.target.value)}
                          onFocus={() => {
                            if (row.modelNo.trim().length > 0) {
                              handleModelSearch(index, row.modelNo)
                            }
                          }}
                          onKeyDown={(e) => handleKeyDown(e, index, 'modelNo')}
                          placeholder="ابحث برقم الموديل..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-bold focus:border-blue-500 outline-none text-sm"
                        />

                        {activeModelSearchIndex === index && (
                          <div className="absolute top-full right-0 w-80 z-50 bg-slate-800 border-2 border-blue-500 rounded-xl shadow-2xl mt-1 max-h-64 overflow-y-auto">
                            <div className="p-2 bg-slate-900/90 text-xs font-bold text-slate-400 border-b border-slate-700 flex justify-between items-center">
                              <span>الموديلات المقترحة</span>
                              <span className="text-[10px]">اختر الموديل</span>
                            </div>

                            {modelSuggestions.length > 0 ? (
                              modelSuggestions.map((prod) => (
                                <div
                                  key={prod.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleSelectModel(index, prod)
                                  }}
                                  className="p-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between items-center text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-white text-sm">{prod.modelNo}</span>
                                    {prod.description && (
                                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                        {prod.description}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-left">
                                    <div className="text-emerald-400 font-bold font-mono">{prod.cost} ج.م</div>
                                    <div className="text-[10px] text-slate-400">متاح: {prod.currentStock}</div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-slate-300">
                                لا يوجد صنف مطابق.
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleOpenQuickProductModal(index)
                                  }}
                                  className="mt-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3 rounded-lg block"
                                >
                                  ➕ إضافة صنف جديد باسم "{row.modelNo}"
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 2. اللون مع قائمة الألوان المقترحة للموديل */}
                      <td className="p-2 relative">
                        <input
                          ref={(el) => { inputRefs.current[`${row.id}-color`] = el }}
                          type="text"
                          value={row.color}
                          onChange={(e) => updateRow(index, 'color', e.target.value)}
                          onFocus={() => handleColorFocus(index)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'color')}
                          placeholder="اللون..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none text-sm font-medium"
                        />

                        {activeColorRowIndex === index && (
                          <div className="absolute top-full right-0 w-72 z-50 bg-slate-800 border-2 border-emerald-500 rounded-xl shadow-2xl mt-1 max-h-60 overflow-y-auto">
                            <div className="p-2 bg-slate-900/90 text-xs font-bold text-slate-300 border-b border-slate-700 flex justify-between items-center">
                              <span>ألوان موديل ({row.modelNo || 'الحالي'})</span>
                              {isLoadingColors && <span className="text-[10px] text-emerald-400 animate-pulse">جاري التحميل...</span>}
                            </div>

                            {availableColors.length > 0 ? (
                              availableColors.map((colorItem) => (
                                <div
                                  key={colorItem.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleSelectColor(index, colorItem)
                                  }}
                                  className="p-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 flex justify-between items-center text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                                    <span className="font-bold text-white text-sm">{colorItem.color}</span>
                                  </div>
                                  <div className="text-left font-mono">
                                    <span className="text-emerald-300 font-bold block">{colorItem.cost} ج.م</span>
                                    <span className="text-[10px] text-slate-400">رصيد: {colorItem.currentStock}</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-slate-400">
                                {isLoadingColors ? 'جاري جلب الألوان...' : 'لا توجد ألوان مسجلة مسبقاً لهذا الموديل، يمكنك كتابة اللون يدوياً.'}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 3. الكمية */}
                      <td className="p-2">
                        <input
                          ref={(el) => { inputRefs.current[`${row.id}-qty`] = el }}
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'qty')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-white font-bold focus:border-blue-500 outline-none text-sm"
                        />
                      </td>

                      {/* 4. سعر التكلفة */}
                      <td className="p-2">
                        <input
                          ref={(el) => { inputRefs.current[`${row.id}-cost`] = el }}
                          type="number"
                          step="0.01"
                          value={row.cost}
                          onChange={(e) => updateRow(index, 'cost', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'cost')}
                          placeholder="0.00"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-emerald-400 font-bold focus:border-blue-500 outline-none text-sm"
                        />
                      </td>

                      {/* 5. سعر البيع */}
                      <td className="p-2">
                        <input
                          ref={(el) => { inputRefs.current[`${row.id}-price`] = el }}
                          type="number"
                          step="0.01"
                          value={row.price}
                          onChange={(e) => updateRow(index, 'price', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index, 'price')}
                          placeholder="0.00"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-blue-400 font-bold focus:border-blue-500 outline-none text-sm"
                        />
                      </td>

                      {/* 6. الإجمالي */}
                      <td className="p-3 text-center font-bold text-white font-mono">
                        {lineTotal.toLocaleString()} ج.م
                      </td>

                      {/* 7. الوصف */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.description || ''}
                          onChange={(e) => updateRow(index, 'description', e.target.value)}
                          placeholder="وصف مختصر..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                        />
                      </td>

                      {/* 8. حذف السطر */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-slate-700 transition"
                          title="حذف السطر"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* تذييل الجدول والإجماليات */}
          <div className="p-6 bg-slate-900 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 rounded-b-2xl">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-400">عدد الأسطر: </span>
                <span className="font-bold text-white">{rows.length}</span>
              </div>
              <div>
                <span className="text-slate-400">إجمالي القطع: </span>
                <span className="font-bold text-blue-400 text-lg">{totalQuantity}</span>
              </div>
              <div>
                <span className="text-slate-400">المخزن المستلم: </span>
                <span className="font-bold text-cyan-400 text-base">
                  {warehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">صافي قيمة الفاتورة: </span>
                <span className="font-bold text-emerald-400 text-2xl font-mono">
                  {totalAmount.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={addNewRow}
                className="flex-1 md:flex-none bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-3 rounded-xl font-bold transition text-sm"
              >
                + سطر آخر (Enter)
              </button>

              <button
                type="button"
                onClick={handleSubmitInvoice}
                disabled={isSaving}
                className={`flex-1 md:flex-none px-8 py-3 rounded-xl font-black text-base shadow-xl transition flex items-center justify-center gap-2 ${
                  invoiceType === 'PURCHASE'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30'
                    : 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                } disabled:bg-slate-600 disabled:cursor-not-allowed`}
              >
                {isSaving ? (
                  <span>جاري الحفظ والتسجيل...</span>
                ) : (
                  <>
                    <span>💾</span>
                    <span>
                      {invoiceType === 'PURCHASE' ? 'حفظ وتوريد فاتورة المشتريات' : 'حفظ مرتجع المشتريات'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Modal إضافة مورد جديد سريعاً */}
      {showAddVendorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2 flex items-center gap-2">
              <span>🏪</span>
              <span>إضافة مورد جديد</span>
            </h3>

            <form onSubmit={handleSaveQuickVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم المورد (مطلوب)</label>
                <input
                  type="text"
                  required
                  value={newVendorData.name}
                  onChange={(e) => setNewVendorData({ ...newVendorData, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={newVendorData.phone}
                  onChange={(e) => setNewVendorData({ ...newVendorData, phone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">العنوان</label>
                <input
                  type="text"
                  value={newVendorData.address}
                  onChange={(e) => setNewVendorData({ ...newVendorData, address: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-sm"
                >
                  حفظ واختيار ✅
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal إضافة صنف جديد سريعاً */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2 flex items-center gap-2">
              <span>📦</span>
              <span>إضافة صنف جديد لقاعدة البيانات</span>
            </h3>

            <form onSubmit={handleSaveQuickProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رقم الموديل (مطلوب)</label>
                  <input
                    type="text"
                    required
                    value={newProductData.modelNo}
                    onChange={(e) => setNewProductData({ ...newProductData, modelNo: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللون (مطلوب)</label>
                  <input
                    type="text"
                    required
                    value={newProductData.color}
                    onChange={(e) => setNewProductData({ ...newProductData, color: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">سعر التكلفة</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProductData.cost}
                    onChange={(e) => setNewProductData({ ...newProductData, cost: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">سعر البيع المقترح</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProductData.price}
                    onChange={(e) => setNewProductData({ ...newProductData, price: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الوصف</label>
                <input
                  type="text"
                  value={newProductData.description}
                  onChange={(e) => setNewProductData({ ...newProductData, description: e.target.value })}
                  placeholder="وصف الصنف أو الخامة..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold text-sm"
                >
                  حفظ وإدراج بالسطر ✅
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}