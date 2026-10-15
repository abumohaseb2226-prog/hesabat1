'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import NotificationBell from './NotificationBell'

export default function AdminDashboard() {
  const router = useRouter()
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const menuItems = [
    { id: 'orders', title: 'الأوردرات', icon: '🛒', color: 'from-blue-500 to-blue-700', href: '/orders/new' },
    { id: 'purchases', title: 'فاتورة مشتريات', icon: '📥', color: 'from-violet-600 to-purple-800', href: '/admin/purchases/new' },
    { id: 'financial-papers', title: 'الأوراق المالية والشيكات', icon: '📑', color: 'from-teal-600 to-emerald-800', href: '/admin/financial-papers' },
    { id: 'offers', title: 'إدارة العروض', icon: '🏷️', color: 'from-pink-500 to-rose-600', href: '/admin/offers' },
    { id: 'audits', title: 'إدارة الجرد', icon: '⚖️', color: 'from-cyan-500 to-blue-700', href: '/admin/inventory-audits' },
    { id: 'cash', title: 'النقدية', icon: '💰', color: 'from-green-500 to-green-700', href: '/payments/new' },
    { id: 'inventory', title: 'المخزون', icon: '📦', color: 'from-purple-500 to-purple-700', href: '/admin/products' },
    { id: 'customers', title: 'العملاء', icon: '👥', color: 'from-orange-500 to-orange-700', href: '/admin/customers' },
    { id: 'vendors', title: 'الموردين', icon: '🏪', color: 'from-amber-500 to-amber-700', href: '/admin/vendors' },
    { id: 'reports', title: 'التقارير', icon: '📊', color: 'from-teal-500 to-emerald-700', href: '/admin/reports' },
    { id: 'returns', title: 'المرتجعات', icon: '↩️', color: 'from-red-500 to-red-700', href: '/admin/returns' },
    { id: 'users', title: 'الموظفين', icon: '👔', color: 'from-indigo-500 to-indigo-700', href: '/admin/users' },
    { id: 'settings', title: 'الإعدادات', icon: '⚙️', color: 'from-gray-500 to-gray-700', href: '/admin/settings' },
  ]

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 w-full" dir="rtl">
      <header className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="text-white hover:text-blue-400 transition">
              ← خروج
            </button>
            <div className="bg-blue-600 px-4 py-2 rounded-lg font-bold text-white">
              لوحة التحكم
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell isDark={true} />
            <div className="text-left">
              <div className="text-white font-bold">{session?.user?.name || 'مدير النظام'}</div>
              <div className="text-xs text-gray-400">{session?.user?.email || 'ADMIN'}</div>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              {session?.user?.name?.[0] || 'A'}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 md:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
            لوحة التحكم الرئيسية
          </h1>
          <p className="text-gray-400 text-lg">
            نظام إدارة المبيعات المركزي - RoyalKids
          </p>
        </div>

        <div className="hidden md:block relative mx-auto" style={{ height: '750px', maxWidth: '900px' }}>
          <div 
            className="absolute top-1/2 left-1/2 z-10"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div className="w-40 h-40 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-slate-700 animate-pulse-glow">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">modoo</div>
                <div className="text-sm text-gray-200">v2.0</div>
              </div>
            </div>
          </div>

          {menuItems.map((item, index) => {
            const angle = (index * (360 / menuItems.length)) * (Math.PI / 180)
            const radius = 320
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius

            return (
              <div
                key={item.id}
                className="absolute top-1/2 left-1/2"
                style={{ 
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` 
                }}
              >
                <button
                  onClick={() => router.push(item.href)}
                  className="group block"
                >
                  <div
                    className={`
                      w-36 h-36 
                      bg-gradient-to-br ${item.color}
                      rounded-full 
                      flex flex-col items-center justify-center 
                      shadow-xl 
                      hover:scale-125 
                      hover:shadow-2xl 
                      transition-all 
                      duration-300
                      border-4 border-slate-800
                      animate-float
                      relative
                    `}
                    style={{ animationDelay: `${index * 0.3}s` }}
                  >
                    <div className="text-5xl mb-2 group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">
                      {item.icon}
                    </div>
                    <div className="text-white font-bold text-sm text-center px-3">
                      {item.title}
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        <div className="md:hidden grid grid-cols-2 gap-4 max-w-2xl mx-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={`
                bg-gradient-to-br ${item.color}
                p-6 
                rounded-2xl 
                shadow-lg 
                active:scale-95 
                transition-all
                text-right
                relative
                overflow-hidden
              `}
            >
              <div className="flex items-center gap-3">
                <div className="text-4xl">{item.icon}</div>
                <div className="flex-1">
                  <div className="text-white font-bold text-base">{item.title}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}