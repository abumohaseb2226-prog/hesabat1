'use server'

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export async function getInventoryReport() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { modelNo: 'asc' },
      include: {
        orderItems: {
          include: { 
            order: { include: { customer: true } }
          }
        },
        returnItems: {
          include: {
            returnOrder: { include: { originalOrder: { include: { customer: true } } } }
          }
        },
        purchaseInvoiceItems: {
          include: {
            invoice: { include: { vendor: true } }
          }
        },
        vendorTransactions: {
          where: {
            quantity: { gt: 0 }
          },
          include: { vendor: true }
        },
        syncRecords: {
          include: {
            operation: {
              select: { createdAt: true }
            }
          }
        },
        inventoryAuditItems: {
          include: { audit: true }
        }
      }
    });

    const report = products.map(p => {
        const initial = p.stockQty || 0;
        const movements: any[] = [];

        // 1. حركة الرصيد الافتتاحي الأساسي
        if (initial > 0) {
          movements.push({
            date: new Date('2020-01-01'),
            type: 'رصيد افتتاحي',
            reference: 'المخزون الأولي',
            party: p.vendor || 'النظام',
            inQty: initial,
            outQty: 0,
            price: p.cost || p.price || 0
          });
        }

        // 2. حركات الوارد من مزامنة شيت جوجل (قراءة التاريخ من عملية المزامنة)
        p.syncRecords?.forEach(sr => {
          movements.push({
            date: sr.operation?.createdAt || new Date('2025-06-01'),
            type: 'وارد (جوجل شيت)',
            reference: sr.uniqueKey || 'مزامنة',
            party: 'المخزن',
            inQty: sr.quantityAdded,
            outQty: 0,
            price: p.cost || 0
          });
        });

        // 3. حركات فواتير المشتريات ومرتجعات الموردين
        const processedInvoiceRefs = new Set<string>();

        p.purchaseInvoiceItems?.forEach(pi => {
          const inv = pi.invoice;
          const isPurchase = inv.invoiceType === 'PURCHASE';
          processedInvoiceRefs.add(inv.invoiceNo);

          movements.push({
            date: inv.date || inv.createdAt,
            type: isPurchase ? 'وارد مشتريات' : 'مرتجع لمورد',
            reference: `#${inv.invoiceNo}`,
            party: inv.vendor?.name || p.vendor || 'مورد',
            inQty: isPurchase ? pi.quantity : 0,
            outQty: isPurchase ? 0 : pi.quantity,
            price: pi.cost || 0
          });
        });

        // حركات الموردين المسجلة التي لم تسجل في PurchaseInvoiceItem
        p.vendorTransactions?.forEach(vt => {
          if (vt.reference && processedInvoiceRefs.has(vt.reference)) return;
          const isPurchase = vt.type === 'PURCHASE';
          const qty = vt.quantity || 0;
          if (qty <= 0) return;

          movements.push({
            date: vt.createdAt,
            type: isPurchase ? 'وارد مشتريات' : 'مرتجع لمورد',
            reference: vt.reference || 'حركة مورد',
            party: vt.vendor?.name || p.vendor || 'مورد',
            inQty: isPurchase ? qty : 0,
            outQty: isPurchase ? 0 : qty,
            price: vt.amount && qty ? (vt.amount / qty) : (p.cost || 0)
          });
        });

        // 4. حركات فواتير المبيعات للعملاء
        p.orderItems?.forEach(oi => {
          movements.push({
            date: oi.order.createdAt,
            type: 'مبيعات (أوردر)',
            reference: `#${oi.order.orderNo}`,
            party: oi.order.customer?.name || 'عميل',
            inQty: 0,
            outQty: oi.quantity || 0,
            price: oi.price || 0
          });
        });

        // 5. حركات مرتجعات المبيعات من العملاء
        p.returnItems?.forEach(ri => {
          movements.push({
            date: ri.returnOrder.date || ri.returnOrder.createdAt,
            type: 'مرتجع مبيعات (عميل)',
            reference: `مرتجع #${ri.returnOrder.returnNo}`,
            party: ri.returnOrder.originalOrder?.customer?.name || 'عميل',
            inQty: ri.quantity || 0,
            outQty: 0,
            price: ri.unitPrice || 0
          });
        });

        // 6. حركات تسويات الجرد المخزني المعتمدة
        p.inventoryAuditItems?.forEach(ai => {
          if (ai.audit?.status === 'RECONCILED') {
            const diff = ai.difference;
            if (diff !== 0) {
              movements.push({
                date: ai.audit.reconciledAt || ai.createdAt,
                type: diff > 0 ? 'تسوية جرد (زيادة)' : 'تسوية جرد (عجز)',
                reference: `جرد #${ai.audit.auditNo}`,
                party: 'لجنة الجرد',
                inQty: diff > 0 ? diff : 0,
                outQty: diff < 0 ? Math.abs(diff) : 0,
                price: ai.costAtAudit || p.cost || 0
              });
            }
          }
        });

        // ترتيب الحركات تصاعدياً لحساب الرصيد التراكمي بعد كل حركة
        movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = 0;
        const movementsWithBalance = movements.map(m => {
          runningBalance += (m.inQty - m.outQty);
          return {
            ...m,
            balanceAfter: runningBalance
          };
        });

        // حساب مجاميع الحركات لهذا الصنف
        const totalPurchases = movements.filter(m => m.type.includes('مشتريات') || m.type.includes('جوجل شيت')).reduce((s, m) => s + m.inQty, 0);
        const totalSales = movements.filter(m => m.type.includes('مبيعات (أوردر)')).reduce((s, m) => s + m.outQty, 0);
        const totalCustomerReturns = movements.filter(m => m.type.includes('مرتجع مبيعات')).reduce((s, m) => s + m.inQty, 0);
        const totalVendorReturns = movements.filter(m => m.type.includes('مرتجع لمورد')).reduce((s, m) => s + m.outQty, 0);
        
        // صافي المبيعات للعملاء
        const netSoldPieces = totalSales - totalCustomerReturns;

        return {
            id: p.id,
            modelNo: p.modelNo,
            vendor: p.vendor,
            color: p.color,
            initialStock: initial,
            totalPurchases,
            totalSold: netSoldPieces,
            totalCustomerReturns,
            totalVendorReturns,
            currentStock: p.currentStock,
            price: p.price,
            cost: p.cost,
            status: p.status,
            movements: movementsWithBalance.reverse(), // الأحدث أولاً
            history: p.orderItems.map(item => ({
                orderNo: item.order.orderNo,
                date: item.order.createdAt,
                customer: item.order.customer.name,
                quantity: item.quantity,
                price: item.price
            }))
        };
    });

    const summary = {
      totalItems: report.length,
      totalInitialStock: report.reduce((acc, item) => acc + item.initialStock, 0),
      totalPurchases: report.reduce((acc, item) => acc + item.totalPurchases, 0),
      totalCurrentStock: report.reduce((acc, item) => acc + item.currentStock, 0),
      totalSoldUnits: report.reduce((acc, item) => acc + item.totalSold, 0),
      totalVendorReturns: report.reduce((acc, item) => acc + item.totalVendorReturns, 0)
    };

    return { success: true, data: report, summary };
  } catch (e: any) {
    console.error('Error getting inventory report:', e);
    return { success: false, error: 'فشل جلب بيانات حركة المخزون' };
  }
}

