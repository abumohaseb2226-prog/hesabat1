'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ==========================================
// 1. إدارة المستخدمين (Users)
// ==========================================

export async function addUser(data: any) {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await prisma.user.create({
      data: {
        code: data.code,
        name: data.name,
        password: hashedPassword,
        role: data.role
      }
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (e) {
    return { success: false, error: 'الكود مستخدم من قبل' };
  }
}

export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({ where: { id } });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (e) { return { success: false }; }
}

export async function getUsers() {
  const users = await prisma.user.findMany({ orderBy: { id: 'desc' } });
  return JSON.parse(JSON.stringify(users));
}

// ==========================================
// 2. إدارة المنتجات (Products)
// ==========================================

export async function addProduct(data: any) {
  try {
    for (const item of data.colors) {
        await prisma.product.upsert({
            where: {
                modelNo_color: {
                    modelNo: data.modelNo,
                    color: item.color
                }
            },
            update: {
                stockQty: { increment: parseInt(item.stock) },
                currentStock: { increment: parseInt(item.stock) },
                price: parseFloat(data.price),
                vendor: data.vendor,
                cost: parseFloat(data.cost) || 0,
                description: data.description,
            },
            create: {
                modelNo: data.modelNo,
                description: data.description,
                vendor: data.vendor,
                price: parseFloat(data.price),
                cost: parseFloat(data.cost) || 0,
                discount: parseFloat(data.discount) || 0, 
                color: item.color,
                stockQty: parseInt(item.stock),
                currentStock: parseInt(item.stock), 
                status: data.status || 'OPEN'
            }
        });
    }
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    revalidatePath('/admin/reports');
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, error: 'حدث خطأ أثناء الإضافة' };
  }
}

export async function updateProduct(id: string, data: any) {
    try {
        await prisma.product.update({
            where: { id },
            data: {
                modelNo: data.modelNo,
                description: data.description,
                vendor: data.vendor,
                color: data.color,
                price: parseFloat(data.price),
                cost: parseFloat(data.cost) || 0,
                discount: parseFloat(data.discount) || 0,
                stockQty: parseInt(data.stockQty),
                currentStock: parseInt(data.stockQty),
                status: data.status
            }
        });
        revalidatePath('/admin/products');
        revalidatePath('/admin/notifications');
        return { success: true };
    } catch (e) {
        return { success: false, error: 'فشل التعديل' };
    }
}

export async function addBulkProducts(products: any[]) {
    try {
        let count = 0;
        for (const p of products) {
            if(p.modelNo && p.color) {
                const productStatus = (p.status && p.status.toUpperCase() === 'CLOSED') ? 'CLOSED' : 'OPEN';
                
                await prisma.product.upsert({
                    where: {
                        modelNo_color: {
                            modelNo: String(p.modelNo),
                            color: String(p.color)
                        }
                    },
                    update: {
                        stockQty: { increment: parseInt(p.stockQty) || 0 },
                        currentStock: { increment: parseInt(p.stockQty) || 0 },
                        price: parseFloat(p.price) || 0,
                        cost: parseFloat(p.cost) || 0,
                        discount: parseFloat(p.discount) || 0,
                        description: p.description || '',
                        vendor: p.vendor || '',
                        status: productStatus
                    },
                    create: {
                        modelNo: String(p.modelNo),
                        description: p.description || '',
                        vendor: p.vendor || '',
                        color: String(p.color),
                        price: parseFloat(p.price) || 0,
                        cost: parseFloat(p.cost) || 0,
                        discount: parseFloat(p.discount) || 0,
                        stockQty: parseInt(p.stockQty) || 0,
                        currentStock: parseInt(p.stockQty) || 0, 
                        status: productStatus
                    }
                });
                count++;
            }
        }
        revalidatePath('/admin/products');
        revalidatePath('/admin/reports');
        return { success: true, count };
    } catch (e) {
        return { success: false, error: 'حدث خطأ أثناء الاستيراد' };
    }
}

