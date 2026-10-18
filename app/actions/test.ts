'use server';

import { revalidatePath } from 'next/cache';
import { prisma as db } from '../../lib/prisma';

const TEST_CUSTOMER_NAME = 'عميل تجريبي TEST';
const ORDER_ITEM_COUNT = 400;

/**
 * Creates a large, random, and REAL test order for testing business logic and performance.
 * This will actually decrement stock.
 */
export async function createTestOrder(userId: string) {
  console.log('Starting to create a REAL test order...');

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Find or create the test customer
      let testCustomer = await tx.customer.findFirst({
        where: { name: TEST_CUSTOMER_NAME },
      });

      if (!testCustomer) {
        console.log('Test customer not found, creating one...');
        testCustomer = await tx.customer.create({
          data: {
            name: TEST_CUSTOMER_NAME,
            code: `TEST-${Date.now()}`,
            phone: '0123456789',
            address: 'عنوان تجريبي',
          },
        });
      }

      // 2. Find a large number of available products
      const availableProducts = await tx.product.findMany({
        where: { status: 'OPEN', currentStock: { gt: 0 } },
        take: ORDER_ITEM_COUNT,
        select: {
          id: true,
          price: true,
          currentStock: true,
        },
      });

      if (availableProducts.length === 0) {
        throw new Error('لم يتم العثور على منتجات متاحة لإنشاء الفاتورة.');
      }

      // 3. Prepare the order items and stock updates
      const orderItemsData = [];
      const stockUpdatePromises = [];

      for (const p of availableProducts) {
        const quantityToOrder = Math.min(p.currentStock, 2);
        if (quantityToOrder > 0) {
          orderItemsData.push({
            productId: p.id,
            quantity: quantityToOrder,
            price: p.price,
          });

          stockUpdatePromises.push(
            tx.product.update({
              where: { id: p.id },
              data: { currentStock: { decrement: quantityToOrder } },
            })
          );
        }
      }

      if (orderItemsData.length === 0) {
        throw new Error('لم يتم العثور على أصناف صالحة لإضافتها للفاتورة.');
      }

      const totalAmount = orderItemsData.reduce((acc, item) => acc + (item.quantity * item.price), 0);

      // 4. Create the main order
      const newOrder = await tx.order.create({
        data: {
          totalAmount,
          userId,
          customerId: testCustomer.id,
          notes: 'فاتورة تجريبية حقيقية تم إنشاؤها للاختبار (تؤثر على المخزون).',
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      // 5. Execute all stock updates
      console.log(`Updating stock for ${stockUpdatePromises.length} products...`);
      await Promise.all(stockUpdatePromises);
      console.log('Stock updates completed.');

      // 6. Revalidate paths to show the new order in the UI
      revalidatePath('/');
      revalidatePath('/orders/list');
      revalidatePath('/admin/products');

      console.log(`Successfully created REAL test order #${newOrder.orderNo} with ${newOrder.items.length} items.`);

      return {
        success: true,
        message: `تم إنشاء فاتورة تجريبية حقيقية بنجاح برقم #${newOrder.orderNo}. تم خصم ${newOrder.items.length} صنف من المخزون.`,
      };
    }, {
      timeout: 60000, // 60 seconds timeout
    });

    return result;

  } catch (error: any) {
    console.error('Failed to create real test order:', error);
    return { success: false, message: `فشل إنشاء الفاتورة: ${error.message}` };
  }
}

/**
 * Deletes all test orders and restores the stock.
 */
export async function deleteTestOrders() {
    console.log('Attempting to delete all test orders and restore stock...');

    try {
        const testCustomer = await db.customer.findFirst({
            where: { name: TEST_CUSTOMER_NAME },
            select: { id: true },
        });

        if (!testCustomer) {
            return { success: true, message: 'لم يتم العثور على العميل التجريبي، لا يوجد فواتير لحذفها.' };
        }

        const testOrders = await db.order.findMany({
            where: {
                customerId: testCustomer.id,
            },
            include: {
                items: {
                    select: {
                        productId: true,
                        quantity: true,
                    },
                },
            },
        });

        if (testOrders.length === 0) {
            return { success: true, message: 'لا توجد فواتير تجريبية لحذفها.' };
        }

        let restoredItemsCount = 0;

        for (const order of testOrders) {
            await db.$transaction(async (tx) => {
                // Restore stock for each item in the order
                const stockRestores = order.items.map((item: { productId: string; quantity: number }) =>
                    tx.product.update({
                        where: { id: item.productId },
                        data: { currentStock: { increment: item.quantity } },
                    })
                );
                await Promise.all(stockRestores);

                // حذف بنود الأوردر وحذف الأوردر التجريبي نهائياً
                await tx.orderItem.deleteMany({
                    where: { orderId: order.id },
                });

                await tx.order.delete({
                    where: { id: order.id },
                });

                restoredItemsCount += order.items.length;
            }, { timeout: 60000 });
        }

        revalidatePath('/');
        revalidatePath('/orders/list');
        revalidatePath('/admin/products');

        const message = `تم حذف ${testOrders.length} فاتورة تجريبية بنجاح، وإرجاع ${restoredItemsCount} صنف إلى المخزون.`;
        console.log(message);
        return { success: true, message };

    } catch (error: any) {
        console.error('Error deleting test orders:', error);
        return { success: false, message: `فشل حذف الفواتير التجريبية: ${error.message}` };
    }
}