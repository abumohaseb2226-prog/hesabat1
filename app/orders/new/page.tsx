'use client'

import { useState, useEffect, useRef, useMemo } from 'react';
import { getCustomers, getProductsForSearch, createOrder, getSafes, searchCustomers, checkCustomerPhone } from '@/app/actions';
import { addCustomer } from '@/app/admin-actions'; 
import { getWarehouses } from '@/app/warehouse-management-actions';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { Scanner } from '@yudiel/react-qr-scanner';
import Link from 'next/link';

interface Product {
  id: string;
  modelNo: string;
  color: string;
  price: number;
  currentStock: number;
  status: string;
  description: string;
  discount: number;
}

interface Safe {
  id: string;
  name: string;
}

export default function NewOrderPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  
  const [step, setStep] = useState(1);
  const [safes, setSafes] = useState<Safe[]>([]);

  // المخازن وتحديد مخزن الصرف
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const customerListRef = useRef<HTMLDivElement>(null);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', phone2: '', code: '', address: '' });
  const [isSavingCust, setIsSavingCust] = useState(false);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectionMap, setSelectionMap] = useState<{[key: string]: number | string}>({});

  const [cart, setCart] = useState<any[]>([]);
  const [cartSearchTerm, setCartSearchTerm] = useState('');
  const [deposit, setDeposit] = useState<string>('');
  const [currency, setCurrency] = useState('EGP'); 
  const [depositSplits, setDepositSplits] = useState<Array<{safeId: string, amount: number}>>([]);
  const [voucherAmount, setVoucherAmount] = useState<string>('');
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [notes, setNotes] = useState('');
  
  const [failedItems, setFailedItems] = useState<any[]>([]);
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);

  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const [showDiscountOptions, setShowDiscountOptions] = useState(false);
  const [orderDate, setOrderDate] = useState(new Date());

  const handleDepositChange = (value: string) => {
    setDeposit(value);
    const depositVal = parseFloat(value) || 0;

    if (depositVal !== 0) {
        if (depositSplits.length === 0 && safes.length > 0) {
            const mainSafe = safes.find(s => s.name === 'الخزنة الرئيسية') || safes[0];
            setDepositSplits([{ safeId: mainSafe.id, amount: depositVal }]);
        } else if (depositSplits.length === 1) {
            setDepositSplits(splits => [{ ...splits[0], amount: depositVal }]);
        } else {
            const otherSplitsTotal = depositSplits.slice(1).reduce((sum, s) => sum + (s.amount || 0), 0);
            const remainingForFirst = depositVal - otherSplitsTotal;
            setDepositSplits(splits => [{ ...splits[0], amount: remainingForFirst }, ...splits.slice(1)]);
        }
    } else {
        if (depositSplits.length > 0) {
            setDepositSplits(splits => splits.map(s => ({ ...s, amount: 0 })));
        }
    }
  };

  useEffect(() => {
    const isDirty = cart.length > 0 && !isSavingOrder;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'لديك تغييرات غير محفوظة. هل أنت متأكد أنك تريد المغادرة؟';
    };

    const handlePopState = () => {
        if (window.confirm("لديك أصناف في السلة لم يتم حفظها. هل تريد الخروج وتجاهل التغييرات؟")) {
            window.removeEventListener('popstate', handlePopState);
            router.back();
        } else {
            history.pushState(null, '', pathname);
        }
    };

    if (isDirty) {
      history.pushState(null, '', pathname);
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cart.length, isSavingOrder, pathname, router]);

  useEffect(() => {
    getCustomers().then(setCustomerResults);
    
    getSafes().then((data: Safe[]) => {
      setSafes(data);
      if (data.length > 0) {
        const mainSafe = data.find(safe => safe.name === 'الخزنة الرئيسية');
        const defaultSafeId = mainSafe?.id || data[0].id;
        setDepositSplits([{ safeId: defaultSafeId, amount: 0 }]);
      }
    });

    // جلب المخازن وتعيين المخزن الرئيسي افتراضياً
    getWarehouses().then((resWh: any) => {
      if (resWh?.success && resWh.warehouses) {
        setWarehouses(resWh.warehouses);
        const defaultWh = resWh.warehouses.find((w: any) => w.isDefault) || resWh.warehouses[0];
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id);
        }
      }
    });
    
    getProductsForSearch().then(products => {
        setAllProducts(products);
        setIsProductsLoading(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (customerListRef.current && !customerListRef.current.contains(event.target as Node)) {
        setShowCustomerList(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isProductsLoading) {
      return; 
    }

    const bulkDataString = sessionStorage.getItem('bulkOrderData');
    if (!bulkDataString) {
      return; 
    }

    try {
      const bulkData = JSON.parse(bulkDataString);

      // 1. العميل
      if (bulkData.customer) {
        setSelectedCustomer(bulkData.customer);
        setCustomerSearchTerm(bulkData.customer.name);
      }

      // 2. المخزن المستلم من الإكسيل إن وجد
      if (bulkData.warehouseId) {
        setSelectedWarehouseId(bulkData.warehouseId);
      }

      // 3. الأصناف
      if (bulkData.items && Array.isArray(bulkData.items) && bulkData.items.length > 0) {
        const groupedItems = bulkData.items.reduce((acc: any, item: any) => {
          const modelNo = item.modelNo;
          if (!acc[modelNo]) {
            const productInfo = allProducts.find(p => p.modelNo === modelNo);
            acc[modelNo] = {
              type: 'product',
              id: `bulk-${modelNo}-${Date.now()}`,
              modelNo: modelNo,
              baseDescription: productInfo?.description || '',
              unitPrice: item.price,
              variants: [],
              totalQty: 0
            };
          }

          acc[modelNo].variants.push({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            color: item.color,
            productDiscount: item.discountPercent || 0
          });

          acc[modelNo].totalQty += item.quantity;
          
          return acc;
        }, {});

        const newCart = Object.values(groupedItems);
        
        if (newCart.length > 0) {
          setCart(newCart as any);
          alert('تم تحميل الأصناف من الملف بنجاح!');
        }
      }
    } catch (error) {
      console.error("Error processing bulk data from sessionStorage:", error);
      alert("حدث خطأ أثناء معالجة بيانات الفاتورة المجمعة.");
    } finally {
      sessionStorage.removeItem('bulkOrderData');
    }
  }, [isProductsLoading, allProducts]);

  useEffect(() => {
      const delayDebounceFn = setTimeout(async () => {
        if (customerSearchTerm.length > 0) {
            setIsSearchingCustomer(true);
            const results = await searchCustomers(customerSearchTerm);
            setCustomerResults(results);
            setIsSearchingCustomer(false);
        } else {
             getCustomers().then(setCustomerResults);
        }
      }, 300);
      return () => clearTimeout(delayDebounceFn);
  }, [customerSearchTerm]);

  const searchResults = useMemo(() => {
    if (searchTerm.length < 1) return []
    const lowerCaseSearchTerm = searchTerm.toLowerCase()
  
    const results = allProducts.filter(p => 
      p.modelNo.toLowerCase().includes(lowerCaseSearchTerm)
    )
  
    return results.sort((a, b) => {
      const aExact = a.modelNo.toLowerCase() === lowerCaseSearchTerm ? 1 : 0
      const bExact = b.modelNo.toLowerCase() === lowerCaseSearchTerm ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      const aStartsWith = a.modelNo.toLowerCase().startsWith(lowerCaseSearchTerm) ? 1 : 0
      const bStartsWith = b.modelNo.toLowerCase().startsWith(lowerCaseSearchTerm) ? 1 : 0
      if (aStartsWith !== bStartsWith) return bStartsWith - aStartsWith
      return a.modelNo.localeCompare(b.modelNo)
    })
  }, [searchTerm, allProducts])

  const groupedSearchResults = useMemo(() => {
    if (searchResults.length === 0) return {};
    return searchResults.reduce((acc, product) => {
        if (!acc[product.modelNo]) {
            acc[product.modelNo] = [];
        }
        acc[product.modelNo].push(product);
        return acc;
    }, {} as { [key: string]: Product[] });
  }, [searchResults])

  const uniqueModelNos = useMemo(() => {
    return Array.from(new Set(searchResults.map(p => p.modelNo)))
  }, [searchResults])

  const updateQuantity = (productId: string, newQty: number) => {
    if (isNaN(newQty)) return;

    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    if (newQty > 0 && product.status === 'CLOSED') {
        const availableStock = product.currentStock;
        if (newQty > availableStock) {
            alert(`الكمية المتاحة من هذا الصنف المغلق هي ${availableStock} قطعة فقط. لا يمكن بيع كمية أكبر.`);
            return;
        }
        if (newQty === availableStock) {
            alert("🛎️ تنبيه: تم بيع آخر كمية متاحة. من فضلك، شيل شماعة الموديل.");
        }
    }

    const currentQty = selectionMap[productId];
    if (newQty < 0 && (!currentQty || Number(currentQty) > 0)) {
        const confirmReturn = window.confirm(
            `⚠️ أنت تدخل كمية سالبة (${newQty})\n\nهذا سيُعتبر مرتجع وسيخصم من إجمالي الفاتورة.\n\nهل تريد الاستمرار؟`
        );
        if (!confirmReturn) return;
    }

    setSelectionMap(prev => ({ ...prev, [productId]: newQty }));
  };
  
  const handleQuantityInput = (productId: string, value: string) => {
    if (value === '-' || value === '') {
      setSelectionMap(prev => ({ ...prev, [productId]: value }));
      return;
    }
    const num = parseInt(value, 10);
    if (isNaN(num)) {
        return; 
    }
    updateQuantity(productId, num);
  };

  const handleAddItemToCart = (productToAdd: Product, quantity: number) => {
    if (!productToAdd || quantity === 0) return true;

    if (quantity > 0 && productToAdd.status === 'CLOSED') {
        const availableStock = productToAdd.currentStock;
        if (quantity > availableStock) {
            alert(`الكمية المتاحة من هذا الصنف المغلق هي ${availableStock} قطعة فقط.`);
            return false;
        }
        if (quantity === availableStock) {
            alert("🛎️ تنبيه: تم بيع آخر كمية متاحة. من فضلك، شيل شماعة الموديل.");
        }
    }

    setCart(currentCart => {
        let updatedCart = [...currentCart];
        const existingItemIndex = updatedCart.findIndex(i => i.modelNo === productToAdd.modelNo && i.type === 'product');

        if (existingItemIndex > -1) {
            const existingItem = { ...updatedCart[existingItemIndex] };
            let newVariants = [...existingItem.variants];
            const variantIndex = newVariants.findIndex(v => v.productId === productToAdd.id);

            if (variantIndex > -1) {
                newVariants[variantIndex] = { ...newVariants[variantIndex], quantity: newVariants[variantIndex].quantity + quantity };
            } else {
                newVariants.push({ productId: productToAdd.id, quantity, price: productToAdd.price, color: productToAdd.color, productDiscount: productToAdd.discount });
            }

            existingItem.variants = newVariants.filter(v => v.quantity !== 0);

            if (existingItem.variants.length === 0) {
                updatedCart.splice(existingItemIndex, 1);
            } else {
                existingItem.totalQty = existingItem.variants.reduce((sum: number, v: { quantity: number }) => sum + v.quantity, 0);
                updatedCart[existingItemIndex] = existingItem;
            }
        } else {
            updatedCart.unshift({
                type: 'product', id: Date.now() + Math.random(), modelNo: productToAdd.modelNo,
                baseDescription: productToAdd.description, totalQty: quantity,
                unitPrice: productToAdd.price,
                variants: [{ productId: productToAdd.id, quantity, price: productToAdd.price, color: productToAdd.color, productDiscount: productToAdd.discount }],
            });
        }
        return updatedCart;
    });

    setSelectionMap(prev => {
        const newMap = {...prev};
        delete newMap[productToAdd.id];
        return newMap;
    });

    if (failedItems.length > 0) setFailedItems([]);
    setShowOnlyFailed(false);
    setSearchTerm(''); 
    return true;
  };

  const handleAddDiscount = (percent: number) => {
      if (cart.length > 0 && cart[0].type === 'discount') {
          alert("يوجد خصم مضاف بالفعل في البداية");
          return;
      }
      setCart([{ type: 'discount', percent: percent, id: Date.now(), isAuto: false }, ...cart]);
      setShowDiscountOptions(false);
  };

  const handleItemPriceChange = (itemId: string, newPrice: number) => {
    setCart(cart.map(item => 
      (item.id === itemId && item.type === 'product')
        ? { ...item, unitPrice: newPrice }
        : item
    ));
  };

  const handleApplyAutoProductDiscounts = () => {
    let newCart: any[] = [];
    cart.forEach(item => {
        if(item.type === 'product') {
            const autoPct = item.variants[0]?.productDiscount || 0;
            if(autoPct > 0) {
                newCart.push({ type: 'discount', percent: autoPct, id: 'auto-' + Math.random(), isAuto: true });
                newCart.push(item);
                newCart.push({ type: 'discount', percent: 0, id: 'reset-' + Math.random(), isAuto: true });
            } else {
                newCart.push(item);
            }
        } else if (item.type === 'discount' && !item.isAuto) {
            newCart.push(item);
        }
    });
    setCart(newCart);
    alert("تم تطبيق خصومات الموديلات الموسمية بنجاح ✅");
    setShowDiscountOptions(false);
  };

  const handleEditItem = async (item: any) => {
    if (item.type === 'discount') return;

    setCart(cart => cart.filter(c => c.id !== item.id));

    const restoredSelection: {[key: string]: number} = {};
    item.variants.forEach((v: any) => {
        restoredSelection[v.productId] = v.quantity;
    });
    setSelectionMap(prev => ({...prev, ...restoredSelection}));

    setSearchTerm(item.modelNo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    productSearchInputRef.current?.focus();
  };

  const handleScan = (code: string) => {
      if (code) { setSearchTerm(code); setShowScanner(false); }
  };

  const getProcessedCart = () => {
      let processedItems: any[] = [];
      let activeDiscount = 0;
      cart.forEach(item => {
          if (item.type === 'discount') activeDiscount = item.percent;
          else {
              const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
              const discountedPrice = unitPrice * (1 - activeDiscount / 100);
              const totalPrice = item.variants.reduce((sum: number, v: { quantity: number }) => sum + (v.quantity * discountedPrice), 0);
              processedItems.push({
                  ...item, unitPrice, appliedDiscount: activeDiscount, finalPrice: discountedPrice, totalLinePrice: totalPrice,
                  variants: item.variants.map((v: any) => ({ ...v, price: discountedPrice, discountPercent: activeDiscount }))
              });
          }
      });
      return processedItems; 
  };

  const handleSaveOrder = async () => {
    if(!session?.user) return;

    if (!selectedWarehouseId) {
      alert("يرجى اختيار مخزن الصرف / التسليم للأوردر!");
      return;
    }
    
    const cleanCart = getProcessedCart();
    const total = cleanCart.reduce((acc, item) => acc + item.totalLinePrice, 0);
    const userId = session.user.image as string; 
    const depositVal = parseFloat(deposit) || 0;
    const voucherVal = parseFloat(voucherAmount) || 0;
    const hasReturnItems = cleanCart.some(item =>
      item.variants.some((v: any) => v.quantity < 0)
    );
    
    if (!userId) { alert("خطأ هوية"); return; }
    
    if (depositVal !== 0) {
      const splitsTotal = depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0);
      if (Math.abs(splitsTotal - depositVal) > 0.01) {
        const amountType = depositVal > 0 ? 'العربون' : 'المبلغ المرتجع';
        alert(`⚠️ مجموع تقسيمات المبلغ (${splitsTotal.toFixed(2)}) لا يساوي قيمة ${amountType} (${depositVal.toFixed(2)})!`);
        return;
      }
      if (depositSplits.some(s => !s.safeId)) {
        alert("⚠️ يجب اختيار خزنة لكل تقسيمة!");
        return;
      }
    }
    
    setIsSavingOrder(true); 
    setFailedItems([]);
    setShowOnlyFailed(false);

    try {
        const result = await createOrder({
          customerId: selectedCustomer.id,
          warehouseId: selectedWarehouseId, // 👈 تمرير مخزن الصرف المختار
          items: cleanCart, 
          total, 
          deposit: depositVal, 
          depositSplits: depositVal !== 0 ? depositSplits.filter(s => s.amount !== 0) : [],
          voucherAmount: voucherVal,
          currency: currency,
          notes: hasReturnItems ? `${notes ? notes + ' | ' : ''}يحتوي على مرتجع (كميات سالبة)` : notes,
          createdAt: orderDate
        }, userId);

        if (result.success && result.data?.id) {
            router.push(`/orders/${result.data.id}/print`);
        } else {
             if (result.insufficientStockItems) {
                setFailedItems(result.insufficientStockItems);
                setStep(1);
                setShowOnlyFailed(true);
                alert('🚨 توجد أصناف غير متاحة! يرجى مراجعة السلة وتعديلها.');
            } else {
                alert(result.error || "حدث خطأ أثناء حفظ الأوردر.");
            }
            setIsSavingOrder(false); 
        }
    } catch (error) {
        console.error(error);
        alert("حدث خطأ غير متوقع أثناء الاتصال بالسيرفر.");
        setIsSavingOrder(false);
    }
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newCust.name) return alert('الاسم مطلوب');
      
      setIsSavingCust(true);

      if (newCust.phone || newCust.phone2) {
          const checkRes = await checkCustomerPhone(newCust.phone || newCust.phone2);
          if (checkRes.exists) {
              const confirmMsg = `⚠️ تنبيه: رقم الهاتف هذا مسجل مسبقاً للعميل:\n\n👤 ${checkRes.name}\n\nهل تريد الاستمرار وإضافة هذا العميل الجديد بنفس الرقم؟`;
              if (!window.confirm(confirmMsg)) {
                  setIsSavingCust(false);
                  return;
              }
          }
      }

      const res = await addCustomer({ ...newCust, source: 'QUICK' });
      
      if (res.warning) {
          setIsSavingCust(false);
          if (confirm(`رقم الهاتف هذا مسجل مسبقاً باسم العميل: (${res.existingName}).\nهل تريد الاستمرار في الإضافة على أي حال؟`)) {
              setIsSavingCust(true);
              const resForce = await addCustomer({ ...newCust, source: 'QUICK', force: true });
              if (resForce.success) {
                  setSelectedCustomer(resForce.customer);
                  setCustomerSearchTerm(resForce.customer.name);
                  setIsQuickAddOpen(false);
                  setNewCust({ name: '', phone: '', phone2: '', code: '', address: '' });
              } else {
                  alert("خطأ: " + resForce.error);
              }
              setIsSavingCust(false);
          }
          return;
      }

      if(res.success) {
          setSelectedCustomer(res.customer);
          setCustomerSearchTerm(res.customer.name);
          setIsQuickAddOpen(false);
          setNewCust({ name: '', phone: '', phone2: '', code: '', address: '' });
      } else {
          alert("خطأ: " + res.error);
      }
      setIsSavingCust(false);
  };
  
  const handleHomeClick = () => {
    if (cart.length > 0) {
      if (window.confirm("لديك أصناف في السلة لم يتم حفظها. هل تريد الخروج وتجاهل التغييرات؟")) {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  };

  const processedDisplayCart = getProcessedCart(); 
  const currentTotal = processedDisplayCart.reduce((acc, i) => acc + i.totalLinePrice, 0);
  const depositVal = parseFloat(deposit) || 0;
  const voucherVal = parseFloat(voucherAmount) || 0;
  const displayRemaining = currentTotal - depositVal - voucherVal;
  
  const failedProductIds = new Set(failedItems.map(f => f.productId));
  
  const filteredDisplayList = cart.filter(item => {
      if (item.type === 'discount') return !showOnlyFailed;
      
      const hasFailedVariant = item.variants.some((v: any) => failedProductIds.has(v.productId));
      if (showOnlyFailed) {
          return hasFailedVariant;
      }
      
      return item.modelNo.toLowerCase().includes(cartSearchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-800" dir="rtl">
      <div className="bg-white p-4 shadow mb-4 sticky top-0 z-20 flex justify-between items-center">
      <button onClick={handleHomeClick} className="text-sm text-blue-600 font-bold flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
        الرئيسية
      </button>
        <h2 className="font-bold text-lg">{step === 1 ? '🛒 أوردر جديد' : '💰 الدفع والحفظ'}</h2>
        {step === 2 && <button onClick={() => setStep(1)} className="text-sm text-blue-600 font-bold">تعديل الأصناف</button>}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {step === 1 && (
          <>
            {/* الصف العلوي: كارت العميل + كارت مخزن الصرف والتسليم جنباً إلى جنب */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              
              {/* 1. كارت اختيار العميل */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative" ref={customerListRef}>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-gray-500 font-bold">العميل</label>
                  <button onClick={() => setIsQuickAddOpen(true)} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-bold">➕ عميل جديد</button>
                </div>
                <div className="relative">
                    <input 
                      type="text" 
                      placeholder="ابحث باسم العميل أو الهاتف..." 
                      value={customerSearchTerm} 
                      onChange={(e) => { 
                          setCustomerSearchTerm(e.target.value); 
                          setShowCustomerList(true); 
                          if (e.target.value === '') setSelectedCustomer(null); 
                      }} 
                      onFocus={() => setShowCustomerList(true)} 
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" 
                    />
                    {isSearchingCustomer && <span className="absolute left-3 top-3 text-gray-400 text-xs">جاري البحث...</span>}
                </div>

                {showCustomerList && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-b-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                    {customerResults.length > 0 ? (
                        customerResults.map(c => (
                          <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearchTerm(c.name); setShowCustomerList(false); }} 
                               className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 ${c.source === 'QUICK' ? 'bg-purple-50' : ''}`}>
                            <div className="font-bold flex justify-between items-center">
                                <span>{c.name}</span>
                                {c.source === 'QUICK' && <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded shadow-sm">جديد ✨</span>}
                            </div>
                            <div className="text-xs text-gray-500">{c.phone} | {c.code}</div>
                          </div>
                        ))
                    ) : (
                        <div className="p-3 text-center text-gray-500 text-xs">لا توجد نتائج (اضغط عميل جديد للإضافة)</div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. كارت اختيار مخزن الصرف / التسليم (المطلوب) */}
              <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-cyan-300 relative flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-black text-cyan-950 flex items-center gap-1.5">
                    <span>🏢</span>
                    <span>مخزن الصرف / التسليم *</span>
                  </label>
                  <span className="text-[10px] bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full font-bold">
                    الافتراضي: الرئيسي
                  </span>
                </div>

                <div>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full p-3 border-2 border-cyan-400 rounded-lg font-bold text-gray-800 bg-cyan-50/40 outline-none focus:border-cyan-600 cursor-pointer text-sm"
                  >
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} {wh.isDefault ? '⭐ (المخزن الرئيسي)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-2 px-1 leading-tight">
                    سيتم خصم كميات الأوردر من رصيد هذا المخزن تحديداً.
                  </p>
                </div>
              </div>

            </div>

            {selectedCustomer && (
              <div className="animate-fade-in">
                 {showScanner && (
                    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
                        <div className="w-full max-w-sm bg-white rounded-xl overflow-hidden relative">
                            <button onClick={() => setShowScanner(false)} className="absolute top-2 right-2 bg-red-600 text-white w-8 h-8 rounded-full font-bold z-10">X</button>
                            
                            <Scanner onScan={(result) => { if(result && result.length > 0) handleScan(result[0].rawValue); }} />
                            
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-60 h-60 border-4 border-dashed border-white rounded-xl"></div>
                            </div>
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-center text-xs w-full px-4">
                                ضع الكود داخل الإطار لتركيز أفضل
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="relative mb-4 flex gap-2">
                  <input ref={productSearchInputRef} type="text" placeholder={isProductsLoading ? "جاري تحميل قائمة الأصناف..." : "🔍 ابحث برقم الموديل..."} className="flex-1 p-4 pl-12 border rounded-xl shadow-sm text-lg focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus disabled={isProductsLoading} />
                  <button onClick={() => setShowScanner(true)} className="bg-black text-white p-4 rounded-xl shadow-sm md:hidden">📷</button>
                </div>

                {uniqueModelNos.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
                    <div className="bg-gray-100 p-3 flex justify-between items-center border-b">
                      <span className="font-bold text-gray-700">
                        🔍 النتائج ({uniqueModelNos.length} موديل)
                      </span>
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                      {uniqueModelNos.map((modelNo) => {
                        const products = groupedSearchResults[modelNo] || []
                        const totalStock = products.reduce((sum, p) => sum + p.currentStock, 0)
                        const minPrice = Math.min(...products.map(p => p.price))
                        const maxPrice = Math.max(...products.map(p => p.price))
                        
                        return (
                          <div key={modelNo} className="p-4 hover:bg-blue-50 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="text-xl font-black text-blue-700">{modelNo}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {products.length} لون | إجمالي: {totalStock} قطعة
                                  {minPrice !== maxPrice 
                                    ? ` | ${minPrice} - ${maxPrice} ج.م`
                                    : ` | ${minPrice} ج.م`
                                  }
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              {products.map(prod => {
                                const isSoldOut = prod.status !== 'OPEN' && prod.currentStock <= 0
                                const availableStock = prod.currentStock
                                const isLastOne = availableStock === 1 && prod.status === 'CLOSED'
                                const qty = selectionMap[prod.id];
                                
                                return (
                                  <div 
                                    key={prod.id} 
                                    className={`p-3 flex items-center justify-between rounded-lg transition-colors ${isSoldOut ? 'bg-gray-100 opacity-60' : 'bg-white border border-gray-100'} ${isLastOne ? 'bg-red-50' : ''}`}
                                  >
                                    <div className={isSoldOut ? 'line-through decoration-red-500 decoration-2' : ''}> 
                                      <div className={`font-bold ${isLastOne ? 'text-red-700' : ''} ${Number(qty) < 0 ? 'text-red-600' : ''}`}>
                                        {Number(qty) < 0 && <span className="text-xs bg-red-100 text-red-700 px-1 rounded mr-1">مرتجع</span>}
                                        {prod.color}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {prod.price} ج.م | متاح: {availableStock}
                                      </div>
                                      {prod.discount > 0 && (
                                        <div className="text-[10px] text-red-600 font-bold">
                                          خصم صنف: {prod.discount}%
                                        </div>
                                      )}
                                      {isLastOne && (
                                        <div className="text-red-700 text-xs font-bold animate-pulse mt-1">
                                          🔥 آخر قطعة!
                                        </div>
                                      )}
                                      {isSoldOut && (
                                        <span className="text-[10px] text-red-600 font-bold block">
                                          نفذت الكمية
                                        </span>
                                      )}
                                    </div>
                                    {!isSoldOut && (
                                      <div className="flex items-center gap-1 bg-white rounded-lg border px-1 py-1 shadow-sm">
                                        <button onClick={() => updateQuantity(prod.id, (Number(qty) || 0) - 1)} className="w-7 h-7 bg-gray-200 rounded font-bold text-lg hover:bg-gray-300" title="تقليل">-</button>
                                        <input 
                                          type="text"
                                          value={qty ?? ''}
                                          onChange={(e) => handleQuantityInput(prod.id, e.target.value)}
                                          className="w-12 text-center font-bold outline-none text-sm border-y-0 border-x"
                                          placeholder="1"
                                        />
                                        <button onClick={() => updateQuantity(prod.id, (Number(qty) || 0) + 1)} className="w-7 h-7 bg-gray-200 rounded font-bold text-lg hover:bg-gray-300" title="زيادة">+</button>
                                        <button 
                                          onClick={() => {
                                            const qtyToAdd = (typeof qty === 'number' && qty !== 0) ? qty : 1;
                                            handleAddItemToCart(prod, qtyToAdd as number);
                                          }}
                                          className="w-12 h-7 bg-blue-600 text-white rounded font-bold text-xs hover:bg-blue-700 mr-1"
                                          title="إضافة للسلة"
                                        >
                                          إضافة
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-8 animate-fade-in">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-gray-700 text-lg">محتويات السلة</h3>
                     <div className="relative flex gap-2">
                        {failedItems.length > 0 && (
                            <button 
                                onClick={() => setShowOnlyFailed(!showOnlyFailed)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold shadow animate-pulse ${showOnlyFailed ? 'bg-yellow-500 text-white' : 'bg-red-600 text-white'}`}>
                                {showOnlyFailed ? 'عرض كل السلة' : `🚨 عرض الأصناف المتعذرة (${failedItems.length})`}
                            </button>
                        )}
                        <button onClick={handleApplyAutoProductDiscounts} className="bg-red-600 text-white px-3 py-1 rounded-lg text-[10px] md:text-sm font-bold shadow hover:bg-red-700">🏷️ خصم الموديلات</button>
                        <button onClick={() => setShowDiscountOptions(!showDiscountOptions)} className="bg-yellow-500 text-white px-3 py-1 rounded-lg text-[10px] md:text-sm font-bold shadow hover:bg-yellow-600">+ خصم مخصص</button>
                        {showDiscountOptions && (
                            <div className="absolute top-full left-0 bg-white border rounded-lg shadow-xl z-20 w-48 mt-1 p-2 grid grid-cols-3 gap-2">
                                {[5, 10, 15, 20, 25, 30, 35, 40, 50, 60].map(p => (
                                    <button key={p} onClick={() => handleAddDiscount(p)} className="bg-gray-100 hover:bg-yellow-100 text-gray-800 text-xs font-bold py-2 rounded">{p}%</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {!showOnlyFailed && <div className="mb-4"><input type="text" placeholder="🔎 بحث سريع داخل محتويات السلة..." value={cartSearchTerm} onChange={(e) => setCartSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg bg-white shadow-sm" /></div>}
                
                <div className="space-y-3">
                  {filteredDisplayList.map((item, index) => {
                    if (item.type === 'discount') {
                        return (
                            <div key={item.id} className="bg-yellow-50 border-2 border-yellow-400 border-dashed p-3 rounded-lg flex justify-between items-center">
                                <div className="font-bold text-yellow-800">✂️ خصم {item.percent}% على ما يليه</div>
                                <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-red-500 font-bold bg-white px-2 rounded border border-red-200">حذف</button>
                            </div>
                        );
                    }
                    
                    const hasFailedVariantInItem = item.variants.some((v:any) => failedProductIds.has(v.productId));
                    const itemContainerClass = showOnlyFailed && hasFailedVariantInItem 
                        ? 'border-red-500 border-2 bg-red-50' 
                        : 'border-gray-100 bg-white';

                    const processedItem = processedDisplayCart.find((p:any) => p.id === item.id) || item;
                    const totalQty = item.variants.reduce((sum: number, v: { quantity: number }) => sum + v.quantity, 0);

                    return (
                        <div key={item.id} className={`p-4 rounded-xl shadow-sm border relative overflow-hidden transition-all hover:border-blue-200 ${itemContainerClass}`}>
                            {processedItem.appliedDiscount > 0 && <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] px-2 py-1 rounded-br font-bold">خصم {processedItem.appliedDiscount}%</div>}
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="text-xl font-bold block">{item.modelNo}</span>
                                    <span className="text-xs text-gray-500">{item.baseDescription}</span>
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
                                        {processedItem.appliedDiscount > 0 && <div className="text-xs text-gray-400 line-through">{(item.unitPrice * totalQty).toFixed(0)} ج.م</div>}
                                        <span>الإجمالي: {processedItem.totalLinePrice?.toFixed(0)} ج.م</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2 border border-gray-200">
                                {item.variants.map((v:any, i:number) => {
                                    const failedInfo = failedItems.find(f => f.productId === v.productId);
                                    return (
                                        <span key={i} className={`inline-block px-2 py-1 rounded border mr-1 text-[10px] ${ failedInfo ? 'bg-red-200 border-red-400' : v.quantity < 0 ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-white' }`}>
                                            {v.quantity < 0 && <span className="font-bold">↩️</span>}
                                            {v.quantity} ({v.color})
                                            {v.quantity < 0 && <span className="font-bold text-red-600">مرتجع</span>}
                                            {failedInfo && <span className="font-bold text-red-800"> (متاح: {failedInfo.availableStock})</span>}
                                        </span>
                                    )
                                })}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t">
                                <span className="text-xs font-bold text-gray-500">الكمية: {totalQty} قطعة</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditItem(item)} className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded font-bold">تعديل ✏️</button>
                                    <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded font-bold">حذف 🗑️</button>
                                </div>
                            </div>
                        </div>
                    );
                  })}
                </div>
                
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-30 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                    <div className="max-w-2xl mx-auto flex justify-between items-center">
                        <div><span className="text-gray-500 text-xs block">إجمالي الفاتورة</span><span className="text-xl font-black text-green-700">{currentTotal.toFixed(0)} ج.م</span></div>
                        <button onClick={() => setStep(2)} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg">إنهاء ومراجعة ➔</button>
                    </div>
                </div>
                <div className="h-20"></div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl shadow-lg p-6 animate-fade-in">
            <h3 className="text-center font-bold text-xl mb-6 border-b pb-4">مراجعة الحساب</h3>
            
            <div className="flex justify-between mb-4 text-sm bg-gray-50 p-3 rounded">
              <span className="text-gray-500 font-bold">العميل المختص:</span>
              <span className="font-bold text-blue-800">{selectedCustomer?.name}</span>
            </div>

            {/* عرض وتأكيد مخزن الصرف والتسليم في الخطوة 2 */}
            <div className="flex justify-between items-center mb-4 text-sm bg-cyan-50 border border-cyan-200 p-3 rounded-xl">
              <span className="text-cyan-900 font-bold">🏢 مخزن الصرف / التسليم:</span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="bg-white border border-cyan-300 rounded-lg p-1.5 text-xs font-bold text-gray-800 outline-none cursor-pointer"
              >
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} {wh.isDefault ? '⭐ (الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-between items-center mb-4 text-sm bg-gray-50 p-3 rounded">
                <span className="text-gray-500 font-bold">تاريخ الأوردر:</span>
                <input
                    type="date"
                    value={orderDate.toISOString().split('T')[0]}
                    onChange={(e) => setOrderDate(new Date(e.target.value))}
                    className="font-bold text-blue-800 border-none bg-transparent text-right p-0 focus:ring-0"
                />
            </div>

            <div className="space-y-4 mb-6 max-h-60 overflow-y-auto border p-2 rounded bg-slate-50">
              {getProcessedCart().map((item:any, idx) => (
                <div key={idx} className="flex justify-between border-b border-dashed border-gray-300 pb-2 last:border-0 text-sm">
                  <div className="flex-1">
                    <div className="font-bold">{item.modelNo}</div>
                    {item.appliedDiscount > 0 && <span className="text-[10px] text-red-500 font-bold">خصم {item.appliedDiscount}%</span>}
                  </div>
                  <div className="font-bold">{item.totalLinePrice.toFixed(0)} ج.م</div>
                </div>
              ))}
            </div>
            
            <div className="bg-slate-900 text-white p-5 rounded-2xl mb-6 shadow-md">
               <div className="flex justify-between text-lg mb-4 border-b border-slate-700 pb-2"><span>صافي الفاتورة:</span><span className="font-bold text-yellow-400 text-2xl">{currentTotal.toFixed(2)}</span></div>
               <div className="mb-4">
                  <label className="block text-slate-400 text-sm mb-2 font-bold">💵 العربون / المدفوع الآن:</label>
                  <div className="flex gap-2">
                     <input 
                       type="number" 
                       value={deposit} 
                       onChange={(e) => handleDepositChange(e.target.value)}
                       className="w-full p-4 rounded-xl bg-slate-800 text-white font-bold text-2xl outline-none border border-slate-700 focus:border-blue-500" 
                       placeholder="0.00" 
                     />
                     <button 
                       onClick={() => handleDepositChange('')}
                       className="bg-slate-700 text-xs px-4 rounded-lg hover:bg-slate-600 transition text-white font-bold"
                     >
                       مسح
                     </button>
                  </div>
               </div>
               
               <div className="mb-4">
                  <label className="block text-slate-400 text-sm mb-1 font-bold">العملة:</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full p-3 rounded-xl bg-slate-800 text-white font-bold outline-none border border-slate-700">
                      <option value="EGP">جنيه مصري</option>
                      <option value="USD">دولار أمريكي</option>
                      <option value="SAR">ريال سعودي</option>
                      <option value="KWD">دينار كويتي</option>
                  </select>
               </div>

               {depositVal !== 0 && (
                  <div className="mb-4 animate-in slide-in-from-top duration-300">
                     <div className="flex justify-between items-center mb-2">
                        <label className="block text-yellow-400 text-sm font-bold">
                           {depositVal > 0 ? '📥 تقسيم العربون على الخزنات' : '📤 تحديد خزنة الصرف'}:
                        </label>
                        <button 
                          type="button"
                          onClick={() => {
                            setDepositSplits([...depositSplits, { safeId: safes[0]?.id || '', amount: 0 }]);
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-blue-700"
                        >
                          + إضافة خزنة
                        </button>
                     </div>
                     
                     <div className="space-y-2">
                        {depositSplits.map((split, idx) => {
                          return (
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
                                {safes.map(safe => (
                                  <option key={safe.id} value={safe.id}>{safe.name}</option>
                                ))}
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
                                placeholder="0"
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
                          );
                        })}
                     </div>
                     
                     <div className="mt-2 text-xs text-slate-400 flex justify-between">
                       <span>المجموع الموزع: {depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0).toFixed(2)} ج.م</span>
                       <span className={Math.abs(depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0) - depositVal) > 0.01 ? 'text-red-400 font-bold' : 'text-green-400'}>
                         المتبقي للتوزيع: {(depositVal - depositSplits.reduce((sum, s) => sum + (s.amount || 0), 0)).toFixed(2)} ج.م
                       </span>
                     </div>
                  </div>
               )}

               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-slate-400 text-sm font-bold">🎟️ قسيمة مشتريات (خصم ظاهري):</label>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowVoucherInput(!showVoucherInput);
                        if (showVoucherInput) setVoucherAmount('');
                      }}
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
                      <p className="text-[10px] text-purple-300 mt-1">
                        ⚠️ هذا خصم ظاهري للعرض فقط - لن يؤثر على دين العميل الفعلي
                      </p>
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
                    <span className="text-red-400">{(currentTotal - depositVal).toFixed(2)} ج.م</span>
                  </div>
                  {voucherVal > 0 && (
                    <div className="flex justify-between text-base font-bold text-purple-300">
                      <span>قسيمة المشتريات (ظاهري):</span>
                      <span>- {voucherVal.toFixed(2)} ج.م</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-yellow-400">
                    <span>المطلوب تحصيله الآن:</span>
                    <span>{displayRemaining.toFixed(2)} ج.م</span>
                  </div>
                </div>
            </div>
            
            <button 
                onClick={handleSaveOrder} 
                disabled={isSavingOrder}
                className={`w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-xl hover:bg-blue-700 transition-all active:scale-95 ${isSavingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isSavingOrder ? '⏳ جاري الحفظ والتحقق...' : 'تأكيد وحفظ الأوردر ✅'}
            </button>
            <button onClick={() => setStep(1)} disabled={isSavingOrder} className="w-full mt-4 text-gray-500 font-bold py-2">العودة لتعديل الأصناف</button>
          </div>
        )}
      </div>

      {isQuickAddOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex justify-center items-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slide-up">
                  <h3 className="font-bold text-lg mb-4 border-b pb-2 text-center text-blue-900">إضافة عميل جديد</h3>
                  <form onSubmit={handleQuickAddCustomer} className="space-y-4">
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">اسم العميل (مطلوب)</label><input type="text" value={newCust.name} onChange={e => setNewCust({...newCust, name: e.target.value})} className="w-full border p-3 rounded-xl shadow-sm" required /></div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">كود العميل (تلقائي لو تركته فارغاً)</label><input type="text" value={newCust.code} onChange={e => setNewCust({...newCust, code: e.target.value})} className="w-full border p-3 rounded-xl bg-gray-50 shadow-sm" placeholder="سيتم التوليد تلقائياً" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">هاتف 1</label><input type="text" value={newCust.phone} onChange={e => setNewCust({...newCust, phone: e.target.value})} className="w-full border p-3 rounded-xl shadow-sm" /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">هاتف 2</label><input type="text" value={newCust.phone2} onChange={e => setNewCust({...newCust, phone2: e.target.value})} className="w-full border p-3 rounded-xl shadow-sm bg-yellow-50" /></div>
                      </div>
                      <div><label className="block text-xs font-bold text-gray-500 mb-1">العنوان</label><input type="text" value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} className="w-full border p-3 rounded-xl shadow-sm" /></div>
                      
                      <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsQuickAddOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-lg font-bold transition hover:bg-gray-200">إلغاء</button>
                          <button type="submit" disabled={isSavingCust} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700">حفظ واختيار ✅</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}