export async function updateInitialStockBulk(items: { modelNo: string; color: string; stockQty: number }[]) {
  try {
    let updatedCount = 0;
    let notFoundCount = 0;

    for (const item of items) {
      if (!item.modelNo || !item.color) continue;

      const modelNoStr = String(item.modelNo).trim();
      const colorStr = String(item.color).trim();
      const newInitialStock = parseInt(String(item.stockQty), 10);

      if (isNaN(newInitialStock)) continue;

      const product = await prisma.product.findUnique({
        where: {
          modelNo_color: {
            modelNo: modelNoStr,
            color: colorStr
          }
        },
        include: {
          orderItems: {
            include: {
              returnItems: true
            }
          },
          returnItems: true,
          exchangedItems: true,
          vendorTransactions: true
        }
      });

      if (!product) {
        notFoundCount++;
        continue;
      }

      const totalSoldToCustomers = product.orderItems.reduce((acc, oi) => acc + (oi.quantity || 0), 0);
      const totalReturnedFromCustomers = product.returnItems.reduce((acc, ri) => acc + (ri.quantity || 0), 0);
      const totalExchangedOut = product.exchangedItems.reduce((acc, ei) => acc + (ei.exchangedQty || 0), 0);
      const netCustomerSales = totalSoldToCustomers - totalReturnedFromCustomers + totalExchangedOut;

      const totalVendorReturns = product.vendorTransactions
        .filter(vt => vt.type === 'RETURN')
        .reduce((acc, vt) => acc + (vt.quantity || 0), 0);

      const newCurrentStock = newInitialStock - netCustomerSales - totalVendorReturns;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          stockQty: newInitialStock,
          currentStock: newCurrentStock
        }
      });

      updatedCount++;
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/notifications');
    revalidatePath('/sorting');

    return { success: true, updatedCount, notFoundCount };
  } catch (error: any) {
    console.error('Error updating initial stock bulk:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء تحديث الكميات الأولية' };
  }
}

// ✅ دالة تصفير الرصيد الأولي للأصناف المحددة (stockQty = 0 مع بقاء currentStock دون تغيير)
export async function resetInitialStockBulk(ids: string[]) {
  try {
    if (!ids || ids.length === 0) {
      return { success: false, error: 'لم يتم تحديد أي أصناف' };
    }

    const res = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { stockQty: 0 }
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/vendors');

    return { success: true, count: res.count };
  } catch (error: any) {
    console.error('Error resetting initial stock bulk:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء تصفير الرصيد الأولي' };
  }
}

// ==========================================
// قسم المزامنة مع جوجل شيت (Google Sheets Sync)
// ==========================================

