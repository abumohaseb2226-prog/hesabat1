'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { syncPaymentToHrApp, testHrConnection } from '@/lib/hr-sync';
import { createTestOrder as _createTestOrder, deleteTestOrders as _deleteTestOrders } from './test';
import { deleteOrder as _deleteOrder } from '@/app/bazaar-actions';

// =========================================================================
// 1. دوال الأوردرات التجريبية وحذف الأوردرات (دوال async صريحة لحل خطأ Next.js)
// =========================================================================

export async function createTestOrder(userId: string) {
  return await _createTestOrder(userId);
}

export async function deleteTestOrders() {
  return await _deleteTestOrders();
}

export async function deleteOrder(orderId: string) {
  return await _deleteOrder(orderId);
}

// =========================================================================
// 2. فحص الاتصال وترحيل صرف الراتب / السلفة لتطبيق الحضور والانصراف
// =========================================================================

export async function checkHrConnection() {
  return await testHrConnection();
}

export async function createEmployeePayment(
  data: {
    employeeId: string;
    amount: number;
    description: string;
    safeId: string;
    transactionDate: Date;
  },
  userId: string
) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      return { success: false, error: 'الموظف غير موجود في النظام' };
    }

    const safe = await prisma.safe.findUnique({
      where: { id: data.safeId },
    });

    const parsedDate = new Date(data.transactionDate);
    const amountVal = Math.abs(Number(data.amount) || 0);

    if (amountVal <= 0) {
      return { success: false, error: 'المبلغ يجب أن يكون أكبر من الصفر' };
    }

    // أ. تسجيل الحركة محلياً في مبيعات المعرض (خصم من الخزنة وحساب الموظف)
    await prisma.$transaction(async (tx) => {
      await tx.employeeTransaction.create({
        data: {
          employeeId: data.employeeId,
          amount: -amountVal,
          description: data.description,
          safeId: data.safeId,
          createdById: userId,
          transactionDate: parsedDate,
        },
      });

      await tx.payment.create({
        data: {
          type: 'OUT',
          amount: amountVal,
          currency: 'EGP',
          safeId: data.safeId,
          userId: userId,
          description: `صرف لموظف: ${employee.name} - ${data.description}`,
          createdAt: parsedDate,
        },
      });
    });

    // ب. ترحيل فوري ومباشر إلى قاعدة بيانات تطبيق الحضور والانصراف (CashTransaction)
    let hrSyncMessage = '';
    try {
      const hrSync = await syncPaymentToHrApp({
        employeeName: employee.name,
        amount: amountVal,
        description: data.description,
        safeName: safe?.name || 'خزنة المعرض',
        date: parsedDate,
      });

      if (hrSync.success) {
        hrSyncMessage = `\n\n🔗 تم ترحيل الحركة بنجاح إلى تطبيق الحضور (رقم الحركة #${hrSync.hrTransactionId} للموظف: ${hrSync.matchedEmployee})`;
      } else {
        hrSyncMessage = `\n\n⚠️ تم الصرف محلياً ولكن تعذر الترحيل لتطبيق الحضور: ${hrSync.error}`;
      }
    } catch (hrErr: any) {
      console.error('Error calling syncPaymentToHrApp:', hrErr);
      hrSyncMessage = `\n\n⚠️ تم الصرف محلياً ولكن فشل الترحيل لتطبيق الحضور: ${hrErr.message}`;
    }

    revalidatePath('/admin/cash-management');
    revalidatePath('/admin/employees');
    revalidatePath(`/admin/employees/${employee.id}/ledger`);
    revalidatePath('/payments/new');
    revalidatePath('/admin/reports');

    return {
      success: true,
      message: `تم بنجاح صرف مبلغ ${amountVal.toLocaleString()} ج.م للموظف (${employee.name}) من خزنة (${safe?.name || ''})${hrSyncMessage}`,
    };
  } catch (error: any) {
    console.error('Error in createEmployeePayment:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء صرف المبلغ' };
  }
}

