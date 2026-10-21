'use server'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'

// =========================================================================
// 1. جلب كل الموردين مع احتساب الرصيد الصافي الحالي لكل مورد بدقة
// =========================================================================
export async function getVendors() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        _count: {
          select: { products: true },
        },
        products: {
          select: {
            stockQty: true,
            cost: true,
          }
        },
        transactions: {
          select: {
            type: true,
            amount: true,
            reference: true
          }
        },
        payments: {
          where: { type: 'OUT' },
          select: {
            amount: true,
            checkRefId: true,
            description: true
          }
        },
        checks: {
          where: { type: 'PAYABLE', status: { not: 'CANCELLED' } },
          select: {
            amount: true,
            checkNo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    })

    // جلب المنتجات التي قد تكون مسجلة باسم المورد كنص بدون vendorId
    const allProductsWithName = await prisma.product.findMany({
      where: {
        vendorId: null,
        vendor: { not: null }
      },
      select: {
        vendor: true,
        stockQty: true,
        cost: true
      }
    })

    const unlinkedProductsByVendorName = new Map<string, number>()
    allProductsWithName.forEach(p => {
      if (p.vendor) {
        const amt = (p.stockQty || 0) * (p.cost || 0)
        unlinkedProductsByVendorName.set(
          p.vendor.trim(),
          (unlinkedProductsByVendorName.get(p.vendor.trim()) || 0) + amt
        )
      }
    })

    const vendorsWithBalance = vendors.map(vendor => {
      // 1. بضاعة المخزون الافتتاحي المربوطة بالمعرف أو بالاسم
      let initialStockTotal = vendor.products.reduce((s, p) => s + ((p.stockQty || 0) * (p.cost || 0)), 0)
      if (unlinkedProductsByVendorName.has(vendor.name.trim())) {
        initialStockTotal += unlinkedProductsByVendorName.get(vendor.name.trim())!
      }

      // 2. الفواتير والمرتجعات المسجلة
      const groupedTrans = new Map<string, { type: string, amount: number }>()
      vendor.transactions.forEach(t => {
        const refKey = t.reference ? `${t.type}_${t.reference}` : `single_${Math.random()}`
        if (groupedTrans.has(refKey)) {
          groupedTrans.get(refKey)!.amount += t.amount
        } else {
          groupedTrans.set(refKey, { type: t.type, amount: t.amount })
        }
      })

      let purchasesTotal = 0
      let returnsTotal = 0
      let transactionPayments = 0

      groupedTrans.forEach(t => {
        if (t.type === 'PURCHASE') purchasesTotal += t.amount
        else if (t.type === 'RETURN') returnsTotal += t.amount
        else if (t.type === 'PAYMENT' || t.type.includes('CHECK')) transactionPayments += t.amount
      })

      // 3. سندات الدفع النقدية مع تجنب تكرار الشيكات
      let cashPaymentsTotal = 0
      vendor.payments.forEach(p => {
        if (p.checkRefId || (p.description && p.description.includes('شيك #'))) {
          return // تم احتسابه من حركة الشيك
        }
        cashPaymentsTotal += p.amount
      })

      // 4. الشيكات الصادرة للمورد
      let additionalChecksTotal = 0
      const existingRefs = new Set(Array.from(groupedTrans.keys()))
      vendor.checks.forEach(chk => {
        const refKey = `PAYMENT_شيك #${chk.checkNo}`
        if (!existingRefs.has(refKey) && !existingRefs.has(`single_شيك #${chk.checkNo}`)) {
          additionalChecksTotal += chk.amount
        }
      })

      const totalCredits = initialStockTotal + purchasesTotal // له عندنا
      const totalDebits = returnsTotal + transactionPayments + cashPaymentsTotal + additionalChecksTotal // دفعنا له / عليه

      const balance = Math.round((totalCredits - totalDebits) * 100) / 100

      return {
        id: vendor.id,
        name: vendor.name,
        code: vendor.code,
        phone: vendor.phone,
        phone2: vendor.phone2,
        address: vendor.address,
        notes: vendor.notes,
        source: vendor.source,
        productsCount: vendor._count.products,
        balance,
        totalPurchases: totalCredits,
        totalPayments: totalDebits,
        totalReturns: returnsTotal
      }
    })

    return JSON.parse(JSON.stringify(vendorsWithBalance))
  } catch (error) {
    console.error('Error fetching vendors with balance:', error)
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
// 8. جلب كشف حساب المورد (دفتر الأستاذ)
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
        return
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

// =========================================================================
// 12. تقرير أداء الموردين (ترتيب الأكثر مبيعاً مع تحليل أصناف كل مورد)
// =========================================================================
export async function getVendorsPerformanceReport(startDateStr?: string, endDateStr?: string) {
  try {
    const dateFilter: any = {}
    if (startDateStr) dateFilter.gte = new Date(startDateStr + 'T00:00:00')
    if (endDateStr) dateFilter.lte = new Date(endDateStr + 'T23:59:59.999')

    // 1. جلب الموردين المسجلين
    const vendors = await prisma.vendor.findMany({
      select: { id: true, name: true, code: true, phone: true }
    })

    // 2. جلب بنود الأوردرات والمرتجعات مع المنتجات
    const orderItems = await prisma.orderItem.findMany({
      where: Object.keys(dateFilter).length > 0 ? {
        order: { createdAt: dateFilter }
      } : undefined,
      select: {
        quantity: true,
        price: true,
        product: {
          select: {
            id: true,
            modelNo: true,
            color: true,
            description: true,
            vendor: true,
            vendorId: true,
            currentStock: true,
            cost: true,
            price: true
          }
        },
        returnItems: {
          select: { quantity: true, refundAmount: true }
        }
      }
    })

    // خرائط لربط المبيعات بالموردين (بالـ ID أو بالاسم)
    const vendorById = new Map<string, any>()
    const vendorByName = new Map<string, any>()

    vendors.forEach(v => {
      const vData = {
        id: v.id,
        name: v.name,
        code: v.code,
        phone: v.phone,
        totalPiecesSold: 0,
        totalRevenue: 0,
        productsMap: new Map<string, any>()
      }
      vendorById.set(v.id, vData)
      vendorByName.set(v.name.trim().toLowerCase(), vData)
    })

    // حصر مبيعات كل صنف ومورده
    orderItems.forEach(oi => {
      if (!oi.product) return

      const p = oi.product
      const returnedQty = oi.returnItems.reduce((sum, ri) => sum + (ri.quantity || 0), 0)
      const returnedRefund = oi.returnItems.reduce((sum, ri) => sum + (ri.refundAmount || 0), 0)

      const netQty = (oi.quantity || 0) - returnedQty
      const netRevenue = ((oi.price || 0) * (oi.quantity || 0)) - returnedRefund

      if (netQty <= 0 && netRevenue <= 0) return

      let targetVendor: any = null
      if (p.vendorId && vendorById.has(p.vendorId)) {
        targetVendor = vendorById.get(p.vendorId)
      } else if (p.vendor && vendorByName.has(p.vendor.trim().toLowerCase())) {
        targetVendor = vendorByName.get(p.vendor.trim().toLowerCase())
      } else if (p.vendor && p.vendor.trim() !== '') {
        const cleanName = p.vendor.trim().toLowerCase()
        if (!vendorByName.has(cleanName)) {
          const newV = {
            id: `temp-${cleanName}`,
            name: p.vendor.trim(),
            code: 'NEW',
            phone: null,
            totalPiecesSold: 0,
            totalRevenue: 0,
            productsMap: new Map<string, any>()
          }
          vendorByName.set(cleanName, newV)
        }
        targetVendor = vendorByName.get(cleanName)
      }

      if (targetVendor) {
        targetVendor.totalPiecesSold += netQty
        targetVendor.totalRevenue += netRevenue

        const prodKey = p.id
        if (!targetVendor.productsMap.has(prodKey)) {
          targetVendor.productsMap.set(prodKey, {
            id: p.id,
            modelNo: p.modelNo,
            color: p.color,
            description: p.description || '',
            currentStock: p.currentStock || 0,
            price: p.price || oi.price,
            cost: p.cost || 0,
            soldQty: 0,
            revenue: 0
          })
        }

        const prodStats = targetVendor.productsMap.get(prodKey)
        prodStats.soldQty += netQty
        prodStats.revenue += netRevenue
      }
    })

    // تجميع وتجهيز التقرير النهائي
    const allUniqueVendors = Array.from(new Set([...vendorById.values(), ...vendorByName.values()]))

    const sortedVendors = allUniqueVendors
      .filter(v => v.totalPiecesSold > 0 || v.totalRevenue > 0)
      .map(v => {
        const productsList = Array.from(v.productsMap.values())
          .sort((a: any, b: any) => b.soldQty - a.soldQty || b.revenue - a.revenue)

        return {
          id: v.id,
          name: v.name,
          code: v.code,
          phone: v.phone,
          totalPiecesSold: v.totalPiecesSold,
          totalRevenue: Math.round(v.totalRevenue * 100) / 100,
          modelsCount: productsList.length,
          topProducts: productsList
        }
      })
      .sort((a, b) => b.totalPiecesSold - a.totalPiecesSold || b.totalRevenue - a.totalRevenue)

    return {
      success: true,
      data: JSON.parse(JSON.stringify(sortedVendors))
    }
  } catch (error: any) {
    console.error('Error in getVendorsPerformanceReport:', error)
    return { success: false, error: error.message || 'فشل جلب تقرير أداء الموردين' }
  }
}