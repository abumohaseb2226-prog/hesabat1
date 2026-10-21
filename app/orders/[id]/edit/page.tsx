'use client'
import { useState, useEffect, useRef, use } from 'react';
import { getOrderById, searchProducts, updateOrder, getSafes, searchCustomers } from '@/app/actions';
import { addCustomer, updateOrderDate } from '@/app/admin-actions';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Scanner } from '@yudiel/react-qr-scanner';

interface Safe {
  id: string;
  name: string;
}

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  // فحص صلاحية الأدمن أو صاحب العمل أو المحاسب
  const userRole = session?.user?.role || 'EMPLOYEE';
  const canEditDate = ['ADMIN', 'OWNER', 'ACCOUNTANT'].includes(userRole);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [safes, setSafes] = useState<Safe[]>([]);
  const [order, setOrder] = useState<any>(null);

  // حالات التاريخ الجديد والأصلي
  const [orderDate, setOrderDate] = useState<string>('');
  const [originalOrderDate, setOriginalOrderDate] = useState<string>('');
  
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectionMap, setSelectionMap] = useState<{[key: string]: number}>({});

  const [cart, setCart] = useState<any[]>([]);
  const [cartSearchTerm, setCartSearchTerm] = useState('');
  const [deposit, setDeposit] = useState<string>('');
  const [depositSplits, setDepositSplits] = useState<Array<{safeId: string, amount: number}>>([]);
  const [voucherAmount, setVoucherAmount] = useState<string>('');
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [notes, setNotes] = useState('');

  const [showDiscountOptions, setShowDiscountOptions] = useState(false);

  const handleDepositChange = (value: string) => {
    setDeposit(value);
    const depositVal = parseFloat(value) || 0;

    if (depositVal !== 0) {
        if (depositSplits.length === 0 && safes.length > 0) {
            const mainSafe = safes.find(s => s.name === 'الخزنة الرئيسية') || safes[0];
            setDepositSplits([{ safeId: mainSafe.id, amount: depositVal }]);
        } else if (depositSplits.length === 1) {
            setDepositSplits(splits => [{ ...splits[0], amount: depositVal }]);
        }
    } else {
        setDepositSplits(splits => splits.map(s => ({ ...s, amount: 0 })));
    }
  };

  useEffect(() => {
    getSafes().then((fetchedSafes: Safe[]) => {
        setSafes(fetchedSafes);
        
        getOrderById(id).then(res => {
            if (!res) {
                alert("لم يتم العثور على الأوردر!");
                return router.push('/orders/list');
            }
            setOrder(res);
            setSelectedCustomer(res.customer);
            setCustomerSearchTerm(res.customer.name);
            setDeposit(res.deposit.toString());
            handleDepositChange(res.deposit.toString());

            // ضبط تاريخ الأوردر بتنسيق YYYY-MM-DD
            if (res.createdAt) {
              const d = new Date(res.createdAt);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const localDateStr = `${year}-${month}-${day}`;
              setOrderDate(localDateStr);
              setOriginalOrderDate(localDateStr);
            }

            if (res.depositSplits && res.depositSplits.length > 0) {
              setDepositSplits(res.depositSplits);
            } else if (res.deposit > 0) {
              const mainSafe = fetchedSafes.find(safe => safe.id === res.safeId) || fetchedSafes.find(s => s.name === 'الخزنة الرئيسية') || fetchedSafes[0];
              setDepositSplits([{ safeId: mainSafe.id, amount: res.deposit }])
            }

            setVoucherAmount((res.voucherAmount || '').toString());
            if(res.voucherAmount > 0) setShowVoucherInput(true);
            setNotes(res.notes || '');
            
            const initialCart: any[] = [];
            const itemGroups: {[key: string]: any} = {};
            
            res.items.forEach((item: any) => {
                const unitPrice = item.price;
                const key = `${item.product.modelNo}|${unitPrice.toFixed(2)}|${item.discountPercent}`;

                if (!itemGroups[key]) {
                    itemGroups[key] = {
                        type: 'product',
                        id: Math.random(),
                        modelNo: item.product.modelNo,
                        baseDescription: item.product.description,
                        unitPrice: unitPrice, 
                        variants: [],
                        discountPercent: item.discountPercent 
                    };
                }
                itemGroups[key].variants.push({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: unitPrice, 
                    color: item.product.color,
                    productDiscount: item.product.discount
                });
            });

            Object.values(itemGroups).forEach((item: any) => {
                if (item.discountPercent > 0) {
                    initialCart.push({ type: 'discount', percent: item.discountPercent, id: Math.random(), isAuto: false });
                }
                item.totalQty = item.variants.reduce((s:any, v:any) => s + v.quantity, 0);
                initialCart.push(item);
            });

            setCart(initialCart);
            setLoading(false);
        });
    });
  }, [id, router]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        if (customerSearchTerm.length > 0 && customerSearchTerm !== selectedCustomer?.name) {
            setIsSearchingCustomer(true);
            const results = await searchCustomers(customerSearchTerm);
            setCustomerResults(results);
            setIsSearchingCustomer(false);
            setShowCustomerList(true);
        }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [customerSearchTerm, selectedCustomer]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        const results = await searchProducts(searchTerm);
        setSearchResults(results);
      } else { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const toggleSelection = (productId: string, isChecked: boolean) => {
    setSelectionMap(prev => {
      const newMap = { ...prev };
      if (isChecked) newMap[productId] = 1; else delete newMap[productId];
      return newMap;
    });
  };

  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    const product = searchResults.find(p => p.id === productId);
    if (!product) return;

    if (product.status === 'CLOSED') {
        const availableStock = product.currentStock; 
        if (newQty > availableStock) {
          alert(`الكمية المتاحة من هذا الصنف المغلق هي ${availableStock} قطعة فقط. لا يمكن بيع كمية أكبر.`);
          return;
        }
        if (newQty === availableStock) {
          alert("🛎️ تنبيه: تم بيع آخر كمية متاحة. من فضلك، شيل شماعة الموديل.");
        }
    }
    
    setSelectionMap(prev => ({ ...prev, [productId]: newQty }));
  };

  const handleSelectAll = () => {
    const newMap: {[key: string]: number} = {};
    searchResults.forEach(p => { 
        const isSoldOut = p.status !== 'OPEN' && p.currentStock <= 0;
        if (!isSoldOut) {
            newMap[p.id] = 1; 
        }
    });
    setSelectionMap(newMap);
  };

  const handleAddToCart = () => {
    const selectedIds = Object.keys(selectionMap);
    if (selectedIds.length === 0) return;
    const selectedProducts = searchResults.filter(p => selectedIds.includes(p.id));

    let updatedCart = [...cart];

    selectedProducts.forEach(productToAdd => {
        const quantity = selectionMap[productToAdd.id] || 0;
        if (quantity === 0) return;

        const unitPrice = productToAdd.price;
        
        let existingItemIndex = updatedCart.findIndex(
            i => i.type === 'product' && i.modelNo === productToAdd.modelNo && i.unitPrice === unitPrice
        );

        if (existingItemIndex > -1) {
            const existingItem = { ...updatedCart[existingItemIndex] };
            let newVariants = [...existingItem.variants];
            const variantIndex = newVariants.findIndex(v => v.productId === productToAdd.id);

            if (variantIndex > -1) {
                newVariants[variantIndex].quantity += quantity;
            } else {
                newVariants.push({
                    productId: productToAdd.id,
                    quantity: quantity,
                    price: unitPrice,
                    color: productToAdd.color,
                    productDiscount: productToAdd.discount,
                });
            }
            
            existingItem.variants = newVariants;
            existingItem.totalQty = newVariants.reduce((sum, v) => sum + v.quantity, 0);
            updatedCart[existingItemIndex] = existingItem;

        } else {
            updatedCart.unshift({
                type: 'product',
                id: Date.now() + Math.random(),
                modelNo: productToAdd.modelNo,
                baseDescription: productToAdd.description,
                totalQty: quantity,
                unitPrice: unitPrice,
                variants: [{
                    productId: productToAdd.id,
                    quantity: quantity,
                    price: unitPrice,
                    color: productToAdd.color,
                    productDiscount: productToAdd.discount,
                }],
            });
        }
    });

    setCart(updatedCart);
    setSelectionMap({});
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleEditCartItem = (item: any) => {
    const resSel: {[key: string]: number} = {};
    item.variants.forEach((v: any) => { resSel[v.productId] = v.quantity; });
    setSelectionMap(resSel);
    setSearchTerm(item.modelNo);
    setCart(cart.filter(c => c.id !== item.id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddDiscount = (percent: number) => {
    setCart([{ type: 'discount', percent: percent, id: Date.now(), isAuto: false }, ...cart]);
    setShowDiscountOptions(false);
  };

  const handleApplyAutoProductDiscounts = () => {
    let newCart: any[] = [];
    cart.forEach(item => {
        if(item.type === 'product') {
            const autoPct = item.variants[0]?.productDiscount || 0;
            if(autoPct > 0) {
                newCart.push({ type: 'discount', percent: autoPct, id: Math.random(), isAuto: true });
                newCart.push(item);
                newCart.push({ type: 'discount', percent: 0, id: Math.random(), isAuto: true });
            } else { newCart.push(item); }
        } else if (item.type === 'discount' && !item.isAuto) { newCart.push(item); }
    });
    setCart(newCart);
    setShowDiscountOptions(false);
  };

  const getProcessedCart = () => {
      let processed: any[] = [];
      let activeDiscount = 0;
      cart.forEach(item => {
          if (item.type === 'discount') activeDiscount = item.percent;
          else {
              const discountedPrice = item.unitPrice * (1 - activeDiscount / 100);
              processed.push({
                  ...item, 
                  appliedDiscount: activeDiscount, 
                  finalPrice: discountedPrice, 
                  totalLinePrice: item.variants.reduce((sum: number, v: any) => sum + (v.quantity * discountedPrice), 0),
                  variants: item.variants.map((v: any) => ({ ...v, price: discountedPrice, discountPercent: activeDiscount }))
              });
          }
      });
      return processed; 
  };

  const handleUpdateOrder = async () => {
    setIsSaving(true);
    const processedItems = getProcessedCart();
    const currentTotal = processedItems.reduce((acc, item) => acc + item.totalLinePrice, 0);
    const depositVal = parseFloat(deposit) || 0;
    const voucherVal = parseFloat(voucherAmount) || 0;

    if (depositVal !== 0) {
      const splitsTotal = depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0);
      if (Math.abs(splitsTotal - depositVal) > 0.01) {
        alert(`⚠️ مجموع تقسيمات العربون (${splitsTotal.toFixed(2)}) لا يساوي قيمة العربون (${depositVal.toFixed(2)})!`);
        setIsSaving(false);
        return;
      }
      if (depositSplits.some(s => !s.safeId)) {
        alert("⚠️ يجب اختيار خزنة لكل تقسيمة!");
        setIsSaving(false);
        return;
      }
    }
    
    const result = await updateOrder(id, {
        customerId: selectedCustomer.id,
        items: processedItems,
        total: currentTotal,
        deposit: depositVal,
        depositSplits: depositVal !== 0 ? depositSplits.filter(s => s.amount !== 0) : [],
        voucherAmount: voucherVal,
        notes: notes,
        currency: order.currency
    });
    
    if (result.success) {
        // تحديث التاريخ إن كان المستخدم أدمن وقام بتغيير التاريخ
        if (canEditDate && orderDate && orderDate !== originalOrderDate) {
          const dateRes = await updateOrderDate(id, orderDate);
          if (!dateRes.success) {
            console.warn("تنبيه تحديث التاريخ:", dateRes.error);
          }
        }

        alert("تم تحديث الأوردر بنجاح ✅");
        router.push('/orders/list');
    } else {
        alert(`فشل التحديث: ${result.error}`);
        setIsSaving(false);
    }
  };

  const handleScan = (code: string) => {
      if (code) { setSearchTerm(code); setShowScanner(false); }
  };

  const handleItemPriceChange = (itemId: string, newPrice: number) => {
    setCart(cart.map(item => 
      (item.id === itemId && item.type === 'product')
        ? { ...item, unitPrice: newPrice }
        : item
    ));
  };

  if (loading) return <div className="p-10 text-center font-bold">جاري تحميل بيانات الأوردر...</div>;

  const processedDisplayCart = getProcessedCart(); 
  const currentTotal = processedDisplayCart.reduce((acc, i) => acc + i.totalLinePrice, 0);
  const depositVal = parseFloat(deposit) || 0;
  const voucherVal = parseFloat(voucherAmount) || 0;
  const displayRemaining = currentTotal - depositVal - voucherVal;

  const filteredDisplayList = cart.filter(item => {
      if (item.type === 'discount') return true;
      return item.modelNo.toLowerCase().includes(cartSearchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800" dir="rtl">
      <div className="bg-white p-4 shadow mb-4 sticky top-0 z-20 flex justify-between items-center border-b-4 border-yellow-500">
        <h2 className="font-bold text-lg">{step === 1 ? `✏️ تعديل أوردر #${order.orderNo}` : '💰 مراجعة الحساب'}</h2>
        {step === 2 && <button onClick={() => setStep(1)} className="text-sm text-blue-600 font-bold">تعديل الأصناف</button>}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {step === 1 && (
          <>
            <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100 relative">
              <label className="text-sm text-gray-500 font-bold block mb-2">تعديل العميل المختص:</label>
              <div className="relative">
                  <input 
                    type="text" 
                    placeholder="ابحث باسم العميل الجديد أو الهاتف..." 
                    value={customerSearchTerm} 
                    onChange={(e) => { 
                        setCustomerSearchTerm(e.target.value);
                        setShowCustomerList(true); 
                    }} 
                    onFocus={() => setShowCustomerList(true)} 
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-800" 
                  />
                  {isSearchingCustomer && <span className="absolute left-3 top-3 text-gray-400 text-xs">جاري البحث...</span>}
              </div>

              {showCustomerList && customerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border rounded-b-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                  {customerResults.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => { 
                          setSelectedCustomer(c); 
                          setCustomerSearchTerm(c.name); 
                          setShowCustomerList(false); 
                      }} 
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0"
                    >
                      <div className="font-bold text-gray-800">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.phone} | {c.code}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative mb-4 flex gap-2">
              <input type="text" placeholder="🔍 إضافة أصناف..." className="flex-1 p-4 border rounded-xl shadow-sm text-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <button onClick={() => setShowScanner(true)} className="bg-black text-white p-4 rounded-xl shadow-sm">📷</button>
            </div>

            {showScanner && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white rounded-xl overflow-hidden relative">
                        <button onClick={() => setShowScanner(false)} className="absolute top-2 right-2 bg-red-600 text-white w-8 h-8 rounded-full font-bold z-10">✕</button>
                        <Scanner onScan={(result) => { if(result && result.length > 0) handleScan(result[0].rawValue); }} />
                    </div>
                </div>
            )}

            {searchResults.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6 animate-in slide-in-from-top duration-300">
                 <div className="bg-gray-100 p-3 flex justify-between items-center border-b">
                  <span className="font-bold text-gray-700">الموديل: {searchResults[0]?.modelNo}</span>
                  <button onClick={handleSelectAll} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">تحديد الكل</button>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {searchResults.map(prod => {
                    const isSoldOut = prod.status !== 'OPEN' && prod.currentStock <= 0;
                    const isSelected = !!selectionMap[prod.id];
                    const qty = selectionMap[prod.id] || 1;

                    return (
                      <div key={prod.id} className={`p-4 flex items-center justify-between transition-colors ${isSoldOut ? 'bg-gray-100 opacity-60' : (isSelected ? 'bg-blue-50' : 'bg-white')}`}>
                        <div className="flex items-center gap-3 flex-1">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => toggleSelection(prod.id, e.target.checked)} 
                            disabled={isSoldOut}
                            className="w-6 h-6" 
                          />
                          <div className={isSoldOut ? 'line-through decoration-red-500 decoration-2' : ''}> 
                              <div className="font-bold">{prod.color}</div>
                              <div className="text-xs text-gray-500">{prod.price} ج.م | متاح: {prod.currentStock} قطعة</div>
                              {isSoldOut && <span className="text-[10px] text-red-600 font-bold block">نفذت الكمية</span>}
                          </div>
                        </div>
                        {isSelected && !isSoldOut && (
                          <div className="flex items-center gap-2 bg-white rounded-lg border px-2 py-1 shadow-sm">
                            <button onClick={() => updateQuantity(prod.id, qty + 1)} className="w-8 h-8 bg-gray-200 rounded font-bold">+</button>
                            <input type="number" value={qty} onChange={(e) => updateQuantity(prod.id, parseInt(e.target.value) || 1)} className="w-10 text-center font-bold outline-none" />
                            <button onClick={() => updateQuantity(prod.id, qty - 1)} className="w-8 h-8 bg-gray-200 rounded font-bold">-</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button onClick={handleAddToCart} className="w-full bg-black text-white py-4 font-bold text-lg">تحديث السلة 📥</button>
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-8">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-gray-700">محتويات الفاتورة</h3>
                    <div className="relative flex gap-2">
                        <button onClick={handleApplyAutoProductDiscounts} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold animate-pulse shadow">🏷️ خصم الموديلات</button>
                        <button onClick={() => setShowDiscountOptions(!showDiscountOptions)} className="bg-yellow-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow">+ خصم مخصص</button>
                        {showDiscountOptions && (
                            <div className="absolute top-full left-0 bg-white border rounded-lg shadow-xl z-20 w-48 mt-1 p-2 grid grid-cols-3 gap-2">
                                {[5, 10, 15, 20, 25, 30, 40, 50].map(p => (
                                    <button key={p} onClick={() => handleAddDiscount(p)} className="bg-gray-100 hover:bg-yellow-100 text-gray-800 text-xs font-bold py-2 rounded">{p}%</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="mb-4"><input type="text" placeholder="🔎 بحث داخل الفاتورة..." value={cartSearchTerm} onChange={(e) => setCartSearchTerm(e.target.value)} className="w-full p-3 border rounded-xl bg-white shadow-sm" /></div>
                <div className="space-y-3">
                  {filteredDisplayList.map((item) => {
                    if (item.type === 'discount') {
                        return (
                            <div key={item.id} className="bg-yellow-50 border-2 border-yellow-400 border-dashed p-3 rounded-lg flex justify-between items-center">
                                <div className="font-bold text-yellow-800">✂️ خصم {item.percent}% على ما يليه</div>
                                <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-red-500 font-bold bg-white px-2 rounded border">حذف</button>
                            </div>
                        );
                    }
                    const proc = processedDisplayCart.find((p:any) => p.id === item.id) || item;
                    return (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden transition-all hover:border-blue-200">
                            {proc.appliedDiscount > 0 && <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] px-2 py-1 rounded-br font-bold">خصم {proc.appliedDiscount}%</div>}
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="text-xl font-bold block">{item.modelNo}</span>
                                </div>
                                 <div className="text-left">
                                    <div className="flex items-center justify-end gap-2">
                                        <label htmlFor={`price-${item.id}`} className="text-xs font-bold text-gray-500">سعر القطعة:</label>
                                        <input
                                            id={`price-${item.id}`}
                                            type="number"
                                            value={item.unitPrice}
                                            onChange={(e) => handleItemPriceChange(item.id, parseFloat(e.target.value) || 0)}
                                            className="w-24 p-1 border rounded-lg text-center font-bold text-gray-800 bg-yellow-50 focus:ring-2 focus:ring-yellow-400"
                                        />
                                    </div>
                                    <div className="text-left font-bold text-green-700 mt-1 text-lg">
                                        {proc.appliedDiscount > 0 && <div className="text-xs text-gray-400 line-through">{(item.unitPrice * proc.totalQty).toFixed(0)} ج.م</div>}
                                        <span>الإجمالي: {proc.totalLinePrice?.toFixed(0)} ج.م</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2 border border-gray-200 flex flex-wrap gap-1">
                                {item.variants.map((v:any, i:number) => (
                                    <span key={i} className="inline-block bg-white px-2 py-1 rounded border text-[10px]">{v.quantity} ({v.color})</span>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t">
                                <span className="text-xs font-bold text-gray-500">الإجمالي: {proc.totalQty} قطعة</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditCartItem(item)} className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded font-bold">تعديل ✏️</button>
                                    <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded font-bold">حذف 🗑️</button>
                                </div>
                            </div>
                        </div>
                    );
                  })}
                </div>
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-30 shadow-2xl">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <div><span className="text-gray-500 text-xs block">إجمالي التعديل</span><span className="text-xl font-black text-green-700">{currentTotal.toFixed(0)} ج.م</span></div>
                        <button onClick={() => setStep(2)} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg">مراجعة وحفظ ➔</button>
                    </div>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl shadow-lg p-6 animate-fade-in">
            <h3 className="text-center font-bold text-xl mb-6 border-b pb-4">مراجعة الحساب قبل الحفظ</h3>

            <div className="bg-slate-900 text-white p-5 rounded-2xl mb-6 shadow-md">
               <div className="flex justify-between text-lg mb-4 border-b border-slate-700 pb-2"><span>صافي الفاتورة:</span><span className="font-bold text-yellow-400 text-2xl">{currentTotal.toFixed(2)}</span></div>
               
               {/* 📅 تعديل تاريخ الأوردر (متاح للإدارة/الأدمن فقط ومقفل للموظف) */}
               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-slate-400 text-sm font-bold">📅 تاريخ الأوردر / الفاتورة:</label>
                    {canEditDate ? (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                        صلاحية أدمن ⚙️
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-bold">
                        🔒 خاص بالإدارة فقط
                      </span>
                    )}
                  </div>
                  <input 
                    type="date" 
                    value={orderDate}
                    disabled={!canEditDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-slate-800 text-white font-bold text-lg outline-none border border-slate-700 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition" 
                  />
                  {!canEditDate && (
                    <p className="text-[11px] text-slate-500 mt-1">تعديل تاريخ الأوردر مقتصر على المدير وصاحب العمل.</p>
                  )}
               </div>

               <div className="mb-4">
                  <label className="block text-slate-400 text-sm mb-2 font-bold">💵 العربون / المدفوع:</label>
                  <input 
                    type="number" 
                    value={deposit}
                    onChange={(e) => handleDepositChange(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-800 text-white font-bold text-2xl outline-none" 
                  />
               </div>

               {depositVal !== 0 && (
                  <div className="mb-4 animate-in slide-in-from-top duration-300">
                     <div className="flex justify-between items-center mb-2">
                        <label className="block text-yellow-400 text-sm font-bold">
                           {depositVal > 0 ? '📥 تقسيم العربون على الخزنات' : '📤 تحديد خزنة الصرف'}:
                        </label>
                        <button 
                          type="button"
                          onClick={() => setDepositSplits([...depositSplits, { safeId: safes[0]?.id || '', amount: 0 }])}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-blue-700"
                        >
                          + إضافة خزنة
                        </button>
                     </div>
                     <div className="space-y-2">
                        {depositSplits.map((split, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <select 
                              value={split.safeId} 
                              onChange={(e) => {
                                const newSplits = [...depositSplits];
                                newSplits[idx] = { ...newSplits[idx], safeId: e.target.value };
                                setDepositSplits(newSplits);
                              }}
                              className="flex-1 p-3 rounded-xl bg-slate-800 text-white font-bold text-sm border border-slate-700"
                            >
                              {safes.map(safe => (<option key={safe.id} value={safe.id}>{safe.name}</option>))}
                            </select>
                            <input 
                              type="number" 
                              value={split.amount || ''}
                              onChange={(e) => {
                                const newSplits = [...depositSplits];
                                const newAmount = parseFloat(e.target.value) || 0;
                                newSplits[idx] = { ...newSplits[idx], amount: newAmount };
                                setDepositSplits(newSplits);
                              }}
                              className="w-28 p-3 rounded-xl bg-slate-800 text-white font-bold text-lg border border-slate-700 text-center"
                            />
                            {depositSplits.length > 1 && (
                              <button 
                                type="button"
                                onClick={() => setDepositSplits(depositSplits.filter((_, i) => i !== idx))}
                                className="bg-red-600 text-white w-10 h-10 rounded-xl font-bold hover:bg-red-700"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                     </div>
                     <div className="mt-2 text-xs text-slate-400 flex justify-between">
                       <span>المجموع الموزع: {depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0).toFixed(2)}</span>
                       <span className={Math.abs(depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0) - depositVal) > 0.01 ? 'text-red-400 font-bold' : 'text-green-400'}>
                         المتبقي للتوزيع: {(depositVal - depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0)).toFixed(2)}
                       </span>
                     </div>
                  </div>
               )}

               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-slate-400 text-sm font-bold">🎟️ قسيمة مشتريات (خصم ظاهري):</label>
                    <button 
                      type="button"
                      onClick={() => { setShowVoucherInput(!showVoucherInput); if (showVoucherInput) setVoucherAmount(''); }}
                      className={`text-xs px-3 py-1 rounded-lg font-bold ${showVoucherInput ? 'bg-red-600 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                    >
                      {showVoucherInput ? '✕ إلغاء' : '+ إضافة قسيمة'}
                    </button>
                  </div>
                  {showVoucherInput && (
                    <div className="animate-in slide-in-from-top duration-300">
                      <input 
                        type="number" 
                        value={voucherAmount}
                        onChange={(e) => setVoucherAmount(e.target.value)}
                        className="w-full p-4 rounded-xl bg-purple-900/30 text-white font-bold text-2xl outline-none border-2 border-purple-500 focus:border-purple-400"
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-slate-400 text-sm mb-1 font-bold">ملحوظة الفاتورة</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 rounded-xl bg-slate-800 text-white font-bold outline-none border border-slate-700" placeholder="اكتب هنا أي ملاحظات إضافية..."></textarea>
               </div>

               <div className="space-y-2 pt-4 border-t border-slate-700">
                  <div className="flex justify-between text-base font-bold text-slate-300">
                    <span>المتبقي الفعلي (على العميل):</span>
                    <span className="text-red-400">{(currentTotal - depositVal).toFixed(2)}</span>
                  </div>
                  {voucherVal > 0 && (
                    <div className="flex justify-between text-base font-bold text-purple-300">
                      <span>قسيمة المشتريات (ظاهري):</span>
                      <span>- {voucherVal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-yellow-400">
                    <span>المطلوب تحصيله الآن:</span>
                    <span>{displayRemaining.toFixed(2)}</span>
                  </div>
                </div>
            </div>

            <button 
                onClick={handleUpdateOrder} 
                disabled={isSaving}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition-all disabled:bg-gray-400 disabled:animate-pulse"
            >
                {isSaving ? 'جاري الحفظ...' : 'تأكيد الحفظ ✅'}
            </button>
            <button onClick={() => setStep(1)} className="w-full mt-4 text-gray-500 font-bold py-2">العودة للتعديل</button>
          </div>
        )}
      </div>
    </div>
  );
}