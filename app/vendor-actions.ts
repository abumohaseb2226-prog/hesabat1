'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

// ========================================
// 1. جلب كل الموردين
// ========================================
export async function getVendors() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return vendors
  } catch (error) {
    console.error('Error fetching vendors:', error)
    return []
  }
}

// ========================================
// 2. جلب مورد واحد
// ========================================
export async function getVendorById(vendorId: string) {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        products: {
          select: {
            id: true,
            modelNo: true,
            color: true,
            currentStock: true,
            price: true,
          },
        },
        transactions: {
          include: {
            product: true,
            user: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    return vendor
  } catch (error) {
    console.error('Error fetching vendor:', error)
    return null
  }
}

// ========================================
// 3. إضافة مورد جديد
// ========================================
export async function addVendor(data: {
  name: string
  phone?: string
  phone2?: string
  code?: string
  address?: string
  notes?: string
}) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) {
      return { success: false, error: 'غير مصرح' }
    }

    let code = data.code
    if (!code) {
      const lastVendor = await prisma.vendor.findFirst({
        orderBy: { createdAt: 'desc' },
      })
      const lastNumber = lastVendor?.code ? parseInt(lastVendor.code.replace('V', '')) : 0
      code = `V${String(lastNumber + 1).padStart(4, '0')}`
    }

    const vendor = await prisma.vendor.create({
      data: {
        name: data.name,
        code,
        phone: data.phone,
        phone2: data.phone2,
        address: data.address,
        notes: data.notes,
      },
    })

    return { success: true, vendor }
  } catch (error: any) {
    console.error('Error adding vendor:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 4. تحديث مورد
// ========================================
export async function updateVendor(vendorId: string, data: any) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) {
      return { success: false, error: 'غير مصرح' }
    }

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data,
    })

    return { success: true, vendor }
  } catch (error: any) {
    console.error('Error updating vendor:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 5. حذف مورد
// ========================================
export async function deleteVendor(vendorId: string) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.image) {
      return { success: false, error: 'غير مصرح' }
    }

    const productsCount = await prisma.product.count({
      where: { vendorId },
    })

    if (productsCount > 0) {
      return { success: false, error: 'لا يمكن حذف مورد لديه منتجات مرتبطة' }
    }

    await prisma.vendor.delete({
      where: { id: vendorId },
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting vendor:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 6. تسجيل حركة مورد (استلام بضاعة)
// ========================================
export async function recordVendorPurchase(data: {
  vendorId: string
  productId?: string
  quantity?: number
  amount: number
  description?: string
  reference?: string
}, userId: string) {
  try {
    const transaction = await prisma.vendorTransaction.create({
      data: {
        vendorId: data.vendorId,
        productId: data.productId,
        quantity: data.quantity,
        amount: data.amount,
        description: data.description,
        reference: data.reference,
        type: 'PURCHASE',
        userId,
      },
    })

    return { success: true, transaction }
  } catch (error: any) {
    console.error('Error recording purchase:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 7. حساب رصيد المورد
// ========================================
export async function getVendorBalance(vendorId: string) {
  try {
    const transactions = await prisma.vendorTransaction.findMany({
      where: { vendorId },
    })

    let credit = 0
    let debit = 0

    transactions.forEach(t => {
      if (t.type === 'PURCHASE') {
        credit += t.amount
      } else if (t.type === 'PAYMENT' || t.type === 'RETURN') {
        debit += t.amount
      }
    })

    const balance = credit - debit

    return {
      success: true,
      balance,
      credit,
      debit,
      transactionsCount: transactions.length,
    }
  } catch (error: any) {
    console.error('Error calculating balance:', error)
    return { success: false, error: error.message }
  }
}

// =========================================================================
// 8. جلب كشف حساب المورد (دفتر الأستاذ) - شامل الشيكات والمدفوعات والمخزون
// =========================================================================
export async function getVendorLedger(vendorId: string) {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    })

    if (!vendor) {
      return { success: false, error: 'المورد غير موجود' }
    }

    // 1. جلب الأصناف المربوطة بالمورد لحساب رصيد المخزون الافتتاحي
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { vendorId: vendor.id },
          { vendor: vendor.name },
        ],
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        stockQty: true,
        cost: true,
        vendor: true,
      },
    })

    let productsTotal = 0
    let totalQuantity = 0

    products.forEach(p => {
      const amount = (p.stockQty || 0) * (p.cost || 0)
      productsTotal += amount
      totalQuantity += (p.stockQty || 0)
    })

    // 2. جلب حركات المورد من جدول VendorTransaction
    const transactions = await prisma.vendorTransaction.findMany({
      where: { vendorId },
      include: {
        product: true,
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // 3. جلب الشيكات المسجلة لهذا المورد من جدول Check مباشرة
    const checks = await prisma.check.findMany({
      where: { vendorId },
      include: {
        user: true,
        collectedBank: true,
        collectedSafe: true,
      },
      orderBy: { issueDate: 'asc' },
    })

    // 4. جلب سندات الدفع النقدية الصادرة للمورد من الخزنة
    const payments = await prisma.payment.findMany({
      where: { 
        vendorId,
        type: 'OUT',
      },
      include: {
        safe: true,
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const ledger: any[] = []

    // أ. إضافة سطر رصيد المخزون الافتتاحي
    if (productsTotal > 0) {
      ledger.push({
        id: 'initial-products-stock',
        type: 'PURCHASE',
        date: new Date('2020-01-01'),
        reference: `مشتريات أصناف`,
        description: `إجمالي قيمة رصيد المخزون الافتتاحي (${products.length} صنف، ${totalQuantity} قطعة)`,
        debit: 0,
        credit: productsTotal,
        quantity: totalQuantity,
        user: 'النظام',
        isFromProducts: true,
      })
    }

    // ب. تجميع حركات الفواتير والمدفوعات من VendorTransaction
    const groupedByReference = new Map<string, any>()

    transactions.forEach(t => {
      const refKey = t.reference ? `${t.type}_${t.reference}` : `single_${t.id}`

      if (groupedByReference.has(refKey)) {
        const existing = groupedByReference.get(refKey)
        existing.amount += t.amount
        existing.quantity = (existing.quantity || 0) + (t.quantity || 0)
      } else {
        groupedByReference.set(refKey, {
          id: t.id,
          type: t.type,
          date: t.createdAt,
          reference: t.reference || (t.type === 'PURCHASE' ? 'فاتورة شراء' : 'حركة مورد'),
          description: t.description || (t.type === 'PURCHASE' ? 'فاتورة مشتريات' : 'حركة مورد'),
          amount: t.amount,
          quantity: t.quantity || null,
          user: t.user?.name || 'غير معروف',
        })
      }
    })

    groupedByReference.forEach(t => {
      if (t.type === 'PURCHASE') {
        ledger.push({
          id: t.id,
          type: 'PURCHASE',
          date: t.date,
          reference: t.reference,
          description: t.description,
          debit: 0,
          credit: t.amount,
          quantity: t.quantity,
          user: t.user,
          isFromProducts: false,
        })
      } else if (t.type === 'RETURN') {
        ledger.push({
          id: t.id,
          type: 'RETURN',
          date: t.date,
          reference: t.reference,
          description: t.description,
          debit: t.amount,
          credit: 0,
          quantity: t.quantity,
          user: t.user,
          isFromProducts: false,
        })
      } else if (t.type === 'PAYMENT' || t.type.includes('CHECK')) {
        // ✅ إضافة الشيكات والمدفوعات المسجلة في VendorTransaction
        ledger.push({
          id: t.id,
          type: 'PAYMENT',
          date: t.date,
          reference: t.reference,
          description: t.description,
          debit: t.amount,
          credit: 0,
          quantity: null,
          user: t.user,
          safe: null,
          isFromProducts: false,
        })
      }
    })

    // ج. التأكد من إدراج أي شيك من جدول Check لم يدرج مسبقاً
    const existingReferences = new Set(ledger.map(l => l.reference))

    checks.forEach(chk => {
      const checkRefText = `شيك #${chk.checkNo}`
      if (!existingReferences.has(checkRefText) && !existingReferences.has(chk.checkNo)) {
        const isPayable = chk.type === 'PAYABLE'
        const statusArabic = chk.status === 'COLLECTED' 
          ? 'تم التحصيل بالبنك' 
          : chk.status === 'BOUNCED' 
          ? 'مرتد ومرفوض' 
          : 'تحت الصرف بالمحفظة'

        ledger.push({
          id: chk.id,
          type: 'PAYMENT',
          date: chk.issueDate,
          reference: checkRefText,
          description: `${isPayable ? 'إصدار شيك دفع' : 'شيك قبض'} #${chk.checkNo} مسحوب على بنك ${chk.drawnBank} (استحقاق: ${new Date(chk.dueDate).toLocaleDateString('ar-EG')}) [${statusArabic}]`,
          debit: isPayable ? chk.amount : 0,
          credit: isPayable ? 0 : chk.amount,
          quantity: null,
          user: chk.user?.name || 'غير معروف',
          safe: chk.collectedBank ? chk.collectedBank.bankName : (chk.collectedSafe?.name || 'شيك بنكي'),
          isFromProducts: false,
          isCheck: true,
          checkStatus: chk.status
        })
      }
    })

    // د. إضافة سندات الدفع النقدية مع منع التكرار
    payments.forEach(p => {
      if (p.checkRefId || (p.description && p.description.includes('شيك #'))) {
        return // تم حسابه مسبقاً من حركة الشيك
      }
      ledger.push({
        id: p.id,
        type: 'PAYMENT',
        date: p.createdAt,
        reference: `سند دفع #${p.receiptNo}`,
        description: p.description || 'دفع للمورد',
        debit: p.amount,
        credit: 0,
        quantity: null,
        user: p.user?.name || 'غير معروف',
        safe: p.safe?.name || 'غير محدد',
        isFromProducts: false,
      })
    })

    // ترتيب السطور تاريخياً
    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // حساب الرصيد التراكمي
    let runningBalance = 0
    const ledgerWithBalance = ledger.map(t => {
      runningBalance += (Number(t.credit || 0) - Number(t.debit || 0))
      return { ...t, balance: runningBalance }
    })

    // المجاميع الدقيقة
    const totalPurchasesFromProducts = productsTotal
    const totalPurchasesFromInvoices = ledger
      .filter(t => t.type === 'PURCHASE' && !t.isFromProducts)
      .reduce((sum, t) => sum + (Number(t.credit) || 0), 0)

    const totalPurchases = totalPurchasesFromProducts + totalPurchasesFromInvoices
    const totalReturns = ledger.filter(t => t.type === 'RETURN').reduce((sum, t) => sum + (Number(t.debit) || 0), 0)
    
    // إجمالي المدفوعات (تشمل الشيكات الصادرة وسندات الصرف النقدية)
    const totalPayments = ledger.filter(t => t.type === 'PAYMENT').reduce((sum, t) => sum + (Number(t.debit) || 0), 0)

    const summary = {
      totalPurchasesFromProducts,
      totalPurchasesFromInvoices,
      totalPurchases,
      totalReturns,
      totalPayments,
      currentBalance: runningBalance,
      productsCount: products.length,
    }

    return {
      success: true,
      data: {
        vendor,
        ledger: JSON.parse(JSON.stringify(ledgerWithBalance)),
        summary,
        products: JSON.parse(JSON.stringify(products)),
      },
    }
  } catch (error: any) {
    console.error('Error in getVendorLedger:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 9. البحث عن الموردين
// ========================================
export async function searchVendors(query: string) {
  try {
    const vendors = await prisma.vendor.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    })
    return vendors
  } catch (error) {
    console.error('Error searching vendors:', error)
    return []
  }
}

// ========================================
// 10. حساب إجمالي مشتريات المورد من المنتجات
// ========================================
export async function getVendorPurchasesFromProducts(vendorId: string) {
  try {
    const products = await prisma.product.findMany({
      where: { vendorId },
      select: {
        id: true,
        modelNo: true,
        color: true,
        stockQty: true,
        cost: true,
      },
    })

    let totalAmount = 0
    const productsList = products.map(p => {
      const amount = p.stockQty * p.cost
      totalAmount += amount
      return {
        id: p.id,
        modelNo: p.modelNo,
        color: p.color,
        quantity: p.stockQty,
        cost: p.cost,
        total: amount,
      }
    })

    return {
      success: true,
      data: {
        products: productsList,
        totalAmount,
        productsCount: products.length,
      },
    }
  } catch (error: any) {
    console.error('Error in getVendorPurchasesFromProducts:', error)
    return { success: false, error: error.message }
  }
}

// ========================================
// 11. تسجيل فاتورة شراء للمورد (يدوي)
// ========================================
export async function recordVendorInvoice(data: {
  vendorId: string
  invoiceNo: string
  amount: number
  date?: string
  notes?: string
}, userId: string) {
  try {
    const transaction = await prisma.vendorTransaction.create({
      data: {
        vendorId: data.vendorId,
        amount: data.amount,
        description: data.notes || `فاتورة شراء رقم ${data.invoiceNo}`,
        reference: data.invoiceNo,
        type: 'PURCHASE',
        userId,
        createdAt: data.date ? new Date(data.date) : new Date(),
      },
    })

    return { success: true, transaction }
  } catch (error: any) {
    console.error('Error recording invoice:', error)
    return { success: false, error: error.message }
  }
}