'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { 
  getOrCreateBazaarDefaults, 
  getBazaarProductsCatalog, 
  saveBulkBazaarOrders 
} from '@/app/bazaar-actions'

interface CachedProduct {
  id: string
  modelNo: string
  color: string
  price: number
  cost?: number
  currentStock: number
  description?: string | null
  status?: string
}

interface CartItem {
  productId: string
  modelNo: string
  color: string
  price: number
  quantity: number
  discountPercent: number
  description?: string
  currentStock?: number
}

interface PaymentSplit {
  safeId: string
  safeName: string
  amount: number
}

interface PendingOrder {
  id: string
  clientOrderIndex: number
  items: CartItem[]
  totalAmount: number
  itemCount: number
  paymentSplits: PaymentSplit[]
  warehouseId?: string
  warehouseName?: string
  time: string
}

const STORAGE_ORDERS_KEY = 'pending_bazaar_orders_v2'
const STORAGE_OUTBOX_KEY = 'bazaar_outbox_batches_v1'
const STORAGE_PRODUCTS_KEY = 'bazaar_cached_products_v1'
const STORAGE_DEFAULTS_KEY = 'bazaar_defaults_cache_v1'

export default function BazaarFastOrderPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userId = session?.user?.image as string

  // كتالوج الأصناف المخزنة محلياً للعمل أوفلاين
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const [isCatalogLoading, setIsCatalogLoading] = useState(false)

  // الثوابت، وقوائم الخزن والمخازن
  const [bazaarDefaults, setBazaarDefaults] = useState<{
    customerId: string
    customerName: string
    defaultSafeId: string
    defaultSafeName: string
    defaultWarehouseId?: string
    defaultWarehouseName?: string
  } | null>(null)
  const [allSafes, setAllSafes] = useState<any[]>([])
  const [allWarehouses, setAllWarehouses] = useState<any[]>([])

  // المخزن المختار حالياً للصرف
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')

  // حالة الشبكة
  const [isOnline, setIsOnline] = useState(true)

  // سلة الزبون الحالي
  const [cart, setCart] = useState<CartItem[]>([])

  // تقسيم الخزن للأوردر الحالي
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([])
  const [showSafeSelector, setShowSafeSelector] = useState(false)

  // قائمة الأوردرات الحالية الجارية
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])

  // صندوق الأوردرات الموردة محلياً والجاهزة للرفع (Outbox)
  const [outboxOrders, setOutboxOrders] = useState<PendingOrder[]>([])
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false)

  // البحث والباركود
  const [searchTerm, setSearchTerm] = useState('')
  const [showScanner, setShowScanner] = useState(false)

  // النوافذ ومؤشرات التحميل
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'warn' } | null>(null)

  // مراجع لتفادي مشاكل Closures
  const outboxRef = useRef(outboxOrders)
  useEffect(() => { outboxRef.current = outboxOrders }, [outboxOrders])

  const cartRef = useRef(cart)
  useEffect(() => { cartRef.current = cart }, [cart])

  const pendingOrdersRef = useRef(pendingOrders)
  useEffect(() => { pendingOrdersRef.current = pendingOrders }, [pendingOrders])

  const historyTrappedRef = useRef(false)

  // حماية الرجوع للخلف لمنع فقدان البيانات غير المحفوظة
  useEffect(() => {
    const hasUnsaved = cart.length > 0 || pendingOrders.length > 0
    if (hasUnsaved && !historyTrappedRef.current) {
      window.history.pushState({ page: 'bazaar-active' }, '', window.location.href)
      historyTrappedRef.current = true
    } else if (!hasUnsaved) {
      historyTrappedRef.current = false
    }
  }, [cart.length, pendingOrders.length])

  useEffect(() => {
    let isNavigatingAway = false

    const handlePopState = () => {
      const hasUnsaved = cartRef.current.length > 0 || pendingOrdersRef.current.length > 0
      if (hasUnsaved && !isNavigatingAway) {
        const confirmLeave = window.confirm(
          '⚠️ تنبيه: لديك أصناف في السلة أو أوردرات معلقة لم يتم توريدها بعد!\n\nهل أنت متأكد من الخروج وفقدان البيانات؟'
        )

        if (confirmLeave) {
          isNavigatingAway = true
          historyTrappedRef.current = false
          router.push('/')
        } else {
          window.history.pushState({ page: 'bazaar-active' }, '', window.location.href)
        }
      }
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cartRef.current.length > 0 || pendingOrdersRef.current.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [router])

  const handleExitClick = () => {
    const hasUnsaved = cart.length > 0 || pendingOrders.length > 0
    if (hasUnsaved) {
      const confirmLeave = window.confirm(
        '⚠️ تنبيه: لديك أصناف في السلة أو أوردرات معلقة لم يتم توريدها بعد!\n\nهل أنت متأكد من الخروج؟'
      )
      if (confirmLeave) {
        historyTrappedRef.current = false
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }

  // مزامنة كتالوج الأصناف
  const syncProductsCatalog = async () => {
    if (!navigator.onLine) return
    setIsCatalogLoading(true)
    const res = await getBazaarProductsCatalog()
    if (res.success && res.products) {
      setCachedProducts(res.products)
      try {
        localStorage.setItem(STORAGE_PRODUCTS_KEY, JSON.stringify(res.products))
      } catch (e) {
        console.warn('LocalStorage limit reached for products cache', e)
      }
    }
    setIsCatalogLoading(false)
  }

  // رفع ومزامنة صندوق التوريدات المعلّقة (Outbox Sync)
  const syncOutboxToServer = async (explicitOrders?: PendingOrder[]) => {
    const ordersToSync = explicitOrders || outboxRef.current
    if (!navigator.onLine || ordersToSync.length === 0 || isSyncingOutbox) return

    const defaults = bazaarDefaults || (() => {
      try {
        const c = localStorage.getItem(STORAGE_DEFAULTS_KEY)
        return c ? JSON.parse(c).defaults : null
      } catch { return null }
    })()

    if (!defaults?.customerId || !defaults?.defaultSafeId || !userId) return

    setIsSyncingOutbox(true)

    const payload = {
      orders: ordersToSync.map(o => ({
        id: o.id,
        items: o.items.map(it => ({
          productId: it.productId,
          quantity: it.quantity,
          price: it.price,
          discountPercent: it.discountPercent
        })),
        totalAmount: o.totalAmount,
        paymentSplits: o.paymentSplits,
        warehouseId: o.warehouseId || defaults.defaultWarehouseId,
        deposit: o.totalAmount
      })),
      userId,
      customerId: defaults.customerId,
      defaultSafeId: defaults.defaultSafeId,
      defaultWarehouseId: defaults.defaultWarehouseId
    }

    try {
      const res = await saveBulkBazaarOrders(payload)
      if (res.success) {
        setOutboxOrders([])
        localStorage.removeItem(STORAGE_OUTBOX_KEY)
        setNotice({
          text: `🎉 تمت مزامنة ورفع ${ordersToSync.length} أوردر كان مورداً محلياً إلى السيرفر بنجاح!`,
          type: 'success'
        })
        setTimeout(() => setNotice(null), 8000)
        syncProductsCatalog()
      } else {
        console.warn('Failed to sync outbox:', res.error)
      }
    } catch (err) {
      console.error('Error syncing outbox:', err)
    } finally {
      setIsSyncingOutbox(false)
    }
  }

  // التحميل الأولي
  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      syncProductsCatalog()
      syncOutboxToServer()
    }

    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    try {
      const localProducts = localStorage.getItem(STORAGE_PRODUCTS_KEY)
      if (localProducts) setCachedProducts(JSON.parse(localProducts))
    } catch (e) {}

    try {
      const savedOrders = localStorage.getItem(STORAGE_ORDERS_KEY)
      if (savedOrders) setPendingOrders(JSON.parse(savedOrders))
    } catch (e) {}

    try {
      const savedOutbox = localStorage.getItem(STORAGE_OUTBOX_KEY)
      if (savedOutbox) setOutboxOrders(JSON.parse(savedOutbox))
    } catch (e) {}

    try {
      const cachedDefaults = localStorage.getItem(STORAGE_DEFAULTS_KEY)
      if (cachedDefaults) {
        const parsed = JSON.parse(cachedDefaults)
        setBazaarDefaults(parsed.defaults)
        setAllSafes(parsed.allSafes || [])
        setAllWarehouses(parsed.allWarehouses || [])
        setSelectedWarehouseId(parsed.defaults.defaultWarehouseId || '')
        setPaymentSplits([{
          safeId: parsed.defaults.defaultSafeId,
          safeName: parsed.defaults.defaultSafeName,
          amount: 0
        }])
      }
    } catch (e) {}

    if (navigator.onLine) {
      syncProductsCatalog()
      getOrCreateBazaarDefaults().then(res => {
        if (res.success && res.customerId && res.defaultSafeId) {
          const defaultsObj = {
            customerId: res.customerId,
            customerName: res.customerName || 'البازار',
            defaultSafeId: res.defaultSafeId,
            defaultSafeName: res.defaultSafeName || 'خزنة البازار',
            defaultWarehouseId: res.defaultWarehouseId,
            defaultWarehouseName: res.defaultWarehouseName || 'المخزن الرئيسي'
          }
          setBazaarDefaults(defaultsObj)
          setAllSafes(res.allSafes || [])
          setAllWarehouses(res.allWarehouses || [])
          setSelectedWarehouseId(res.defaultWarehouseId || '')

          setPaymentSplits([{
            safeId: defaultsObj.defaultSafeId,
            safeName: defaultsObj.defaultSafeName,
            amount: 0
          }])

          try {
            localStorage.setItem(STORAGE_DEFAULTS_KEY, JSON.stringify({
              defaults: defaultsObj,
              allSafes: res.allSafes || [],
              allWarehouses: res.allWarehouses || []
            }))
          } catch (e) {}

          setTimeout(() => syncOutboxToServer(), 1000)
        }
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(pendingOrders)) } catch (e) {}
  }, [pendingOrders])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_OUTBOX_KEY, JSON.stringify(outboxOrders)) } catch (e) {}
  }, [outboxOrders])

  // البحث المحلي
  const searchResults = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term || cachedProducts.length === 0) return []

    return cachedProducts
      .filter(p =>
        p.modelNo.toLowerCase().includes(term) ||
        (p.color && p.color.toLowerCase().includes(term)) ||
        (p.description && p.description.toLowerCase().includes(term))
      )
      .slice(0, 30)
  }, [searchTerm, cachedProducts])

  const currentCartTotal = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0)
  const currentCartPieces = cart.reduce((sum, it) => sum + it.quantity, 0)

  useEffect(() => {
    if (bazaarDefaults && paymentSplits.length <= 1) {
      const primarySafe = paymentSplits[0] || {
        safeId: bazaarDefaults.defaultSafeId,
        safeName: bazaarDefaults.defaultSafeName
      }
      setPaymentSplits([{
        safeId: primarySafe.safeId,
        safeName: primarySafe.safeName,
        amount: currentCartTotal
      }])
    }
  }, [currentCartTotal, bazaarDefaults])

  const handleAddProductToCart = (prod: CachedProduct, qty: number = 1) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === prod.id)
      if (existingIndex > -1) {
        const copy = [...prev]
        copy[existingIndex].quantity += qty
        return copy
      } else {
        return [
          {
            productId: prod.id,
            modelNo: prod.modelNo,
            color: prod.color,
            price: prod.price,
            quantity: qty,
            discountPercent: 0,
            description: prod.description || '',
            currentStock: prod.currentStock
          },
          ...prev
        ]
      }
    })
    setSearchTerm('')
  }

  const handleBarcodeScanned = (code: string) => {
    if (code) {
      const trimmedCode = code.trim().toLowerCase()
      const exactMatch = cachedProducts.find(
        p => p.modelNo.toLowerCase() === trimmedCode
      )

      if (exactMatch) {
        handleAddProductToCart(exactMatch, 1)
        setShowScanner(false)
      } else {
        setSearchTerm(code)
        setShowScanner(false)
      }
    }
  }

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty === 0) {
      setCart(prev => prev.filter(item => item.productId !== productId))
    } else {
      setCart(prev => prev.map(item => item.productId === productId ? { ...item, quantity: newQty } : item))
    }
  }

  const removeCartItem = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId))
  }

  const toggleNegativeQuantity = (productId: string) => {
    setCart(prev => prev.map(item => item.productId === productId ? { ...item, quantity: -item.quantity } : item))
  }

  const handleSplitSafeChange = (index: number, safeId: string) => {
    const selectedSafeObj = allSafes.find(s => s.id === safeId)
    setPaymentSplits(prev => {
      const copy = [...prev]
      copy[index].safeId = safeId
      copy[index].safeName = selectedSafeObj?.name || 'خزنة'
      return copy
    })
  }

  const handleSplitAmountChange = (index: number, val: number) => {
    setPaymentSplits(prev => {
      const copy = [...prev]
      copy[index].amount = val
      return copy
    })
  }

  const addAnotherSafeSplit = () => {
    const currentAllocated = paymentSplits.reduce((s, it) => s + (it.amount || 0), 0)
    const remaining = currentCartTotal - currentAllocated
    const availableSafe = allSafes.find(s => !paymentSplits.some(p => p.safeId === s.id)) || allSafes[0]

    setPaymentSplits(prev => [
      ...prev,
      {
        safeId: availableSafe?.id || '',
        safeName: availableSafe?.name || 'خزنة أخرى',
        amount: remaining
      }
    ])
  }

  const removeSafeSplit = (index: number) => {
    if (paymentSplits.length <= 1) return
    setPaymentSplits(prev => prev.filter((_, i) => i !== index))
  }

  const pendingOrdersTotal = pendingOrders.reduce((sum, ord) => sum + ord.totalAmount, 0)
  const grandTotalWithCurrent = pendingOrdersTotal + currentCartTotal

  const handleNextOrder = () => {
    if (cart.length === 0) {
      alert('السلة الحالية فارغة! أضف أصناف الأوردر أولاً.')
      return
    }

    const splitsTotal = paymentSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
    if (Math.abs(splitsTotal - currentCartTotal) > 0.01) {
      if (!confirm(`⚠️ تنبيه: مجموع مبالغ الخزن (${splitsTotal.toFixed(2)}) لا يساوي إجمالي الفاتورة (${currentCartTotal.toFixed(2)})!\nهل تريد المتابعة وتعديل المتبقي تلقائياً؟`)) {
        return
      }
    }

    const currentWhName = allWarehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي'

    const newPendingOrder: PendingOrder = {
      id: `pending-${Date.now()}`,
      clientOrderIndex: pendingOrders.length + 1,
      items: [...cart],
      totalAmount: currentCartTotal,
      itemCount: currentCartPieces,
      paymentSplits: [...paymentSplits],
      warehouseId: selectedWarehouseId,
      warehouseName: currentWhName,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }

    setPendingOrders(prev => [...prev, newPendingOrder])

    setCart([])
    setShowSafeSelector(false)
    if (bazaarDefaults) {
      setPaymentSplits([{
        safeId: bazaarDefaults.defaultSafeId,
        safeName: bazaarDefaults.defaultSafeName,
        amount: 0
      }])
    }
  }

  const removePendingOrder = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الأوردر المعلق؟')) {
      setPendingOrders(prev => prev.filter(o => o.id !== id))
    }
  }

  const editPendingOrder = (orderToEdit: PendingOrder) => {
    if (cart.length > 0) {
      if (!confirm('السلة الحالية بها أصناف، هل تريد استبدالها بالأوردر المعلق المحدد؟')) {
        return
      }
    }
    setCart(orderToEdit.items)
    setPaymentSplits(orderToEdit.paymentSplits || [])
    if (orderToEdit.warehouseId) setSelectedWarehouseId(orderToEdit.warehouseId)
    setPendingOrders(prev => prev.filter(o => o.id !== orderToEdit.id))
    setIsSummaryModalOpen(false)
  }

  const handleSaveAllOrders = async () => {
    let ordersToProcess = [...pendingOrders]

    if (cart.length > 0) {
      const currentWhName = allWarehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي'
      ordersToProcess.push({
        id: `pending-${Date.now()}`,
        clientOrderIndex: ordersToProcess.length + 1,
        items: [...cart],
        totalAmount: currentCartTotal,
        itemCount: currentCartPieces,
        paymentSplits: [...paymentSplits],
        warehouseId: selectedWarehouseId,
        warehouseName: currentWhName,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      })
    }

    if (ordersToProcess.length === 0) {
      alert('لا توجد أوردرات لحفظها!')
      return
    }

    const totalCash = ordersToProcess.reduce((s, o) => s + o.totalAmount, 0)

    if (!navigator.onLine) {
      const newOutbox = [...outboxOrders, ...ordersToProcess]
      setOutboxOrders(newOutbox)
      try {
        localStorage.setItem(STORAGE_OUTBOX_KEY, JSON.stringify(newOutbox))
      } catch (e) {}

      setPendingOrders([])
      setCart([])
      localStorage.removeItem(STORAGE_ORDERS_KEY)
      setIsSummaryModalOpen(false)
      historyTrappedRef.current = false

      if (bazaarDefaults) {
        setPaymentSplits([{
          safeId: bazaarDefaults.defaultSafeId,
          safeName: bazaarDefaults.defaultSafeName,
          amount: 0
        }])
      }

      setNotice({
        text: `📦 تم توريد واعتماد ${ordersToProcess.length} أوردر بمبلغ ${totalCash.toLocaleString()} ج.م محلياً (أوفلاين) وتصفير الشاشة للزبائن الجدد! ستتم المزامنة تلقائياً فور عودة الإنترنت.`,
        type: 'warn'
      })
      setTimeout(() => setNotice(null), 8000)
      return
    }

    const defaults = bazaarDefaults || (() => {
      try {
        const c = localStorage.getItem(STORAGE_DEFAULTS_KEY)
        return c ? JSON.parse(c).defaults : null
      } catch { return null }
    })()

    if (!defaults?.customerId || !defaults?.defaultSafeId || !userId) {
      alert('جاري تهيئة الإعدادات، يرجى المحاولة بعد لحظات...')
      return
    }

    setIsSavingAll(true)

    const allCombined = [...outboxOrders, ...ordersToProcess]

    const payload = {
      orders: allCombined.map(o => ({
        id: o.id,
        items: o.items.map(it => ({
          productId: it.productId,
          quantity: it.quantity,
          price: it.price,
          discountPercent: it.discountPercent
        })),
        totalAmount: o.totalAmount,
        paymentSplits: o.paymentSplits,
        warehouseId: o.warehouseId || selectedWarehouseId || defaults.defaultWarehouseId,
        deposit: o.totalAmount
      })),
      userId,
      customerId: defaults.customerId,
      defaultSafeId: defaults.defaultSafeId,
      defaultWarehouseId: selectedWarehouseId || defaults.defaultWarehouseId
    }

    const res = await saveBulkBazaarOrders(payload)
    setIsSavingAll(false)

    if (res.success) {
      setPendingOrders([])
      setOutboxOrders([])
      setCart([])
      localStorage.removeItem(STORAGE_ORDERS_KEY)
      localStorage.removeItem(STORAGE_OUTBOX_KEY)
      setIsSummaryModalOpen(false)
      historyTrappedRef.current = false

      if (bazaarDefaults) {
        setPaymentSplits([{
          safeId: bazaarDefaults.defaultSafeId,
          safeName: bazaarDefaults.defaultSafeName,
          amount: 0
        }])
      }

      setNotice({
        text: `🎉 تم بنجاح حفظ وتوريد ${allCombined.length} أوردر بمبلغ ${allCombined.reduce((s, o) => s + o.totalAmount, 0).toLocaleString()} ج.م في النظام وخصمها من المخزن المختار والخزائن - جاهز للزبائن الجدد!`,
        type: 'success'
      })
      setTimeout(() => setNotice(null), 7000)

      syncProductsCatalog()
    } else {
      alert(`❌ فشل الحفظ على السيرفر: ${res.error}\nتم الاحتفاظ بالأوردرات محلياً لحمايتها.`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 md:p-6 font-sans pb-36" dir="rtl">
      
      {notice && (
        <div className={`max-w-6xl mx-auto mb-3 p-3 md:p-4 rounded-2xl shadow-2xl flex justify-between items-center animate-in slide-in-from-top duration-300 border ${
          notice.type === 'success' 
            ? 'bg-emerald-600/90 border-emerald-400 text-white' 
            : 'bg-amber-600/95 border-amber-400 text-white'
        }`}>
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm md:text-base">
            <span>{notice.type === 'success' ? '✅' : '📦'}</span>
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-white text-lg font-bold px-2">✕</button>
        </div>
      )}

      {/* الهيدر العلوي مع اختيار المخزن */}
      <header className="max-w-6xl mx-auto bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-2xl shadow-xl flex flex-wrap justify-between items-center gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-lg shrink-0">
            🎪
          </div>
          <div>
            <h1 className="text-base sm:text-xl md:text-2xl font-black text-white flex items-center gap-2">
              <span>فاتورة البازار السريعة</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isOnline ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'}`}>
                {isOnline ? '🟢 أونلاين' : '🔴 أوفلاين (شغال محلياً)'}
              </span>
            </h1>
            <p className="text-slate-400 text-[11px] sm:text-xs flex flex-wrap items-center gap-2">
              <span>الخزنة: <b className="text-amber-400">{bazaarDefaults?.defaultSafeName || 'خزنة البازار'}</b></span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400">({cachedProducts.length} صنف محفوظ أوفلاين)</span>
              
              {outboxOrders.length > 0 && (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                  📦 {outboxOrders.length} أوردر مورد محلياً بانتظار المزامنة
                </span>
              )}
            </p>
          </div>
        </div>

        {/* قائمة اختيار مخزن الصرف المنصرف منه الأوردرات */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border-2 border-cyan-500/50 shadow-inner">
            <span className="text-xs font-bold text-cyan-400 whitespace-nowrap">🏢 مخزن الصرف:</span>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              {allWarehouses.map(wh => (
                <option key={wh.id} value={wh.id} className="bg-slate-900 text-white">
                  {wh.name} {wh.isDefault ? '⭐ (الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>

          {isOnline && outboxOrders.length > 0 && (
            <button
              onClick={() => syncOutboxToServer()}
              disabled={isSyncingOutbox}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 animate-pulse"
            >
              <span>{isSyncingOutbox ? '⏳' : '⚡'}</span>
              <span>مزامنة الأوفلاين ({outboxOrders.length})</span>
            </button>
          )}

          {isOnline && (
            <button
              onClick={syncProductsCatalog}
              disabled={isCatalogLoading}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-700"
              title="تحديث الأصناف من السيرفر"
            >
              <span>{isCatalogLoading ? '⏳' : '🔄'}</span>
              <span className="hidden sm:inline">تحديث الأصناف</span>
            </button>
          )}

          {pendingOrders.length > 0 && (
            <button
              onClick={() => setIsSummaryModalOpen(true)}
              className="bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition flex items-center gap-1"
            >
              <span>📋 المعلقة ({pendingOrders.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExitClick}
            className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold transition"
          >
            ← خروج
          </button>
        </div>
      </header>

      {/* البحث والباركود */}
      <div className="max-w-6xl mx-auto space-y-3 sm:space-y-4">
        
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-2xl shadow-lg">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="🔍 ابحث بالموديل أو اللون (يعمل أوفلاين لحظياً)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white font-bold text-sm sm:text-base focus:border-amber-500 outline-none"
            />
            
            <button
              onClick={() => setShowScanner(true)}
              className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white px-4 sm:px-5 py-3 rounded-xl border border-slate-700 font-bold flex items-center justify-center shrink-0 transition"
              title="سكانر الكاميرا"
            >
              <span className="text-xl">📷</span>
            </button>
          </div>

          {showScanner && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-3 sm:p-4">
              <div className="w-full max-w-sm bg-slate-900 rounded-3xl overflow-hidden relative border-2 border-amber-500/60 shadow-2xl flex flex-col">
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-white">
                  <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                    <span>📷</span>
                    <span>وجه الكاميرا نحو الباركود</span>
                  </span>
                  <button 
                    onClick={() => setShowScanner(false)} 
                    className="bg-red-600 hover:bg-red-500 text-white w-7 h-7 rounded-full font-bold flex items-center justify-center text-sm"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="relative aspect-square w-full bg-black flex items-center justify-center">
                  <Scanner 
                    onScan={(res) => {
                      if (res && res.length > 0) {
                        handleBarcodeScanned(res[0].rawValue)
                      }
                    }} 
                  />
                  <div className="absolute inset-0 pointer-events-none border-2 border-amber-400/30 m-8 rounded-2xl flex items-center justify-center">
                    <div className="w-full h-0.5 bg-red-500/80 animate-pulse"></div>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950 text-center">
                  <button
                    onClick={() => setShowScanner(false)}
                    className="w-full py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-700"
                  >
                    إلغاء السكانر
                  </button>
                </div>
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="mt-2 divide-y divide-slate-800 bg-slate-950 border border-slate-800 rounded-xl max-h-56 overflow-y-auto">
              {searchResults.map(prod => (
                <div
                  key={prod.id}
                  className="p-2.5 sm:p-3 hover:bg-slate-900 flex justify-between items-center transition"
                >
                  <div className="cursor-pointer flex-1" onClick={() => handleAddProductToCart(prod, 1)}>
                    <span className="font-black text-white text-sm sm:text-base">{prod.modelNo}</span>
                    <span className="text-amber-400 font-bold text-xs mr-2">({prod.color})</span>
                    {prod.description && <span className="text-slate-500 text-[11px] block">{prod.description}</span>}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="text-left font-mono">
                      <span className="text-emerald-400 font-bold text-sm sm:text-lg block">{prod.price} ج.م</span>
                      <span className="text-[10px] text-slate-500">رصيد كلي: {prod.currentStock}</span>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleAddProductToCart(prod, 1)}
                        className="bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition border border-emerald-500/40"
                        title="إضافة بيع عادي"
                      >
                        + بيع
                      </button>
                      <button
                        onClick={() => handleAddProductToCart(prod, -1)}
                        className="bg-rose-600/30 text-rose-300 hover:bg-rose-600 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition border border-rose-500/40"
                        title="إضافة كمرتجع أو استبدال بالسالب"
                      >
                        - مرتجع
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchTerm.trim().length > 0 && searchResults.length === 0 && (
            <div className="mt-2 p-3 text-center text-xs text-slate-500 bg-slate-950 rounded-xl">
              لا يوجد صنف مطابق لكلمة "{searchTerm}".
            </div>
          )}
        </div>

        {/* سلة الزبون الحالي */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl">
          <div className="flex justify-between items-center pb-2.5 border-b border-slate-800 mb-3">
            <h2 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              <span>🛒 سلة الزبون الحالي</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-mono">
                {currentCartPieces} قطعة
              </span>
            </h2>

            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-red-400 hover:text-red-300 font-bold"
              >
                مسح السلة ✕
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-bold text-xs sm:text-sm">
              السلة فارغة. ابحث عن صنف أو استخدم الكاميرا لإضافته فوراً (يعمل أوفلاين).
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => {
                const isNegative = item.quantity < 0
                return (
                  <div
                    key={item.productId}
                    className={`border p-2.5 sm:p-3 rounded-xl flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 transition ${
                      isNegative 
                        ? 'bg-rose-950/20 border-rose-600/40' 
                        : 'bg-slate-950 border-slate-800/80'
                    }`}
                  >
                    <div className="min-w-[120px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-white text-sm sm:text-base">{item.modelNo}</span>
                        {isNegative && (
                          <span className="bg-rose-500 text-white text-[9px] font-black px-1 py-0.5 rounded">
                            مرتجع
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-amber-400 font-bold">{item.color}</span>
                      <span className="text-xs text-slate-400 font-mono mr-1.5">({item.price} ج.م)</span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 mr-auto">
                      
                      <button
                        onClick={() => toggleNegativeQuantity(item.productId)}
                        className={`text-[11px] px-2 py-1 rounded font-bold transition border ${
                          isNegative 
                            ? 'bg-rose-600 text-white border-rose-500' 
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                        title="تحويل بين بيع ومرتجع"
                      >
                        {isNegative ? 'مرتجع (-)' : 'بيع (+)'}
                      </button>

                      <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                        <button
                          onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                          className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded flex items-center justify-center text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateCartQty(item.productId, parseInt(e.target.value) || 0)}
                          className="w-10 text-center font-bold font-mono text-white text-xs sm:text-sm bg-transparent outline-none"
                        />
                        <button
                          onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                          className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                      </div>

                      <span className={`font-mono font-black text-sm sm:text-base min-w-[65px] text-left ${isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {(item.price * item.quantity).toLocaleString()} ج.م
                      </span>

                      <button
                        onClick={() => removeCartItem(item.productId)}
                        className="text-red-400 hover:text-red-300 text-sm p-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* لوحة اختيار الخزنة وتقسيم الدفع */}
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="flex flex-wrap justify-between items-center gap-1.5 mb-2">
              <div className="flex items-center gap-1 text-[11px] sm:text-xs">
                <span className="text-slate-400">التحصيل:</span>
                <span className="text-amber-400 font-bold font-mono">
                  {paymentSplits.map(s => `${s.safeName} (${s.amount.toFixed(0)})`).join(' + ')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowSafeSelector(!showSafeSelector)}
                className="text-[11px] sm:text-xs text-blue-400 hover:text-blue-300 font-bold underline"
              >
                {showSafeSelector ? 'إخفاء ✕' : '⚙️ تغيير الخزنة / دفع مجزأ'}
              </button>
            </div>

            {showSafeSelector && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5 mt-2 animate-in fade-in duration-200">
                <div className="flex justify-between items-center text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <span>تحديد الخزنة والمبلغ</span>
                  <button
                    type="button"
                    onClick={addAnotherSafeSplit}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[10px]"
                  >
                    + خزنة أخرى
                  </button>
                </div>

                {paymentSplits.map((split, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={split.safeId}
                      onChange={(e) => handleSplitSafeChange(idx, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-white outline-none"
                    >
                      {allSafes.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={split.amount}
                      onChange={(e) => handleSplitAmountChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-emerald-400 font-bold font-mono text-xs outline-none"
                    />

                    {paymentSplits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSafeSplit(idx)}
                        className="text-red-400 hover:text-red-300 p-1 text-sm font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* الشريط السفلي الثابت */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 shadow-2xl z-40">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          
          <div className="flex items-center justify-between w-full md:w-auto gap-4 sm:gap-6">
            <div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 block">إجمالي الحالي</span>
              <span className={`text-xl sm:text-2xl font-black font-mono ${currentCartTotal < 0 ? 'text-rose-400' : 'text-white'}`}>
                {currentCartTotal.toLocaleString()} <small className="text-[10px] sm:text-xs text-slate-400">ج.م</small>
              </span>
            </div>

            <div className="border-r border-slate-800 pr-4 sm:pr-6">
              <span className="text-[10px] sm:text-[11px] text-amber-400 font-bold block">
                تجميعة النقدية
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                {grandTotalWithCurrent.toLocaleString()} <small className="text-[10px] sm:text-xs text-amber-300">ج.م</small>
              </span>
            </div>

            <div className="border-r border-slate-800 pr-4 sm:pr-6 hidden sm:block">
              <span className="text-[10px] sm:text-[11px] text-cyan-400 font-bold block">مخزن التسليم:</span>
              <span className="text-xs font-bold text-white">
                {allWarehouses.find(w => w.id === selectedWarehouseId)?.name || 'المخزن الرئيسي'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto">
            <button
              onClick={handleNextOrder}
              disabled={cart.length === 0}
              className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 sm:px-8 py-3 rounded-xl font-black text-sm sm:text-base shadow-lg transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>التالي</span>
              <span>⏭️</span>
            </button>

            <button
              onClick={() => setIsSummaryModalOpen(true)}
              disabled={pendingOrders.length === 0 && cart.length === 0}
              className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 sm:px-8 py-3 rounded-xl font-black text-sm sm:text-base shadow-lg transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>حفظ الكل</span>
              <span>💾</span>
            </button>
          </div>

        </div>
      </div>

      {/* Modal مراجعة وحفظ الكل */}
      {isSummaryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] flex flex-col">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">📋 تجميعة وتوريد فواتير البازار</h3>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  {isOnline ? 'سيتم اعتماد وتوريد الفواتير في النظام وخصم الكميات من المخازن المحددة' : '⚠️ أنت أوفلاين: سيتم اعتماد التوريد محلياً وتصفير الشاشة للزبائن الجدد'}
                </p>
              </div>
              <button onClick={() => setIsSummaryModalOpen(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {pendingOrders.map((ord, idx) => (
                <div key={ord.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-black text-amber-400 text-xs sm:text-sm block">أوردر #{idx + 1}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      الوقت: {ord.time} | قطع: {ord.itemCount} | مخزن: <b className="text-cyan-400">{ord.warehouseName || 'الرئيسي'}</b>
                    </span>
                    <div className="text-[10px] text-amber-300/80 mt-0.5">
                      الخزن: {ord.paymentSplits?.map(s => `${s.safeName}: ${s.amount}`).join(' | ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-black text-sm sm:text-base ${ord.totalAmount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {ord.totalAmount.toLocaleString()} ج.م
                    </span>

                    <button
                      onClick={() => editPendingOrder(ord)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-300 px-2 py-1 rounded font-bold"
                    >
                      ✏️
                    </button>

                    <button
                      onClick={() => removePendingOrder(ord.id)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-red-400 px-2 py-1 rounded font-bold"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {cart.length > 0 && (
                <div className="bg-blue-950/30 border border-blue-500/30 p-3 rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-black text-blue-400 text-xs sm:text-sm block">الأوردر الحالي</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      قطع: {currentCartPieces} | مخزن: <b className="text-cyan-400">{allWarehouses.find(w => w.id === selectedWarehouseId)?.name || 'الرئيسي'}</b>
                    </span>
                  </div>
                  <span className={`font-mono font-black text-sm sm:text-base ${currentCartTotal < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {currentCartTotal.toLocaleString()} ج.م
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">إجمالي عدد الفواتير:</span>
                <span className="font-bold text-white font-mono">{pendingOrders.length + (cart.length > 0 ? 1 : 0)} أوردر</span>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2.5 sm:p-3 rounded-xl border border-slate-800">
                <span className="font-bold text-amber-400 text-xs sm:text-sm">صافي النقدية بالدرج:</span>
                <span className="font-black text-emerald-400 font-mono text-lg sm:text-xl">
                  {grandTotalWithCurrent.toLocaleString()} ج.م
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsSummaryModalOpen(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  إلغاء والعودة
                </button>

                <button
                  type="button"
                  onClick={handleSaveAllOrders}
                  disabled={isSavingAll}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-xl transition disabled:bg-slate-700 flex items-center justify-center gap-1.5"
                >
                  {isSavingAll ? 'جاري الحفظ...' : (isOnline ? 'تأكيد الحفظ والتوريد ✅' : 'اعتماد التوريد محلياً وبدء وردية جديدة 📦')}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}