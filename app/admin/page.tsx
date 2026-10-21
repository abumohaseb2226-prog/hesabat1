'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import NotificationBell from './NotificationBell'
import Link from 'next/link'

interface SubItem {
  id: string
  title: string
  icon: string
  borderColor: string
  glowColor: string
  href: string
}

interface MainCategory {
  id: string
  title: string
  icon: string
  borderColor: string
  glowColor: string
  description: string
  items: SubItem[]
}

export default function AdminDashboard() {
  const router = useRouter()
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  // القسم النشط (null = القائمة الرئيسية الستة)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // =========================================================================
  // الهيكل الشامل مع تحديد لون البوردر الرفيع لكل قسم وعملية
  // =========================================================================
  const categories: MainCategory[] = [
    // 1. الموردون (بوردر برتقالي ذهبي)
    {
      id: 'vendors',
      title: 'الموردون',
      icon: '🏪',
      borderColor: 'border-amber-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(251,191,36,0.25)]',
      description: 'حسابات الموردين وفواتير الشراء والمدفوعات',
      items: [
        { id: 'v-purchases', title: 'فاتورة مشتريات ومردود', icon: '📥', borderColor: 'border-purple-400', glowColor: 'hover:shadow-[0_0_20px_rgba(192,132,252,0.25)]', href: '/admin/purchases/new' },
        { id: 'v-payment', title: 'دفع للمورد', icon: '💰', borderColor: 'border-emerald-400', glowColor: 'hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]', href: '/payments/new' },
        { id: 'v-report', title: 'تقرير وسجل الموردين', icon: '📊', borderColor: 'border-amber-400', glowColor: 'hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]', href: '/admin/vendors' },
      ]
    },

    // 2. العملاء (بوردر أزرق سماوي)
    {
      id: 'customers',
      title: 'العملاء',
      icon: '👥',
      borderColor: 'border-blue-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(96,165,250,0.25)]',
      description: 'فواتير البيع، البازار، المرتجعات، والتحصيل',
      items: [
        { id: 'c-order-new', title: 'فاتورة بيع (أوردر جديد)', icon: '🛒', borderColor: 'border-blue-400', glowColor: 'hover:shadow-[0_0_20px_rgba(96,165,250,0.25)]', href: '/orders/new' },
        { id: 'c-bazaar', title: 'فاتورة البازار السريعة', icon: '🎪', borderColor: 'border-amber-400', glowColor: 'hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]', href: '/orders/bazaar' },
        { id: 'c-returns', title: 'مرتجع مبيعات', icon: '↩️', borderColor: 'border-rose-400', glowColor: 'hover:shadow-[0_0_20px_rgba(251,113,133,0.25)]', href: '/admin/returns' },
        { id: 'c-payment', title: 'تحصيل النقدية', icon: '💵', borderColor: 'border-emerald-400', glowColor: 'hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]', href: '/payments/new' },
        { id: 'c-orders-list', title: 'إدارة الأوردرات', icon: '📝', borderColor: 'border-cyan-400', glowColor: 'hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]', href: '/orders/list' },
        { id: 'c-bazaar-rep', title: 'تقرير البازار', icon: '📈', borderColor: 'border-yellow-400', glowColor: 'hover:shadow-[0_0_20px_rgba(250,204,21,0.25)]', href: '/admin/reports/bazaar' },
        { id: 'c-cust-rep', title: 'تقرير وسجل العملاء', icon: '👤', borderColor: 'border-violet-400', glowColor: 'hover:shadow-[0_0_20px_rgba(167,139,250,0.25)]', href: '/admin/customers' },
      ]
    },

    // 3. الأصناف (بوردر بنفسجي أرجواني)
    {
      id: 'products',
      title: 'الأصناف',
      icon: '📦',
      borderColor: 'border-purple-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(192,132,252,0.25)]',
      description: 'إدارة المخزون، كارت الصنف، الجرد والعروض',
      items: [
        { id: 'p-manage', title: 'إدارة الأصناف (إضافة ورفع)', icon: '🏷️', borderColor: 'border-purple-400', glowColor: 'hover:shadow-[0_0_20px_rgba(192,132,252,0.25)]', href: '/admin/products' },
        { id: 'p-movement', title: 'كارت الصنف وحركة المخزون', icon: '📊', borderColor: 'border-blue-400', glowColor: 'hover:shadow-[0_0_20px_rgba(96,165,250,0.25)]', href: '/admin/reports' },
        { id: 'p-audit', title: 'جرد الأصناف', icon: '⚖️', borderColor: 'border-cyan-400', glowColor: 'hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]', href: '/admin/inventory-audits' },
        { id: 'p-offers', title: 'إدارة العروض والأسعار', icon: '🔖', borderColor: 'border-pink-400', glowColor: 'hover:shadow-[0_0_20px_rgba(244,114,182,0.25)]', href: '/admin/offers' },
      ]
    },

    // 4. النقدية والأوراق المالية (بوردر أخضر زمردي)
    {
      id: 'cash-finance',
      title: 'النقدية والأوراق المالية',
      icon: '💰',
      borderColor: 'border-emerald-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(52,211,153,0.25)]',
      description: 'حركات الخزينة وسندات القبض والصرف والشيكات',
      items: [
        { id: 'cf-cash-manage', title: 'إدارة النقدية (قبض وصرف)', icon: '💵', borderColor: 'border-green-400', glowColor: 'hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]', href: '/payments/new' },
        { id: 'cf-safes', title: 'تقرير الخزينة وإدارتها', icon: '🏦', borderColor: 'border-teal-400', glowColor: 'hover:shadow-[0_0_20px_rgba(45,212,191,0.25)]', href: '/admin/cash-management' },
        { id: 'cf-checks', title: 'الشيكات والأوراق المالية', icon: '📑', borderColor: 'border-indigo-400', glowColor: 'hover:shadow-[0_0_20px_rgba(129,140,248,0.25)]', href: '/admin/financial-papers' },
      ]
    },

    // 5. المستخدمين والموظفين (بوردر نيلي Indigo)
    {
      id: 'staff-users',
      title: 'المستخدمين والموظفين',
      icon: '👔',
      borderColor: 'border-indigo-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(129,140,248,0.25)]',
      description: 'كشوف حساب الموظفين، الرواتب، والصلاحيات',
      items: [
        { id: 'su-employees', title: 'إدارة الموظفين وتقاريرهم', icon: '👨‍💼', borderColor: 'border-blue-400', glowColor: 'hover:shadow-[0_0_20px_rgba(96,165,250,0.25)]', href: '/admin/employees' },
        { id: 'su-users', title: 'إدارة المستخدمين والصلاحيات', icon: '🛡️', borderColor: 'border-purple-400', glowColor: 'hover:shadow-[0_0_20px_rgba(192,132,252,0.25)]', href: '/admin/users' },
        { id: 'su-pay-emp', title: 'دفع للموظف (سلفة وراتب)', icon: '💸', borderColor: 'border-teal-400', glowColor: 'hover:shadow-[0_0_20px_rgba(45,212,191,0.25)]', href: '/payments/new' },
        { id: 'su-sales-team', title: 'أداء فريق المبيعات', icon: '🏆', borderColor: 'border-amber-400', glowColor: 'hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]', href: '/admin/reports' },
      ]
    },

    // 6. الحسابات (بوردر تركواز/Teal)
    {
      id: 'accounting',
      title: 'الحسابات',
      icon: '📈',
      borderColor: 'border-teal-400',
      glowColor: 'hover:shadow-[0_0_25px_rgba(45,212,191,0.25)]',
      description: 'القوائم المالية والمركز المالي والدائنون والأصول',
      items: [
        { id: 'acc-financial', title: 'القوائم المالية والأرباح (P&L)', icon: '📊', borderColor: 'border-emerald-400', glowColor: 'hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]', href: '/admin/reports/financial' },
        { id: 'acc-debtors', title: 'الدائنون والمدينون (قروض)', icon: '🤝', borderColor: 'border-indigo-400', glowColor: 'hover:shadow-[0_0_20px_rgba(129,140,248,0.25)]', href: '/admin/debtors-creditors' },
        { id: 'acc-assets', title: 'الأصول الثابتة الرأسمالية', icon: '🏭', borderColor: 'border-cyan-400', glowColor: 'hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]', href: '/admin/assets' },
      ]
    }
  ]

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl font-bold animate-pulse">جاري تحميل لوحة التحكم...</div>
      </div>
    )
  }

  const currentCategory = categories.find(c => c.id === selectedCategoryId) || null
  const displayItems = currentCategory ? currentCategory.items : categories

  return (
    <div className="min-h-screen bg-slate-900 w-full font-sans select-none" dir="rtl">
      
      {/* Header */}
      <header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700/80 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (selectedCategoryId) setSelectedCategoryId(null)
                else router.push('/')
              }} 
              className="text-white bg-slate-700/80 hover:bg-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-600/50"
            >
              {selectedCategoryId ? '↺ رجوع للرئيسية' : '← خروج لتطبيق البيع'}
            </button>

            <div className="bg-blue-600 px-3.5 py-1.5 rounded-xl font-black text-white text-xs md:text-sm shadow-md shadow-blue-900/30">
              لوحة التحكم المحاسبية
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell isDark={true} />

            <Link
              href="/admin/settings"
              className="p-2 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-slate-200 transition border border-slate-600/50"
              title="إعدادات النظام"
            >
              ⚙️
            </Link>

            <div className="text-left hidden sm:block">
              <div className="text-white font-bold text-xs">{session?.user?.name || 'مدير النظام'}</div>
              <div className="text-[10px] text-gray-400">{session?.user?.email || 'ADMIN'}</div>
            </div>
            
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow">
              {session?.user?.name?.[0] || 'A'}
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="w-full px-4 md:px-8 py-8 md:py-12">
        
        {/* عنوان اللوحة والشريط الإرشادي */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-black text-white mb-2 transition-all">
            {currentCategory ? currentCategory.title : 'لوحة التحكم المحاسبية والإدارية'}
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            {currentCategory ? currentCategory.description : 'اضغط على أي قسم لعرض العمليات والتقارير المندرجة تحته'}
          </p>

          {/* مسار التنقل (Breadcrumb) */}
          {currentCategory && (
            <div className="mt-4 inline-flex items-center gap-2 bg-slate-800/60 backdrop-blur-md border border-slate-700 px-4 py-1.5 rounded-full text-xs font-bold">
              <button 
                onClick={() => setSelectedCategoryId(null)}
                className="text-blue-400 hover:underline"
              >
                الرئيسية
              </button>
              <span className="text-slate-500">/</span>
              <span className="text-white">{currentCategory.title}</span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* عرض الديسكتوب: دوائر زجاجية شفافة محاطة ببوردر رفيع بلون مميز */}
        {/* ========================================================================= */}
        <div className="hidden md:block relative mx-auto" style={{ height: '700px', maxWidth: '850px' }}>
          
          {/* الدائرة المركزية الكبرى (زجاجية ومحاطة ببوردر رفيع متناسق) */}
          <div 
            className="absolute top-1/2 left-1/2 z-20"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <button
              onClick={() => {
                if (selectedCategoryId) setSelectedCategoryId(null)
              }}
              className={`w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 bg-slate-900/65 backdrop-blur-2xl border-[1.5px] ${
                currentCategory 
                  ? `${currentCategory.borderColor} hover:scale-105 cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.08)]` 
                  : 'border-purple-400/80 shadow-[0_0_35px_rgba(168,85,247,0.25)] animate-pulse-glow'
              }`}
              title={currentCategory ? 'اضغط للرجوع للقائمة الرئيسية' : 'لوحة التحكم modoo'}
            >
              {currentCategory ? (
                <div className="text-center px-2 animate-in fade-in zoom-in duration-300">
                  <div className="text-4xl mb-1">{currentCategory.icon}</div>
                  <div className="text-white font-black text-base">{currentCategory.title}</div>
                  <div className="text-[11px] text-amber-300 font-bold mt-1.5 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full inline-block">
                    ↺ رجوع
                  </div>
                </div>
              ) : (
                <div className="text-center animate-in fade-in zoom-in duration-300">
                  <div className="text-3xl font-black text-white">modoo</div>
                  <div className="text-xs text-purple-300 font-mono mt-0.5">v2.0</div>
                  <div className="text-[10px] text-gray-400 mt-1 font-bold">الرئيسية</div>
                </div>
              )}
            </button>
          </div>

          {/* الدوائر المحيطية: خلفية زجاجية شفافة وبوردر رفيع ملون */}
          {displayItems.map((item: any, index: number) => {
            const total = displayItems.length
            const angle = (index * (360 / total) - 90) * (Math.PI / 180)
            const radius = 290
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius

            const isSub = Boolean(currentCategory)

            return (
              <div
                key={item.id}
                className="absolute top-1/2 left-1/2 transition-all duration-700 ease-out"
                style={{ 
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` 
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!isSub) {
                      setSelectedCategoryId(item.id)
                    } else {
                      router.push(item.href)
                    }
                  }}
                  className="group block focus:outline-none"
                >
                  <div
                    className={`
                      ${isSub ? 'w-32 h-32' : 'w-36 h-36'}
                      bg-slate-900/60 backdrop-blur-xl
                      rounded-full 
                      flex flex-col items-center justify-center 
                      transition-all 
                      duration-300
                      hover:scale-115 
                      hover:bg-slate-800/80
                      border-[1.5px] ${item.borderColor}
                      ${item.glowColor}
                      shadow-lg shadow-black/40
                      animate-float
                      relative
                      cursor-pointer
                    `}
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    <div className={`${isSub ? 'text-3xl' : 'text-4xl'} mb-1.5 group-hover:scale-120 group-hover:rotate-6 transition-all duration-300`}>
                      {item.icon}
                    </div>
                    
                    <div className="text-white font-black text-xs md:text-sm text-center px-2.5 leading-tight">
                      {item.title}
                    </div>

                    {!isSub && (
                      <span className="text-[9px] text-slate-400 mt-1.5 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full font-bold">
                        {item.items.length} خيارات
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        {/* ========================================================= */}
        {/* عرض الموبايل: كروت زجاجية شفافة محاطة ببوردر رفيع ملون */}
        {/* ========================================================= */}
        <div className="md:hidden space-y-4 max-w-lg mx-auto">
          {currentCategory && (
            <button
              onClick={() => setSelectedCategoryId(null)}
              className="w-full bg-slate-900/70 backdrop-blur-md text-amber-300 p-3 rounded-2xl font-black text-xs shadow border border-amber-400/50 flex items-center justify-center gap-2 mb-2"
            >
              <span>↺</span>
              <span>العودة للأقسام الرئيسية الستة</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((item: any) => {
              const isSub = Boolean(currentCategory)

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!isSub) setSelectedCategoryId(item.id)
                    else router.push(item.href)
                  }}
                  className={`
                    bg-slate-900/60 backdrop-blur-xl
                    border-[1.5px] ${item.borderColor}
                    ${item.glowColor}
                    p-5 
                    rounded-2xl 
                    shadow-lg shadow-black/30
                    active:scale-95 
                    hover:bg-slate-800/80
                    transition-all
                    text-right
                    relative
                    overflow-hidden
                    flex flex-col justify-between
                    min-h-[110px]
                  `}
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div>
                    <div className="text-white font-black text-sm leading-snug">{item.title}</div>
                    {!isSub && (
                      <div className="text-[10px] text-slate-400 font-bold mt-1">
                        ({item.items.length}) خيارات
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </main>

    </div>
  )
}