export async function syncFromGoogleSheets(startDateStr: string) {
  try {
    const SYNC_START_DATE = new Date(startDateStr);
    if (isNaN(SYNC_START_DATE.getTime())) throw new Error("التاريخ المختار غير صحيح");

    const SHEET_ID = "1EhPqEOYOzoLREVC3IMsjmXiPP5WXTjhF5_DJxVOcI2M";
    const GID = "2110927030";
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error("فشل الاتصال بجوجل شيت");
    const csvText = await response.text();

    const lines = csvText.split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1);

    const syncOp = await prisma.syncOperation.create({
        data: { startDate: SYNC_START_DATE }
    });

    let processedCount = 0;

    for (const row of rows) {
      const values = row.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(v => v.replace(/^\"|\"$/g, '').trim());
      if (values.length < headers.length) continue;

      const data: any = {};
      headers.forEach((header, index) => { data[header] = values[index]; });

      const rowDate = new Date(data["datetime"]);
      if (rowDate < SYNC_START_DATE) continue; 
      if (data["tasneef"] !== "اساسي") continue;

      const modelCodes = data["model code"].split("-").map((m: string) => m.trim()).filter((m: string) => m !== "");
      const totalPieces = (parseInt(data["raqty"]) || 0) * 4;

      for (const modelNo of modelCodes) {
        const compositeKey = `${data["id"]}-${modelNo}`;

        const existingRecord = await prisma.syncRecord.findUnique({
            where: { uniqueKey: compositeKey }
        });
        if (existingRecord) continue;

        const product = await prisma.product.findFirst({
            where: { modelNo: modelNo, vendor: data["khcode"] }
        });

        if (product) {
          await prisma.product.update({
            where: { id: product.id },
            data: { stockQty: { increment: totalPieces }, currentStock: { increment: totalPieces } }
          });

          await prisma.syncRecord.create({
            data: {
                syncOperationId: syncOp.id,
                productId: product.id,
                quantityAdded: totalPieces,
                uniqueKey: compositeKey
            }
          });
          processedCount++;
        }
      }
    }

    if (processedCount > 0) {
        await prisma.syncOperation.update({
            where: { id: syncOp.id },
            data: { itemsCount: processedCount }
        });
    } else {
        await prisma.syncOperation.delete({ where: { id: syncOp.id } });
        return { success: true, message: `لم يتم العثور على حركات جديدة.` };
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/reports');
    
    return { 
        success: true, 
        message: `تم سحب ${processedCount} حركة جديدة بنجاح.` 
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSyncOperations() {
    const ops = await prisma.syncOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    return JSON.parse(JSON.stringify(ops));
}

export async function revertSyncOperation(operationId: string) {
    try {
        const records = await prisma.syncRecord.findMany({
            where: { syncOperationId: operationId }
        });

        for (const record of records) {
            await prisma.product.update({
                where: { id: record.productId },
                data: {
                    stockQty: { decrement: record.quantityAdded },
                    currentStock: { decrement: record.quantityAdded }
                }
            });
        }

        await prisma.syncOperation.delete({ where: { id: operationId } });

        revalidatePath('/admin/products');
        revalidatePath('/admin/reports');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: 'حدث خطأ أثناء التراجع.' };
    }
}

export async function deleteProduct(id: string) {
  try {
    await prisma.product.delete({ where: { id } });
    revalidatePath('/admin/products');
    revalidatePath('/admin/notifications');
    return { success: true };
  } catch (e) { 
      return { success: false, error: 'لا يمكن حذف الصنف لأنه مرتبط بطلبات سابقة' }; 
  }
}

export async function deleteBulkProducts(ids: string[]) {
    try {
        const res = await prisma.product.deleteMany({
            where: {
                id: { in: ids },
                orderItems: { none: {} }
            }
        });
        revalidatePath('/admin/products');
        revalidatePath('/admin/notifications');
        return { success: true, deleted: res.count, failed: ids.length - res.count };
    } catch (e) {
        return { success: false, error: 'حدث خطأ أثناء الحذف' };
    }
}

export async function deleteAllProducts() {
    try {
        const res = await prisma.product.deleteMany({
            where: {
                orderItems: { none: {} }
            }
        });
        const remaining = await prisma.product.count();
        revalidatePath('/admin/products');
        revalidatePath('/admin/notifications');
        return { success: true, deleted: res.count, failed: remaining };
    } catch (e) { return { success: false, error: 'حدث خطأ غير متوقع' }; }
}

export async function getProducts() {
  const products = await prisma.product.findMany({ orderBy: { id: 'desc' }, take: 5000 });
  return JSON.parse(JSON.stringify(products));
}

// ==========================================
// 3. إدارة العملاء (Customers)
// ==========================================

export async function addCustomer(data: any) {
    try {
      const { name, phone, phone2, code, source, force } = data;
      const normalizedInputName = name.replace(/[أإآ]/g, 'ا');
      const existingByName: any[] = await prisma.$queryRaw`
        SELECT name FROM "Customer" 
        WHERE TRANSLATE(name, 'أإآ', 'ااا') = ${normalizedInputName}
        LIMIT 1
      `;
      
      if (existingByName.length > 0) {
          return { success: false, error: `الاسم موجود مسبقاً باسم: (${existingByName[0].name})` };
      }

      if (!force) {
          const phonesToCheck = [phone, phone2].filter(p => p && p.trim() !== "");
          if (phonesToCheck.length > 0) {
              const existingByPhone = await prisma.customer.findFirst({
                  where: {
                      OR: [
                          { phone: { in: phonesToCheck } },
                          { phone2: { in: phonesToCheck } },
                          { phone: { in: phonesToCheck.map(p => p) } } 
                      ]
                  },
                  select: { name: true }
              });

              if (existingByPhone) {
                  return { success: false, warning: true, existingName: existingByPhone.name };
              }
          }
      }

      let finalCode = code;
      if (!finalCode || finalCode.trim() === "") {
        finalCode = "C-" + Date.now().toString().slice(-6);
      }

      const customer = await prisma.customer.create({ 
          data: {
              code: finalCode,
              name: name,
              phone: phone || null,
              phone2: phone2 || null,
              address: data.address || '',
              source: source || 'ADMIN'
          } 
      });
      revalidatePath('/admin/customers');
      return { success: true, customer: JSON.parse(JSON.stringify(customer)) };
    } catch (e) { 
        return { success: false, error: 'كود العميل مكرر أو خطأ في البيانات' }; 
    }
}

export async function updateCustomer(id: string, data: any) {
    try {
        await prisma.customer.update({
            where: { id },
            data: {
                code: data.code,
                name: data.name,
                phone: data.phone,
                phone2: data.phone2,
                address: data.address
            }
        });
        revalidatePath('/admin/customers');
        return { success: true };
    } catch (e) { return { success: false, error: 'حدث خطأ أثناء التعديل' }; }
}

export async function addBulkCustomers(customers: any[]) {
    try {
        let count = 0;
        for (const c of customers) {
            if(c.code && c.name) {
                await prisma.customer.upsert({
                    where: { code: String(c.code) },
                    update: {
                        name: c.name,
                        phone: String(c.phone || ''),
                        phone2: String(c.phone2 || ''),
                        address: c.address || ''
                    },
                    create: {
                        code: String(c.code),
                        name: c.name,
                        phone: String(c.phone || ''),
                        phone2: String(c.phone2 || ''),
                        address: c.address || '',
                        source: 'ADMIN'
                    }
                });
                count++;
            }
        }
        revalidatePath('/admin/customers');
        return { success: true, count };
    } catch (e) {
        return { success: false, error: 'حدث خطأ أثناء الاستيراد' };
    }
}

export async function deleteCustomer(id: string) {
    try {
        await prisma.customer.delete({ where: { id } });
        revalidatePath('/admin/customers');
        return { success: true };
    } catch (e) { 
        return { success: false, error: 'لا يمكن حذف العميل لوجود معاملات سابقة' }; 
    }
}

export async function deleteBulkCustomers(ids: string[]) {
    try {
        const res = await prisma.customer.deleteMany({
            where: {
                id: { in: ids },
                orders: { none: {} },
                payments: { none: {} }
            }
        });
        revalidatePath('/admin/customers');
        return { success: true, deleted: res.count, failed: ids.length - res.count };
    } catch (e) {
        return { success: false, error: 'حدث خطأ في قاعدة البيانات' };
    }
}

export async function deleteAllCustomers() {
    try {
        const totalBefore = await prisma.customer.count();
        const res = await prisma.customer.deleteMany({
            where: {
                orders: { none: {} },
                payments: { none: {} }
            }
        });
        const remaining = totalBefore - res.count;
        revalidatePath('/admin/customers');
        return { success: true, deleted: res.count, failed: remaining };
    } catch (e) { 
        return { success: false, error: 'حدث خطأ غير متوقع', deleted: 0, failed: 0 }; 
    }
}

export async function getAdminCustomers() {
    try {
      const custs = await prisma.customer.findMany({
        orderBy: { id: 'desc' },
        take: 3000,
        include: {
          orders: {
            select: {
              id: true,
              totalAmount: true,
              originalReturns: {
                where: { status: { not: 'CANCELLED' } },
                select: { totalRefund: true }
              }
            }
          },
          payments: {
            select: { amount: true, type: true }
          }
        }
      });

      const customersWithBalance = custs.map(c => {
        const totalOrders = c.orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        let totalReturns = 0;
        c.orders.forEach(o => {
          o.originalReturns.forEach(r => {
            totalReturns += (r.totalRefund || 0);
          });
        });

        let totalPaymentsIn = 0;
        let totalPaymentsOut = 0;
        c.payments.forEach(p => {
          if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') {
            totalPaymentsIn += (p.amount || 0);
          } else if (p.type === 'OUT') {
            totalPaymentsOut += (p.amount || 0);
          }
        });

        const balance = totalOrders - totalReturns - totalPaymentsIn + totalPaymentsOut;

        return {
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone,
          phone2: c.phone2,
          address: c.address,
          source: c.source,
          balance: Math.round(balance * 100) / 100
        };
      });

      return JSON.parse(JSON.stringify(customersWithBalance));
    } catch (error) {
      console.error('Error fetching admin customers with balances:', error);
      return [];
    }
}

// ==========================================
// 4. نظام الإشعارات (Notifications)
// ==========================================

export async function getLowStockClosedCount() {
    try {
        const count = await prisma.product.count({
            where: {
                status: 'CLOSED',
                currentStock: { lte: 4 }
            }
        });
        return count;
    } catch (e) {
        return 0;
    }
}

export async function getLowStockClosedItems() {
  try {
    const items = await prisma.product.findMany({
      where: {
        status: "CLOSED",
        currentStock: { lte: 4 },
      },
      select: {
        id: true,
        modelNo: true,
        color: true,
        currentStock: true,
        price: true,
        isStockAlertRead: true, 
      },
      orderBy: {
        currentStock: 'asc',
      }
    });
    return items;
  } catch (error) {
    return [];
  }
}

// =========================================================================
// 5. إدارة النقدية والخزائن ودفتر الأستاذ (Cash Management & Safes)
// =========================================================================

export async function getSafesWithBalances() {
  try {
    const safes = await prisma.safe.findMany({
      include: {
        payments: {
          select: { amount: true, type: true }
        },
        incomingTransfers: {
          select: { amount: true, type: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const safesWithBalances = safes.map(s => {
      let balance = 0;
      let totalIn = 0;
      let totalOut = 0;

      s.payments.forEach(p => {
        if (p.type === 'IN' || p.type === 'PAYMENT_COLLECTION') {
          balance += p.amount;
          totalIn += p.amount;
        } else if (p.type === 'OUT') {
          balance -= p.amount;
          totalOut += p.amount;
        } else if (p.type === 'TRANSFER') {
          balance -= p.amount;
          totalOut += p.amount;
        }
      });

      s.incomingTransfers.forEach(p => {
        balance += p.amount;
        totalIn += p.amount;
      });

      return {
        id: s.id,
        name: s.name,
        balance: Math.round(balance * 100) / 100,
        totalIn: Math.round(totalIn * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
      };
    });

    return { success: true, safes: JSON.parse(JSON.stringify(safesWithBalances)) };
  } catch (error: any) {
    console.error("Error fetching safes with balances:", error);
    return { success: false, error: error.message, safes: [] };
  }
}

export async function createSafe(name: string) {
  try {
    if (!name || !name.trim()) {
      return { success: false, error: 'اسم الخزنة مطلوب' };
    }

    const trimmed = name.trim();
    const existing = await prisma.safe.findFirst({
      where: { name: trimmed }
    });

    if (existing) {
      return { success: false, error: 'توجد خزنة مسجلة مسبقاً بهذا الاسم' };
    }

    const safe = await prisma.safe.create({
      data: { name: trimmed }
    });

    revalidatePath('/admin/cash-management');
    revalidatePath('/admin/reports');
    revalidatePath('/payments/new');

    return { success: true, safe: JSON.parse(JSON.stringify(safe)) };
  } catch (error: any) {
    console.error("Error creating safe:", error);
    return { success: false, error: error.message || 'فشل إنشاء الخزنة' };
  }
}

export async function getPayments(params?: {
  safeId?: string
  startDate?: string
  endDate?: string
}) {
    try {
        const where: any = {}

        if (params?.safeId && params.safeId !== 'ALL') {
          where.OR = [
            { safeId: params.safeId },
            { targetSafeId: params.safeId }
          ]
        }

        if (params?.startDate || params?.endDate) {
          where.createdAt = {}
          if (params.startDate) where.createdAt.gte = new Date(params.startDate + 'T00:00:00')
          if (params.endDate) where.createdAt.lte = new Date(params.endDate + 'T23:59:59.999')
        }

        const payments = await prisma.payment.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { createdAt: 'desc' },
            include: {
                safe: true,
                targetSafe: true,
                customer: true,
                vendor: true,
                user: true,
            },
            take: 1500
        });

        const processedPayments = payments.map(p => ({
            ...p,
            isDownPayment: p.description ? p.description.startsWith('تحصيل دفعة للأوردر') : false
        }));

        return { success: true, data: JSON.parse(JSON.stringify(processedPayments)) };

    } catch (e) {
        console.error("Failed to fetch payments ledger:", e);
        return { success: false, error: 'Failed to fetch payments.' };
    }
}

export async function updatePayment(id: string, data: any) {
    try {
        await prisma.payment.update({
            where: { id },
            data: {
                amount: parseFloat(data.amount),
                description: data.description,
                type: data.type,
                currency: data.currency,
                safeId: data.safeId,
                targetSafeId: data.targetSafeId,
                customerId: data.customerId,
            }
        });
        revalidatePath('/admin/cash-management');
        revalidatePath('/admin/reports');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to update payment.' };
    }
}

export async function deletePayment(id: string) {
    try {
        await prisma.payment.delete({ where: { id } });
        revalidatePath('/admin/cash-management');
        revalidatePath('/admin/reports');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete payment.' };
    }
}