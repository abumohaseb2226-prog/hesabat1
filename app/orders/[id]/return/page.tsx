'use client'
import { useState, useEffect, use } from 'react';
import { getOrderById, getSafes, createReturnOrder, searchProducts } from '@/app/actions';
import { getWarehouses } from '@/app/warehouse-management-actions';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function ReturnOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [safes, setSafes] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [printAfterSave, setPrintAfterSave] = useState(false);

  // نوع المرتجع
  const [returnType, setReturnType] = useState<'FULL' | 'PARTIAL' | 'EXCHANGE'>('PARTIAL');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // الأصناف المختارة للرجوع
  const [selectedItems, setSelectedItems] = useState<{[key: string]: {
    quantity: number;
  }}>({});

  // طريقة الاسترداد
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CREDIT' | 'DEDUCT_FROM_NEXT'>('CASH');
  const [selectedSafeId, setSelectedSafeId] = useState('');

  // حقول الاستبدال
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [exchangeProducts, setExchangeProducts] = useState<{[key: string]: {
    quantity: number;
    price: number;
    modelNo: string;
    color: string;
  }}>({});

  // تحميل البيانات
  useEffect(() => {
    Promise.all([
      getOrderById(id),
      getSafes(),
      getWarehouses(),
    ]).then(([orderData, safesData, resWh]) => {
      if (!orderData) {
        router.push('/orders/list');
        return;
      }
      setOrder(orderData);
      setSafes(safesData || []);
      
      if (resWh?.success && resWh.warehouses) {
        setWarehouses(resWh.warehouses);
        // تعيين مخزن الأوردر الأصلي أو المخزن الرئيسي افتراضياً
        if (orderData.warehouseId) {
          setSelectedWarehouseId(orderData.warehouseId);
        } else {
          const defaultWh = resWh.warehouses.find((w: any) => w.isDefault) || resWh.warehouses[0];
          if (defaultWh) setSelectedWarehouseId(defaultWh.id);
        }
      }

      if (safesData && safesData.length > 0) {
        const mainSafe = safesData.find((s: any) => s.name === 'الخزنة الرئيسية');
        setSelectedSafeId(mainSafe?.id || safesData[0].id);
      }
      setLoading(false);
    });
  }, [id, router]);

  // البحث عن منتجات للاستبدال
  useEffect(() => {
    if (searchTerm.length >= 2 && returnType === 'EXCHANGE') {
      searchProducts(searchTerm).then(results => {
        setSearchResults(results);
      });
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, returnType]);

  // تبديل اختيار صنف للرجوع
  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems(prev => {
      const newItems = { ...prev };
      if (newItems[itemId]) {
        delete newItems[itemId];
      } else {
        newItems[itemId] = { quantity: maxQty };
      }
      return newItems;
    });
  };

  // تحديث كمية المرتجع
  const updateQuantity = (itemId: string, qty: number, maxQty: number) => {
    if (qty < 1 || qty > maxQty) return;
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], quantity: qty },
    }));
  };

  // مرتجع كامل
  const handleFullReturn = () => {
    const allItems: any = {};
    order.items.forEach((item: any) => {
      allItems[item.id] = { quantity: item.quantity };
    });
    setSelectedItems(allItems);
    setReturnType('FULL');
  };

  // اختيار/إلغاء صنف بديل للاستبدال
  const toggleExchangeProduct = (product: any) => {
    setExchangeProducts(prev => {
      const newProducts = { ...prev };
      if (newProducts[product.id]) {
        delete newProducts[product.id];
      } else {
        newProducts[product.id] = {
          quantity: 1,
          price: product.price,
          modelNo: product.modelNo,
          color: product.color,
        };
      }
      return newProducts;
    });
  };

  // تحديث كمية الصنف البديل
  const updateExchangeQuantity = (productId: string, qty: number, maxQty: number) => {
    if (qty < 1 || qty > maxQty) return;
    setExchangeProducts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], quantity: qty },
    }));
  };

  // الحسابات
  const calculateTotals = () => {
    let totalRefund = 0;
    let totalExchangeValue = 0;

    Object.entries(selectedItems).forEach(([itemId, data]) => {
      const orderItem = order.items.find((i: any) => i.id === itemId);
      if (!orderItem) return;
      totalRefund += data.quantity * orderItem.price;
    });

    Object.entries(exchangeProducts).forEach(([productId, data]) => {
      totalExchangeValue += data.quantity * data.price;
    });

    const exchangeAmount = totalExchangeValue - totalRefund;

    return { totalRefund, exchangeAmount, totalExchangeValue };
  };

  const { totalRefund, exchangeAmount, totalExchangeValue } = calculateTotals();

  // حفظ المرتجع
  const handleSave = async () => {
    if (Object.keys(selectedItems).length === 0) {
      alert('اختر أصناف للرجوع');
      return;
    }

    if (!selectedWarehouseId) {
      alert('يرجى تحديد المخزن المستلم للبضاعة المرتجعة');
      return;
    }

    if (refundMethod === 'CASH' && !selectedSafeId) {
      alert('اختر الخزنة للاسترداد');
      return;
    }

    if (returnType === 'EXCHANGE' && Object.keys(exchangeProducts).length === 0) {
      alert('اختر صنف بديل واحد على الأقل للاستبدال');
      return;
    }

    setIsSaving(true);

    const items = Object.entries(selectedItems).map(([itemId, data]) => {
      const orderItem = order.items.find((i: any) => i.id === itemId);
      
      return {
        orderItemId: itemId,
        productId: orderItem.productId,
        quantity: data.quantity,
        unitPrice: orderItem.price,
        refundAmount: data.quantity * orderItem.price,
      };
    });

    const exchangeItems = Object.entries(exchangeProducts).map(([productId, data]) => ({
      productId,
      quantity: data.quantity,
      price: data.price,
    }));

    const { totalRefund: calculatedRefund, exchangeAmount: calculatedExchange } = calculateTotals();

    const result = await createReturnOrder({
      originalOrderId: order.id,
      type: returnType,
      reason,
      items,
      exchangeItems,
      totalRefund: returnType === 'EXCHANGE' ? 0 : calculatedRefund,
      depositRefunded: 0,
      exchangeAmount: returnType === 'EXCHANGE' ? calculatedExchange : 0,
      refundMethod: returnType === 'EXCHANGE' ? 'CREDIT' : refundMethod,
      safeId: selectedSafeId,
      warehouseId: selectedWarehouseId, // 👈 تمرير المخزن المستلم للبضاعة
      notes: returnType === 'EXCHANGE' 
        ? `${notes || ''}\nاستبدال بـ: ${Object.values(exchangeProducts).map((p: any) => `${p.modelNo} (${p.color})`).join(', ')}`
        : notes,
    }, session?.user?.image as string);

    setIsSaving(false);

    if (result.success) {
      alert('✅ تم إنشاء المرتجع وإرجاع البضاعة للمخزن بنجاح');
      
      if (printAfterSave) {
        localStorage.setItem('printReturnId', result.data.id);
        localStorage.setItem('printReturn', 'true');
        router.push('/admin/returns');
      } else {
        router.push('/orders/list');
      }
    } else {
      alert('❌ خطأ: ' + result.error);
    }
  };

  if (loading) {
    return <div className="p-10 text-center font-bold">جاري التحميل...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <div className="bg-white p-4 shadow mb-4 sticky top-0 z-20 flex justify-between items-center border-b-4 border-red-500">
        <h2 className="font-bold text-lg">↩️ مرتجع أوردر #{order.orderNo}</h2>
        <Link href="/orders/list" className="text-sm text-blue-600 font-bold">
          العودة للقائمة
        </Link>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* معلومات العميل */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-lg text-blue-800">{order.customer.name}</div>
              <div className="text-xs text-gray-500">{order.customer.phone}</div>
            </div>
            <div className="text-left">
              <div className="font-bold text-lg">{order.totalAmount.toFixed(0)} ج.م</div>
              <div className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString('ar-EG')}</div>
            </div>
          </div>
        </div>

        {/* 🏢 اختيار المخزن المستلم للبضاعة المرتجعة */}
        <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-cyan-200">
          <label className="block text-xs font-bold text-cyan-800 mb-1.5 flex items-center justify-between">
            <span>🏢 المخزن المستلم للبضاعة المرتجعة *</span>
            <span className="text-[10px] text-gray-400 font-normal">الافتراضي: {order.warehouseId ? 'مخزن الأوردر الأصلي' : 'المخزن الرئيسي'}</span>
          </label>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-full p-3 border-2 border-cyan-400 rounded-xl font-bold text-gray-800 bg-cyan-50/30 outline-none focus:border-cyan-500 transition"
          >
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name} {wh.isDefault ? '⭐ (المخزن الرئيسي)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">سيتم إضافة كميات الأصناف المرتجعة مباشرة إلى رصيد هذا المخزن.</p>
        </div>

        {/* نوع المرتجع */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-3">نوع المرتجع</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setReturnType('FULL')}
              className={`p-3 rounded-lg font-bold text-sm border-2 transition-all ${
                returnType === 'FULL'
                  ? 'bg-red-50 border-red-500 text-red-700'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              🔴 مرتجع كامل
            </button>
            <button
              onClick={() => setReturnType('PARTIAL')}
              className={`p-3 rounded-lg font-bold text-sm border-2 transition-all ${
                returnType === 'PARTIAL'
                  ? 'bg-yellow-50 border-yellow-500 text-yellow-700'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              🟡 مرتجع جزئي
            </button>
            <button
              onClick={() => setReturnType('EXCHANGE')}
              className={`p-3 rounded-lg font-bold text-sm border-2 transition-all ${
                returnType === 'EXCHANGE'
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              🔵 استبدال
            </button>
          </div>
          {returnType === 'FULL' && (
            <button
              onClick={handleFullReturn}
              className="mt-3 w-full bg-red-100 text-red-700 py-2 rounded-lg font-bold text-sm"
            >
              تحديد كل الأصناف
            </button>
          )}
        </div>

        {/* الأصناف المرتجعة */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-3">الأصناف</h3>
          <div className="space-y-2">
            {order.items.map((item: any) => {
              const isSelected = !!selectedItems[item.id];
              const selectedData = selectedItems[item.id];
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item.id, item.quantity)}
                        className="w-5 h-5"
                      />
                      <div>
                        <div className="font-bold">{item.product.modelNo}</div>
                        <div className="text-xs text-gray-500">
                          {item.product.color} - {item.price} ج.م
                        </div>
                      </div>
                    </div>
                    <div className="text-left font-bold">
                      {item.quantity} قطعة
                    </div>
                  </div>

                  {isSelected && (
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-600">الكمية:</label>
                      <input
                        type="number"
                        min="1"
                        max={item.quantity}
                        value={selectedData?.quantity || 1}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1, item.quantity)}
                        className="w-20 p-2 border rounded text-center font-bold"
                      />
                      <span className="text-xs text-gray-500">
                        = {(selectedData?.quantity || 0) * item.price} ج.م
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* قسم الأصناف البديلة للاستبدال */}
        {returnType === 'EXCHANGE' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-blue-200">
            <h3 className="font-bold text-blue-700 mb-3">
              🔵 الأصناف البديلة للاستبدال
            </h3>
            
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن الموديل الجديد..."
                className="w-full p-3 border-2 border-blue-200 rounded-lg focus:border-blue-500 outline-none"
              />
            </div>

            {Object.keys(exchangeProducts).length > 0 && (
              <div className="mb-4 border-2 border-green-200 rounded-lg p-3 bg-green-50">
                <h4 className="font-bold text-green-800 mb-2 text-sm">
                  ✅ الأصناف المختارة ({Object.keys(exchangeProducts).length}):
                </h4>
                <div className="space-y-2">
                  {Object.entries(exchangeProducts).map(([productId, data]) => (
                    <div key={productId} className="flex justify-between items-center bg-white p-2 rounded border border-green-200">
                      <div>
                        <div className="font-bold text-sm">{data.modelNo}</div>
                        <div className="text-xs text-gray-500">{data.color} - {data.price} ج.م</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (data.quantity > 1) {
                                setExchangeProducts(prev => ({
                                  ...prev,
                                  [productId]: { ...prev[productId], quantity: prev[productId].quantity - 1 }
                                }));
                              }
                            }}
                            className="w-6 h-6 bg-gray-200 rounded text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={data.quantity}
                            onChange={(e) => {
                              const qty = parseInt(e.target.value) || 1;
                              setExchangeProducts(prev => ({
                                ...prev,
                                [productId]: { ...prev[productId], quantity: qty }
                              }));
                            }}
                            className="w-12 p-1 border rounded text-center text-sm"
                          />
                          <button
                            onClick={() => {
                              setExchangeProducts(prev => ({
                                ...prev,
                                [productId]: { ...prev[productId], quantity: prev[productId].quantity + 1 }
                              }));
                            }}
                            className="w-6 h-6 bg-gray-200 rounded text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-bold text-blue-600">
                            {(data.quantity * data.price).toFixed(2)} ج.م
                          </div>
                          <button
                            onClick={() => toggleExchangeProduct({ id: productId })}
                            className="text-xs text-red-600 font-bold"
                          >
                            ✕ إزالة
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="flex justify-between items-center font-bold text-green-800">
                    <span>القيمة الإجمالية:</span>
                    <span>{calculateTotals().totalExchangeValue.toFixed(2)} ج.م</span>
                  </div>
                </div>
              </div>
            )}

            {searchResults.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-700 mb-2 text-sm">
                  📦 نتائج البحث (اضغط للإضافة):
                </h4>
                <div className="border-2 border-blue-100 rounded-lg max-h-60 overflow-y-auto">
                  {searchResults.map((product: any) => {
                    const isSelected = !!exchangeProducts[product.id];
                    if (isSelected) return null;
                    
                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleExchangeProduct(product)}
                        className="p-3 border-b last:border-0 hover:bg-blue-50 cursor-pointer"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-bold">{product.modelNo}</div>
                            <div className="text-xs text-gray-500">
                              {product.color} - {product.price} ج.م
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-xs text-gray-500">
                              متاح: {product.currentStock}
                            </div>
                            <div className="text-xs text-blue-600 font-bold mt-1">
                              + أضف
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* طريقة الاسترداد */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-700 mb-3">طريقة الاسترداد</h3>
          {returnType !== 'EXCHANGE' ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => setRefundMethod('CASH')}
                  className={`p-3 rounded-lg font-bold text-sm border-2 ${
                    refundMethod === 'CASH'
                      ? 'bg-green-50 border-green-500 text-green-700'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  💵 نقدي
                </button>
                <button
                  onClick={() => setRefundMethod('CREDIT')}
                  className={`p-3 rounded-lg font-bold text-sm border-2 ${
                    refundMethod === 'CREDIT'
                      ? 'bg-purple-50 border-purple-500 text-purple-700'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  📝 رصيد للعميل
                </button>
                <button
                  onClick={() => setRefundMethod('DEDUCT_FROM_NEXT')}
                  className={`p-3 rounded-lg font-bold text-sm border-2 ${
                    refundMethod === 'DEDUCT_FROM_NEXT'
                      ? 'bg-orange-50 border-orange-500 text-orange-700'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  ⚖️ خصم قادم
                </button>
              </div>

              {refundMethod === 'CASH' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">الخزنة:</label>
                  <select
                    value={selectedSafeId}
                    onChange={(e) => setSelectedSafeId(e.target.value)}
                    className="w-full p-3 border rounded-lg font-bold"
                  >
                    {safes.map((safe: any) => (
                      <option key={safe.id} value={safe.id}>
                        {safe.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
              <p className="text-sm text-blue-800 font-bold">
                💡 في حالة الاستبدال، يتم احتساب فرق السعر تلقائياً
              </p>
              {exchangeAmount > 0 && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ العميل يدفع فرق: {exchangeAmount.toFixed(2)} ج.م
                </p>
              )}
              {exchangeAmount < 0 && (
                <p className="text-xs text-green-600 mt-2">
                  ✅ العميل يسترد فرق: {Math.abs(exchangeAmount).toFixed(2)} ج.م
                </p>
              )}
              {exchangeAmount === 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  ✓ لا يوجد فرق في السعر
                </p>
              )}
            </div>
          )}
        </div>

        {/* السبب والملاحظات */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <label className="text-xs font-bold text-gray-600 mb-1 block">سبب المرتجع:</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: عيب في الصنع، عدم ملاءمة..."
            className="w-full p-3 border rounded-lg mb-3"
          />
          <label className="text-xs font-bold text-gray-600 mb-1 block">ملاحظات:</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 border rounded-lg"
            rows={3}
          />
        </div>

        {/* الحسابات */}
        <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg">
          {returnType === 'EXCHANGE' ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">قيمة المرتجع:</div>
                  <div className="font-bold text-xl text-yellow-400">{totalRefund.toFixed(2)} ج.م</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">قيمة البديل:</div>
                  <div className="font-bold text-xl text-blue-400">{totalExchangeValue.toFixed(2)} ج.م</div>
                </div>
              </div>
              <div className="border-t border-gray-700 pt-3">
                <div className="flex justify-between items-center">
                  <span>فرق السعر:</span>
                  <span className={`font-bold text-2xl ${
                    exchangeAmount > 0 ? 'text-red-400' : 
                    exchangeAmount < 0 ? 'text-green-400' : 'text-white'
                  }`}>
                    {exchangeAmount > 0 ? '+' : ''}{exchangeAmount.toFixed(2)} ج.م
                  </span>
                </div>
                {exchangeAmount > 0 && (
                  <p className="text-xs text-gray-400 mt-1">العميل يدفع الفرق</p>
                )}
                {exchangeAmount < 0 && (
                  <p className="text-xs text-gray-400 mt-1">يُسترد للعميل</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center">
              <span>إجمالي المرتجع:</span>
              <span className="font-bold text-2xl text-yellow-400">{totalRefund.toFixed(2)} ج.م</span>
            </div>
          )}
        </div>

        {/* خيار الطباعة */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={printAfterSave}
              onChange={(e) => setPrintAfterSave(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="font-bold text-gray-700">
              🖨️ طباعة إيصال المرتجع بعد الحفظ
            </span>
          </label>
        </div>

        {/* زر الحفظ */}
        <button
          onClick={handleSave}
          disabled={isSaving || Object.keys(selectedItems).length === 0 || (returnType === 'EXCHANGE' && Object.keys(exchangeProducts).length === 0)}
          className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-lg shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isSaving ? '⏳ جاري الحفظ وتوريد البضاعة للمخزن...' : 
            printAfterSave 
              ? (returnType === 'EXCHANGE' ? '🔄 تأكيد الاستبدال والطباعة' : '↩️ تأكيد المرتجع والطباعة')
              : (returnType === 'EXCHANGE' ? '🔄 تأكيد الاستبدال' : '↩️ تأكيد المرتجع')
          }
        </button>
      </div>
    </div>
  );
}