export async function getSafesList() {
    const safes = await prisma.safe.findMany();
    return JSON.parse(JSON.stringify(safes));
}

export async function getSafeLedger(safeId: string, startDate?: string, endDate?: string) {
  try {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59); 
        dateFilter.lte = end;
    }

    const payments = await prisma.payment.findMany({
      where: {
        OR: [ { safeId: safeId }, { targetSafeId: safeId } ],
        createdAt: startDate || endDate ? dateFilter : undefined,
      },
      include: { customer: true, user: true, safe: true, targetSafe: true }
    });

    let transactions: any[] = [];

    payments.forEach((p: any) => {
        let desc = '';
        let inAmt = 0;
        let outAmt = 0;
        let typeLabel = '';

        if (p.type === 'IN') {
             typeLabel = 'سند قبض';
             const custName = p.customer?.name || 'عميل';
             desc = p.description || (p.customer ? `إيصال #${p.receiptNo} - ${custName}` : `إيصال #${p.receiptNo}`);
             inAmt = p.amount;
        } else if (p.type === 'OUT') {
             typeLabel = 'سند صرف';
             desc = p.description || 'مصروفات';
             outAmt = p.amount;
        } else if (p.type === 'TRANSFER') {
             if (p.safeId === safeId) {
                typeLabel = 'تحويل صادر';
                const targetName = p.targetSafe?.name || 'غير معروف';
                desc = `تحويل إلى: ${targetName} - ${p.description || ''}`;
                outAmt = p.amount;
             } else {
                typeLabel = 'تحويل وارد';
                const sourceName = p.safe?.name || 'غير معروف';
                desc = `تحويل من: ${sourceName} - ${p.description || ''}`;
                inAmt = p.amount;
             }
        } else if (p.type === 'PAYMENT_COLLECTION') {
            typeLabel = 'تحصيل أوردر';
            desc = p.description;
            inAmt = p.amount;
        } else if (p.type === 'VOUCHER') {
            return;
        }

        if (typeLabel) {
            transactions.push({
                id: p.id, 
                date: p.createdAt, 
                type: typeLabel,
                description: desc,
                currency: p.currency || 'EGP',
                inAmount: inAmt, 
                outAmount: outAmt, 
                user: p.user?.name || 'النظام'
            });
        }
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const summaryByCurrency: any = {};
    transactions.forEach(t => {
        const curr = t.currency;
        if (!summaryByCurrency[curr]) {
            summaryByCurrency[curr] = { in: 0, out: 0, balance: 0 };
        }
        summaryByCurrency[curr].in += t.inAmount;
        summaryByCurrency[curr].out += t.outAmount;
        summaryByCurrency[curr].balance += (t.inAmount - t.outAmount);
    });

    return { 
        success: true, 
        data: transactions, 
        summaryGrouped: summaryByCurrency 
    };

  } catch (e) {
    console.error(e);
    return { success: false, error: 'فشل جلب دفتر الخزنة' };
  }
}

export async function getEmployeePerformance() {
    try {
        const users = await prisma.user.findMany({
            include: {
                orders: {
                    include: { items: true }
                }
            }
        });

        const report = users.map(user => {
            const orderCount = user.orders.length;
            const totalSales = user.orders.reduce((sum, o) => sum + o.totalAmount, 0);
            
            let totalDiscountValue = 0;
            user.orders.forEach(order => {
                order.items.forEach(item => {
                    if (item.discountPercent > 0) {
                        const finalPrice = item.price;
                        const discountPct = item.discountPercent;
                        const originalPrice = finalPrice / (1 - (discountPct / 100));
                        const discountPerPiece = originalPrice - finalPrice;
                        totalDiscountValue += (discountPerPiece * (item.quantity || 0));
                    }
                });
                totalDiscountValue += (order.discount || 0);
            });

            return {
                id: user.id,
                name: user.name,
                code: user.code,
                role: user.role,
                orderCount,
                totalSales,
                totalDiscount: Math.round(totalDiscountValue)
            };
        }).filter(u => u.orderCount > 0);

        return { success: true, data: report };
    } catch (e) {
        return { success: false, error: 'فشل جلب أداء الموظفين' };
    }
}