import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { authOptions } from "@/auth";
import NotificationBell from "./NotificationBell";
import { 
  HomeIcon, 
  UsersIcon, 
  UserGroupIcon, 
  ArchiveBoxIcon, 
  ChartBarIcon, 
  ShoppingCartIcon, 
  BanknotesIcon, 
  BuildingStorefrontIcon, 
  DocumentPlusIcon,
  TagIcon,
  ScaleIcon,
  DocumentDuplicateIcon,
  CreditCardIcon,
  BuildingOffice2Icon,
  ChartPieIcon
} from '@heroicons/react/24/outline';

const prisma = new PrismaClient();

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.image) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string },
  });

  if (!user) {
    redirect("/");
  }

  // حماية مشددة: مسموح فقط للمدير وصاحب العمل والمحاسب
  const allowedRoles = ["ADMIN", "OWNER", "ACCOUNTANT"];
  if (!allowedRoles.includes(user.role)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans" dir="rtl">
      <nav className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50 backdrop-blur-md bg-slate-900/95 border-b border-slate-800">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          <div className="text-xl font-bold flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
                <span className="block leading-none">لوحة التحكم المحاسبية</span>
                <span className="text-[10px] font-normal text-slate-400">
                  مرحباً بك، {user.name} | الصلاحية: {user.role === 'ADMIN' ? 'مدير عام' : user.role === 'OWNER' ? 'صاحب الشركة' : 'محاسب عام'}
                </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 text-sm font-bold items-center bg-slate-800/50 p-1.5 rounded-2xl">
            <Link href="/admin" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <HomeIcon className="w-5 h-5" /> <span className="hidden lg:inline">الرئيسية</span>
            </Link>
            
            {/* القوائم المالية والأرباح (جديد) */}
            <Link href="/admin/reports/financial" className="px-3 py-2 rounded-xl bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 border border-emerald-500/40">
              <ChartPieIcon className="w-5 h-5" /> <span className="hidden lg:inline">القوائم المالية</span>
            </Link>

            {/* فاتورة المشتريات */}
            <Link href="/admin/purchases/new" className="px-3 py-2 rounded-xl bg-purple-600/30 text-purple-300 hover:bg-purple-600 hover:text-white transition-colors flex items-center gap-2 border border-purple-500/40">
              <DocumentPlusIcon className="w-5 h-5" /> <span className="hidden lg:inline">فاتورة مشتريات</span>
            </Link>

            {/* الأوراق المالية والشيكات */}
            <Link href="/admin/financial-papers" className="px-3 py-2 rounded-xl bg-teal-600/20 text-teal-300 hover:bg-teal-600 hover:text-white transition-colors flex items-center gap-2 border border-teal-500/30">
              <DocumentDuplicateIcon className="w-5 h-5" /> <span className="hidden lg:inline">الشيكات</span>
            </Link>

            {/* الدائنون والمدينون والقروض */}
            <Link href="/admin/debtors-creditors" className="px-3 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-2 border border-indigo-500/30">
              <CreditCardIcon className="w-5 h-5" /> <span className="hidden lg:inline">الدائنون والمدينون</span>
            </Link>

            {/* الأصول الثابتة */}
            <Link href="/admin/assets" className="px-3 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 border border-emerald-500/30">
              <BuildingOffice2Icon className="w-5 h-5" /> <span className="hidden lg:inline">الأصول الثابتة</span>
            </Link>

            {/* إدارة الجرد */}
            <Link href="/admin/inventory-audits" className="px-3 py-2 rounded-xl bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600 hover:text-white transition-colors flex items-center gap-2 border border-cyan-500/30">
              <ScaleIcon className="w-5 h-5" /> <span className="hidden lg:inline">إدارة الجرد</span>
            </Link>

            {/* إدارة العروض */}
            <Link href="/admin/offers" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <TagIcon className="w-5 h-5" /> <span className="hidden lg:inline">العروض</span>
            </Link>

            {/* تقرير البازار */}
            <Link href="/admin/reports/bazaar" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <span>🎪</span> <span className="hidden lg:inline">البازار</span>
            </Link>

            <Link href="/admin/vendors" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <BuildingStorefrontIcon className="w-5 h-5" /> <span className="hidden lg:inline">الموردين</span>
            </Link>
            
            <Link href="/admin/customers" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5" /> <span className="hidden lg:inline">العملاء</span>
            </Link>
            
            <Link href="/admin/products" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <ArchiveBoxIcon className="w-5 h-5" /> <span className="hidden lg:inline">الأصناف</span>
            </Link>
            
            <Link href="/admin/reports" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5" /> <span className="hidden lg:inline">التقارير</span>
            </Link>

            {user.role !== 'EMPLOYEE' && (
              <Link href="/admin/cash-management" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
                <BanknotesIcon className="w-5 h-5" /> <span className="hidden lg:inline">الخزينة</span>
              </Link>
            )}

            <div className="w-px h-6 bg-slate-700 mx-1"></div>

            <NotificationBell isDark={true} />

            <Link href="/" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95">
              <ShoppingCartIcon className="w-5 h-5" />
              <span>تطبيق البيع</span>
            </Link>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto p-4 pb-20 animate-in fade-in duration-500">
        {children}
      </main>
    </div>
  );
}