// =========================================================================
// 3. إدارة الموظفين والرواتب المستحقة (Employee Actions)
// =========================================================================

export async function getEmployees() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { transactions: true } },
      },
    });
    return { success: true, data: JSON.parse(JSON.stringify(employees)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addEmployee(data: { name: string; phone?: string; defaultSalary?: number }) {
  try {
    const emp = await prisma.employee.create({
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        defaultSalary: Number(data.defaultSalary) || 0,
      },
    });
    revalidatePath('/admin/employees');
    return { success: true, data: JSON.parse(JSON.stringify(emp)) };
  } catch (error: any) {
    return { success: false, error: error.message || 'اسم الموظف مسجل مسبقاً' };
  }
}

export async function updateEmployee(id: string, data: { name: string; phone?: string; defaultSalary?: number }) {
  try {
    const emp = await prisma.employee.update({
      where: { id },
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        defaultSalary: Number(data.defaultSalary) || 0,
      },
    });
    revalidatePath('/admin/employees');
    return { success: true, data: JSON.parse(JSON.stringify(emp)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createSalaryCredit(data: { employeeId: string; amount: number; description: string; transactionDate: Date }, userId: string) {
  try {
    const trans = await prisma.employeeTransaction.create({
      data: {
        employeeId: data.employeeId,
        amount: Math.abs(Number(data.amount) || 0),
        description: data.description,
        createdById: userId,
        transactionDate: new Date(data.transactionDate),
      },
    });
    revalidatePath('/admin/employees');
    revalidatePath(`/admin/employees/${data.employeeId}/ledger`);
    return { success: true, data: JSON.parse(JSON.stringify(trans)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getEmployeeLedger(employeeId: string) {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { success: false, error: 'الموظف غير موجود' };

    const transactions = await prisma.employeeTransaction.findMany({
      where: { employeeId },
      include: {
        safe: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { transactionDate: 'asc' },
    });

    let runningBalance = 0;
    let totalCredit = 0;
    let totalDebit = 0;

    const ledger = transactions.map((t) => {
      if (t.amount > 0) totalCredit += t.amount;
      else totalDebit += t.amount;
      runningBalance += t.amount;

      return {
        id: t.id,
        amount: t.amount,
        description: t.description,
        transactionDate: t.transactionDate.toISOString(),
        balance: runningBalance,
        safe: t.safe,
        createdBy: t.createdBy,
      };
    });

    return {
      success: true,
      data: {
        employee: JSON.parse(JSON.stringify(employee)),
        transactions: JSON.parse(JSON.stringify(ledger.reverse())),
        summary: {
          totalCredit,
          totalDebit: Math.abs(totalDebit),
          currentBalance: runningBalance,
        },
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// =========================================================================
// 4. دوال الخزائن والعملاء
// =========================================================================

export async function getSafes() {
  const safes = await prisma.safe.findMany({ orderBy: { name: 'asc' } });
  return JSON.parse(JSON.stringify(safes));
}

export async function getCustomers() {
  const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' }, take: 200 });
  return JSON.parse(JSON.stringify(customers));
}

export async function searchCustomers(term: string) {
  if (!term || term.trim().length === 0) return [];
  const q = term.trim();
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { phone2: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
  });
  return JSON.parse(JSON.stringify(customers));
}

export async function checkCustomerPhone(phone: string) {
  if (!phone || phone.trim() === '') return { exists: false };
  const customer = await prisma.customer.findFirst({
    where: { OR: [{ phone: phone.trim() }, { phone2: phone.trim() }] },
    select: { name: true },
  });
  if (customer) return { exists: true, name: customer.name };
  return { exists: false };
}

export async function createPayment(data: any, userId: string) {
  try {
    const payment = await prisma.payment.create({
      data: {
        type: data.type,
        amount: Number(data.amount),
        currency: data.currency || 'EGP',
        safeId: data.safeId || null,
        targetSafeId: data.targetSafeId || null,
        customerId: data.customerId || null,
        vendorId: data.vendorId || null,
        userId: userId,
        description: data.description,
        createdAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      },
    });
    revalidatePath('/admin/cash-management');
    revalidatePath('/admin/reports');
    return { success: true, payment: JSON.parse(JSON.stringify(payment)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// =========================================================================
// 5. دوال الأوردرات والأصناف والإعدادات المستخدمة في باقي الشاشات
// =========================================================================

export async function searchProducts(term: string) {
  if (!term || term.trim().length === 0) return [];
  const q = term.trim();
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { modelNo: { contains: q, mode: 'insensitive' } },
        { color: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 30,
    orderBy: { modelNo: 'asc' },
  });
  return JSON.parse(JSON.stringify(products));
}

export async function getProductsForSearch() {
  const products = await prisma.product.findMany({
    select: { id: true, modelNo: true, color: true, price: true, currentStock: true },
    take: 5000,
  });
  return JSON.parse(JSON.stringify(products));
}

export async function getOrderById(id: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        safe: true,
        items: { include: { product: true } },
      },
    });
    return order ? JSON.parse(JSON.stringify(order)) : null;
  } catch (error) {
    return null;
  }
}

export async function updateOrder(id: string, data: any) {
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return { success: false, error: 'الأوردر غير موجود' };

    await prisma.$transaction(async (tx) => {
      for (const oldItem of order.items) {
        await tx.product.update({
          where: { id: oldItem.productId },
          data: { currentStock: { increment: oldItem.quantity } },
        });
      }

      await tx.orderItem.deleteMany({ where: { orderId: id } });

      for (const item of data.items) {
        for (const v of item.variants || [item]) {
          const qty = Number(v.quantity) || 0;
          await tx.orderItem.create({
            data: {
              orderId: id,
              productId: v.productId,
              quantity: qty,
              price: Number(v.price) || 0,
              discountPercent: Number(v.discountPercent) || 0,
            },
          });

          await tx.product.update({
            where: { id: v.productId },
            data: { currentStock: { decrement: qty } },
          });
        }
      }

      await tx.order.update({
        where: { id },
        data: {
          customerId: data.customerId,
          totalAmount: Number(data.total) || 0,
          deposit: Number(data.deposit) || 0,
          notes: data.notes || '',
        },
      });
    });

    revalidatePath('/orders/list');
    revalidatePath(`/orders/${id}/edit`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تحديث الأوردر' };
  }
}

export async function getUserOrders(userId: string) {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        user: true,
        safe: true,
        items: { include: { product: true } },
      },
      take: 500,
    });
    return { orders: JSON.parse(JSON.stringify(orders)) };
  } catch (error) {
    return { orders: [] };
  }
}

export async function getSettings() {
  let settings = await prisma.settings.findFirst();
  if (!settings) {
    settings = await prisma.settings.create({
      data: { siteName: 'RoyalKids', invoiceNotes: 'شكراً لتعاملكم معنا' },
    });
  }
  return JSON.parse(JSON.stringify(settings));
}

export async function updateSettings(data: { siteName?: string; invoiceNotes?: string; header?: string; footer?: string }) {
  try {
    const existing = await prisma.settings.findFirst();
    if (existing) {
      await prisma.settings.update({ where: { id: existing.id }, data });
    } else {
      await prisma.settings.create({ data });
    }
    revalidatePath('/admin/settings');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function registerEmployee(data: { name: string; code: string; password: string }) {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await prisma.user.create({
      data: { name: data.name, code: data.code, password: hashedPassword, role: 'EMPLOYEE' },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'الكود مستخدم من قبل' };
  }
}

export async function getCustomerLedger(customerId: string) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: { include: { items: { include: { product: true } } }, orderBy: { createdAt: 'asc' } },
        payments: { include: { safe: true, user: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!customer) return { success: false, error: 'العميل غير موجود' };

    const returns = await prisma.returnOrder.findMany({
      where: { originalOrder: { customerId: customer.id }, status: { not: 'CANCELLED' } },
      include: { items: { include: { product: true } } },
      orderBy: { date: 'asc' },
    });

    const transactions: any[] = [];

    customer.orders.forEach((o) => {
      transactions.push({
        date: o.createdAt,
        type: 'ORDER',
        orderId: o.id,
        reference: `أوردر #${o.orderNo}`,
        description: `فاتورة مبيعات (${o.items.length} صنف)`,
        debit: o.totalAmount,
        credit: 0,
        user: 'كاشير',
      });
    });

    returns.forEach((r) => {
      transactions.push({
        date: r.date,
        type: 'RETURN',
        returnId: r.id,
        reference: `مرتجع #${r.returnNo}`,
        description: `مرتجع مبيعات (${r.items.length} صنف)`,
        debit: 0,
        credit: r.totalRefund,
        user: 'المرتجعات',
      });
    });

    customer.payments.forEach((p) => {
      const isIncome = p.type === 'IN' || p.type === 'PAYMENT_COLLECTION';
      transactions.push({
        date: p.createdAt,
        type: 'PAYMENT',
        reference: `إيصال #${p.receiptNo}`,
        description: p.description || 'تحصيل نقدي',
        debit: isIncome ? 0 : p.amount,
        credit: isIncome ? p.amount : 0,
        safe: p.safe?.name,
        user: p.user?.name || 'النظام',
      });
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const ledger = transactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    const totalOrdersAmount = customer.orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalReturnsAmount = returns.reduce((s, r) => s + r.totalRefund, 0);
    const totalPaymentsIn = customer.payments.filter((p) => p.type === 'IN' || p.type === 'PAYMENT_COLLECTION').reduce((s, p) => s + p.amount, 0);

    return {
      success: true,
      data: {
        customer: JSON.parse(JSON.stringify(customer)),
        transactions: JSON.parse(JSON.stringify(ledger)),
        summary: {
          totalOrders: customer.orders.length,
          totalOrdersAmount,
          totalReturns: returns.length,
          totalReturnsAmount,
          totalPaymentsIn,
          currentBalance: runningBalance,
        },
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSummaryByDateRange(startStr: string, endStr: string) {
  try {
    const startDate = new Date(startStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endStr);
    endDate.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { customer: true, items: { include: { product: true } } },
    });

    const returns = await prisma.returnOrder.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
      include: { originalOrder: { include: { customer: true } } },
    });

    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { safe: true },
    });

    const ordersTotal = orders.reduce((s, o) => s + o.totalAmount, 0);
    const returnsTotal = returns.reduce((s, r) => s + r.totalRefund, 0);

    const byCustomer: any = {};
    orders.forEach((o) => {
      const cName = o.customer.name;
      if (!byCustomer[cName]) byCustomer[cName] = { total: 0, orders: [] };
      byCustomer[cName].total += o.totalAmount;
      byCustomer[cName].orders.push({ id: o.id, orderNo: o.orderNo, total: o.totalAmount, time: o.createdAt.toISOString() });
    });

    const returnsByCustomer: any = {};
    returns.forEach((r) => {
      const cName = r.originalOrder.customer.name;
      if (!returnsByCustomer[cName]) returnsByCustomer[cName] = { totalValue: 0, returns: [] };
      returnsByCustomer[cName].totalValue += r.totalRefund;
      returnsByCustomer[cName].returns.push({ id: r.id, returnNo: r.returnNo, value: r.totalRefund, time: r.date.toISOString() });
    });

    const bySafe: any = {};
    payments.forEach((p) => {
      const sName = p.safe?.name || 'غير محدد';
      if (!bySafe[sName]) bySafe[sName] = { in: 0, collection: 0, out: 0, refund: 0 };
      if (p.type === 'IN') bySafe[sName].in += p.amount;
      else if (p.type === 'PAYMENT_COLLECTION') bySafe[sName].collection += p.amount;
      else if (p.type === 'OUT') bySafe[sName].out += p.amount;
    });

    const totalIn = payments.filter((p) => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
    const totalCollection = payments.filter((p) => p.type === 'PAYMENT_COLLECTION').reduce((s, p) => s + p.amount, 0);
    const totalOut = payments.filter((p) => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);

    return {
      success: true,
      data: {
        dateRange: { start: startStr, end: endStr },
        orders: { count: orders.length, total: ordersTotal, byCustomer },
        returns: { count: returns.length, totalValue: returnsTotal, byCustomer: returnsByCustomer },
        payments: { totalIn, totalCollection, totalOut, net: totalIn + totalCollection - totalOut, bySafe },
        products: { totalQuantity: orders.reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.quantity, 0), 0), totalRevenue: ordersTotal - returnsTotal, byVendor: [] },
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createReturnOrder(data: any, userId: string) {
  try {
    const returnOrder = await prisma.$transaction(async (tx) => {
      const ret = await tx.returnOrder.create({
        data: {
          originalOrderId: data.originalOrderId,
          type: data.type,
          reason: data.reason,
          totalRefund: Number(data.totalRefund) || 0,
          depositRefunded: Number(data.depositRefunded) || 0,
          exchangeAmount: Number(data.exchangeAmount) || 0,
          refundMethod: data.refundMethod,
          safeId: data.safeId || null,
          notes: data.notes || '',
          userId,
          status: 'COMPLETED',
        },
      });

      for (const it of data.items || []) {
        await tx.returnItem.create({
          data: {
            returnOrderId: ret.id,
            orderItemId: it.orderItemId,
            productId: it.productId,
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            refundAmount: Number(it.refundAmount) || 0,
          },
        });

        await tx.product.update({
          where: { id: it.productId },
          data: { currentStock: { increment: Number(it.quantity) || 1 } },
        });
      }

      if (data.refundMethod === 'CASH' && data.safeId && data.totalRefund > 0) {
        await tx.payment.create({
          data: {
            type: 'OUT',
            amount: Number(data.totalRefund),
            currency: 'EGP',
            safeId: data.safeId,
            userId,
            description: `صرف نقدي لمرتجع مبيعات #${ret.returnNo}`,
          },
        });
      }

      return ret;
    });

    revalidatePath('/admin/returns');
    revalidatePath('/orders/list');
    return { success: true, data: JSON.parse(JSON.stringify(returnOrder)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getReturnOrders() {
  try {
    const returns = await prisma.returnOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        originalOrder: { include: { customer: true } },
        newOrder: true,
      },
    });
    return JSON.parse(JSON.stringify(returns));
  } catch (error) {
    return [];
  }
}

export async function getReturnById(id: string) {
  try {
    const returnOrder = await prisma.returnOrder.findUnique({
      where: { id },
      include: {
        originalOrder: { include: { customer: true, items: { include: { product: true } } } },
        newOrder: true,
        items: { include: { product: true, exchangedProduct: true } },
      },
    });
    return returnOrder ? JSON.parse(JSON.stringify(returnOrder)) : null;
  } catch (error) {
    return null;
  }
}

export async function cancelReturnOrder(returnId: string) {
  try {
    const ret = await prisma.returnOrder.findUnique({
      where: { id: returnId },
      include: { items: true },
    });

    if (!ret) return { success: false, error: 'المرتجع غير موجود' };

    await prisma.$transaction(async (tx) => {
      for (const it of ret.items) {
        await tx.product.update({
          where: { id: it.productId },
          data: { currentStock: { decrement: it.quantity } },
        });
      }

      await tx.returnOrder.update({
        where: { id: returnId },
        data: { status: 'CANCELLED' },
      });
    });

    revalidatePath('/admin/returns');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateReturnOrder(id: string, data: any) {
  try {
    await prisma.returnOrder.update({
      where: { id },
      data: { reason: data.reason, notes: data.notes },
    });
    revalidatePath('/admin/returns');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}