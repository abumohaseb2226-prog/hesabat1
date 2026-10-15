'use client'
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
    addCustomer, 
    getAdminCustomers, 
    deleteCustomer, 
    addBulkCustomers, 
    deleteBulkCustomers, 
    deleteAllCustomers,
    updateCustomer
} from '@/app/admin-actions';
import * as XLSX from 'xlsx';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Form States
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [address, setAddress] = useState('');

  // Edit States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  // Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Deleting State
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatusText, setDeleteStatusText] = useState('');

  useEffect(() => {
    refreshCustomers();
  }, []);

  const refreshCustomers = () => {
    getAdminCustomers().then(res => {
        setCustomers(res || []);
        setSelectedIds([]);
    });
  };

  // فلترة العملاء بالبحث الحي
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.phone2 && c.phone2.includes(searchTerm))
    );
  }, [customers, searchTerm]);

  // إحصائيات وإجماليات أرصدة العملاء المعروضين
  const balancesSummary = useMemo(() => {
    // إجمالي مديونيات العملاء (عليهم لنا)
    const totalDebtors = filteredCustomers
      .filter(c => (Number(c.balance) || 0) > 0)
      .reduce((sum, c) => sum + (Number(c.balance) || 0), 0);

    // إجمالي أرصدة العملاء الدائنة (لهم عندنا)
    const totalCreditors = filteredCustomers
      .filter(c => (Number(c.balance) || 0) < 0)
      .reduce((sum, c) => sum + Math.abs(Number(c.balance) || 0), 0);

    // صافي رصيد العملاء الإجمالي
    const netReceivables = totalDebtors - totalCreditors;

    const countDebtors = filteredCustomers.filter(c => (Number(c.balance) || 0) > 0).length;
    const countCreditors = filteredCustomers.filter(c => (Number(c.balance) || 0) < 0).length;
    const countSettled = filteredCustomers.filter(c => (Number(c.balance) || 0) === 0).length;

    return {
      totalDebtors,
      totalCreditors,
      netReceivables,
      countDebtors,
      countCreditors,
      countSettled
    };
  }, [filteredCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return alert('الاسم مطلوب');

    const res = await addCustomer({ code, name, phone, phone2, address, source: 'ADMIN' });
    if (res.success) {
      alert('تمت إضافة العميل');
      setCode(''); setName(''); setPhone(''); setPhone2(''); setAddress('');
      refreshCustomers();
    } else {
      alert('خطأ: ' + res.error);
    }
  };

  // --- Excel Logic ---
  const downloadTemplate = () => {
    const templateData = [
        { code: "C101", name: "عميل 1", phone: "010xxxx", phone2: "011xxxx", address: "العنوان" },
        { code: "C102", name: "عميل 2", phone: "012xxxx", phone2: "", address: "العنوان" }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "Customers_Template.xlsx");
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if(!file) return;

    setUploadProgress(0);
    setUploadStatusText('');

    const reader = new FileReader();
    reader.onload = async (evt: any) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if(confirm(`تم قراءة ${data.length} عميل. هل تريد البدء في الرفع؟`)) {
            setIsUploading(true);
            const BATCH_SIZE = 200;
            let successCount = 0;
            const total = data.length;

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = data.slice(i, i + BATCH_SIZE);
                setUploadStatusText(`جاري معالجة العملاء من ${i + 1} إلى ${Math.min(i + BATCH_SIZE, total)} ...`);
                
                const res = await addBulkCustomers(chunk as any[]);
                if (res.success) {
                    successCount += (res.count || 0);
                }
                const percent = Math.round(((i + chunk.length) / total) * 100);
                setUploadProgress(percent);
            }

            setIsUploading(false);
            setUploadStatusText(`✅ تم الانتهاء! تم إضافة/تحديث ${successCount} عميل.`);
            alert(`تمت العملية بنجاح. العدد الكلي: ${successCount}`);
            refreshCustomers();
            e.target.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };

  // --- Delete Logic ---
  const handleDelete = async (id: string) => {
    if (confirm('حذف هذا العميل؟')) {
      setIsDeleting(true); 
      setDeleteStatusText('جاري الحذف...');
      const res = await deleteCustomer(id);
      setIsDeleting(false);
      if(res.success) {
          refreshCustomers();
      } else {
          alert("❌ فشل الحذف: " + res.error);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if(selectedIds.length === 0) return;
    if(confirm(`هل أنت متأكد من محاولة حذف ${selectedIds.length} عميل؟`)) {
        setIsDeleting(true); 
        setDeleteStatusText('جاري حذف المحدد...');
        const res = await deleteBulkCustomers(selectedIds);
        setIsDeleting(false); 
        if(res.success) {
            alert(`✅ تقرير الحذف:\n- تم حذف: ${res.deleted} عميل.\n- فشل حذف: ${res.failed} عميل (لوجود تعاملات سابقة).`);
            refreshCustomers();
        } else {
            alert("حدث خطأ غير متوقع");
        }
    }
  };

  const handleDeleteAll = async () => {
    if(confirm("⚠️ سيتم حذف جميع العملاء الذين ليس لديهم أي تعاملات مالية أو أوردرات.\nهل أنت متأكد تماماً؟")) {
        setIsDeleting(true); 
        setDeleteStatusText('جاري حذف قاعدة البيانات (الآمن)...');
        const res = await deleteAllCustomers();
        setIsDeleting(false); 
        if(res.success) {
             alert(`✅ تقرير الحذف الشامل:\n- تم حذف: ${res.deleted} عميل.\n- متبقي: ${res.failed} عميل (لديهم بيانات هامة).`);
             refreshCustomers();
        } else {
            alert("حدث خطأ: " + res.error);
        }
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if(e.target.checked) setSelectedIds(filteredCustomers.map(c => c.id));
      else setSelectedIds([]);
  };

  const handleSelectOne = (id: string) => {
      if(selectedIds.includes(id)) setSelectedIds(selectedIds.filter(itemId => itemId !== id));
      else setSelectedIds([...selectedIds, id]);
  };

  // Edit Logic
  const handleEditClick = (cust: any) => {
      setEditingCustomer({ ...cust });
      setIsEditModalOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await updateCustomer(editingCustomer.id, editingCustomer);
      if(res.success) {
          alert('تم التعديل');
          setIsEditModalOpen(false);
          setEditingCustomer(null);
          refreshCustomers();
      } else {
          alert('خطأ');
      }
  };

  return (
    <div className="space-y-6 relative pb-40 font-sans" dir="rtl">
       
       {/* Full Screen Loader */}
       {isDeleting && (
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex flex-col justify-center items-center text-white">
                <div className="w-16 h-16 border-4 border-t-transparent border-white rounded-full animate-spin mb-4"></div>
                <div className="text-xl font-bold animate-pulse">{deleteStatusText}</div>
                <p className="text-sm mt-2 text-gray-200">يرجى الانتظار...</p>
            </div>
       )}

       {/* Header */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">إدارة العملاء</h1>
            <p className="text-xs text-blue-600 font-bold mt-1">العدد المعروض: {filteredCustomers.length}</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="w-full md:w-64">
                <input 
                    type="text" 
                    placeholder="🔍 بحث سريع (اسم، هاتف، كود)..." 
                    className="w-full p-2 border-2 border-blue-200 rounded-lg focus:border-blue-500 outline-none text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {selectedIds.length > 0 && (
                <button 
                    onClick={handleDeleteSelected} 
                    disabled={isDeleting}
                    className={`flex-1 md:flex-none text-white px-4 py-2 rounded text-sm font-bold shadow transition-all ${isDeleting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 animate-pulse'}`}>
                    حذف المحدد ({selectedIds.length})
                </button>
            )}
            
            <button 
                onClick={handleDeleteAll} 
                disabled={isDeleting}
                className={`flex-1 md:flex-none text-white px-4 py-2 rounded text-sm font-bold shadow transition-all ${isDeleting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900'}`}>
                ⚠️ حذف الكل
            </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
            <div className="w-full">
                <h3 className="font-bold text-indigo-800 text-sm md:text-lg">📥 استيراد Excel</h3>
                <div className="flex justify-between items-center mt-1">
                    <button onClick={downloadTemplate} className="text-xs text-indigo-700 underline font-bold">تحميل النموذج</button>
                    <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isUploading || isDeleting} className="text-xs bg-white p-2 border rounded cursor-pointer w-1/2" />
                </div>
            </div>
          </div>

          {(isUploading || uploadProgress > 0) && (
             <div className="w-full bg-white p-2 rounded shadow-sm border border-indigo-100 mt-2">
                <div className="flex justify-between text-[10px] font-bold text-indigo-800 mb-1">
                    <span>{uploadStatusText}</span>
                    <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-in-out" style={{ width: `${uploadProgress}%` }}></div>
                </div>
             </div>
          )}
      </div>

      {/* Form Adding */}
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-xl shadow space-y-4 border-t-4 border-blue-600">
        <h2 className="font-bold text-gray-700 text-sm border-b pb-2">إضافة عميل جديد (اترك الكود فارغاً للتوليد التلقائي)</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label className="text-xs font-bold text-gray-500">الكود (اختياري)</label><input type="text" className="w-full border p-2 rounded bg-gray-50 focus:bg-white" value={code} onChange={e => setCode(e.target.value)} placeholder="تلقائي..." /></div>
          <div><label className="text-xs font-bold text-gray-500">الاسم *</label><input type="text" className="w-full border p-2 rounded focus:bg-white" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><label className="text-xs font-bold text-gray-500">هاتف 1</label><input type="text" className="w-full border p-2 rounded focus:bg-white" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><label className="text-xs font-bold text-gray-500">هاتف 2</label><input type="text" className="w-full border p-2 rounded bg-yellow-50 focus:bg-white" value={phone2} onChange={e => setPhone2(e.target.value)} /></div>
          <div><label className="text-xs font-bold text-gray-500">العنوان</label><input type="text" className="w-full border p-2 rounded focus:bg-white" value={address} onChange={e => setAddress(e.target.value)} /></div>
        </div>
        <button type="submit" disabled={isDeleting} className="bg-blue-600 text-white px-6 py-3 rounded font-bold w-full disabled:opacity-50 hover:bg-blue-700 transition">حفظ العميل</button>
      </form>

      {/* القائمة: جدول للديسكتوب وكروت للموبايل */}
      <div className="relative">
        
        {/* 1. Mobile View (Cards) */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
            <div className="flex justify-between items-center px-2">
                <span className="text-xs font-bold text-gray-500">العدد المصفى: {filteredCustomers.length}</span>
                <label className="flex items-center gap-2 text-xs font-bold bg-gray-100 px-3 py-1 rounded">
                    <input type="checkbox" onChange={handleSelectAll} checked={filteredCustomers.length > 0 && selectedIds.length === filteredCustomers.length} />
                    تحديد المعروض
                </label>
            </div>

            {filteredCustomers.map(c => {
                const isQuickAdd = c.source === 'QUICK';
                const bal = Number(c.balance) || 0;

                return (
                    <div key={c.id} className={`bg-white p-4 rounded-xl shadow border-r-4 ${selectedIds.includes(c.id) ? 'border-r-indigo-500 bg-indigo-50' : isQuickAdd ? 'border-r-purple-500 bg-purple-50' : 'border-r-gray-300'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                                <input type="checkbox" className="w-5 h-5" checked={selectedIds.includes(c.id)} onChange={() => handleSelectOne(c.id)} />
                                <div>
                                    <h3 className={`font-bold ${isQuickAdd ? 'text-purple-800' : 'text-gray-800'}`}>{c.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-mono">{c.code}</span>
                                        {isQuickAdd && <span className="text-[10px] bg-purple-600 text-white px-1 rounded">جديد ✨</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="text-sm text-gray-600 space-y-1 border-t pt-2 mt-2">
                            <div className="flex items-center gap-2">
                                <span>📞</span>
                                <span>{c.phone || '-'}</span>
                                {c.phone2 && <span className="text-xs bg-yellow-100 px-1 rounded">{c.phone2}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span>📍</span>
                                <span>{c.address || 'لا يوجد عنوان'}</span>
                            </div>
                        </div>

                        {/* الرصيد الصافي وأزرار التحكم بجواره في الموبايل */}
                        <div className="flex justify-between items-center border-t pt-3 mt-2">
                            <div>
                              <span className="text-[10px] text-gray-500 block">الرصيد الصافي:</span>
                              <span className={`font-mono font-bold text-sm ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                                {bal > 0 ? `${bal.toLocaleString()} ج.م (عليه)` : bal < 0 ? `${Math.abs(bal).toLocaleString()} ج.م (له)` : '0.00 (خالص)'}
                              </span>
                            </div>

                            <div className="flex gap-1.5">
                                <Link href={`/admin/reports/customer/${c.id}`} className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold">
                                  📚 كشف
                                </Link>
                                <button onClick={() => handleEditClick(c)} className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold">
                                  ✏️
                                </button>
                                <button onClick={() => handleDelete(c.id)} className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">
                                  🗑️
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>

        {/* 2. Desktop View (Table) */}
        <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden border border-gray-200">
            <div className="p-2.5 bg-gray-50 border-b flex justify-between items-center text-xs text-gray-600 font-bold">
                <span>العملاء المعروضون: {filteredCustomers.length}</span>
                <span className="text-purple-700">💡 اللون الأرجواني = عملاء أضيفوا من شاشات البيع السريع</span>
            </div>

            <table className="w-full text-sm text-right">
            <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-3 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={filteredCustomers.length > 0 && selectedIds.length === filteredCustomers.length} /></th>
                  <th className="p-3 w-32">الكود</th>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3 w-32">هاتف 1</th>
                  <th className="p-3 w-32">هاتف 2</th>
                  <th className="p-3">العنوان</th>
                  
                  {/* عمود الرصيد الصافي الأخير للعميل بجوار التحكم مباشرة */}
                  <th className="p-3 text-center w-40 bg-gray-200 font-bold text-gray-900 border-x border-gray-300">
                    الرصيد الصافي الأخير
                  </th>

                  <th className="p-3 text-center w-52">تحكم</th>
                </tr>
            </thead>
            <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-gray-500 font-bold">
                      لا يوجد عملاء يطابقون البحث
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => {
                    const isQuickAdd = c.source === 'QUICK';
                    const bal = Number(c.balance) || 0;

                    return (
                      <tr key={c.id} className={`border-b hover:bg-gray-50 transition ${selectedIds.includes(c.id) ? 'bg-indigo-50' : isQuickAdd ? 'bg-purple-50/70' : ''}`}>
                          <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => handleSelectOne(c.id)} /></td>
                          <td className={`p-3 font-mono font-bold text-xs ${isQuickAdd ? 'text-purple-700' : 'text-gray-700'}`}>
                              {c.code}
                              {isQuickAdd && <span className="mr-1.5 text-[9px] bg-purple-600 text-white px-1 py-0.5 rounded">QUICK</span>}
                          </td>
                          <td className={`p-3 font-bold text-base ${isQuickAdd ? 'text-purple-900' : 'text-gray-900'}`}>{c.name}</td>
                          <td className="p-3 font-mono text-xs">{c.phone || '-'}</td>
                          <td className="p-3 text-gray-500 font-mono text-xs">{c.phone2 || '-'}</td>
                          <td className="p-3 text-xs text-gray-600 truncate max-w-xs">{c.address || '-'}</td>

                          {/* عرض الرصيد الصافي الأخير ملون بدقة */}
                          <td className="p-3 text-center font-mono font-bold text-sm bg-gray-50/50 border-x border-gray-200">
                            {bal > 0 ? (
                              <span className="text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg inline-block shadow-sm">
                                {bal.toLocaleString()} ج.م <small className="text-[10px] font-bold text-red-500">(عليه)</small>
                              </span>
                            ) : bal < 0 ? (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg inline-block shadow-sm">
                                {Math.abs(bal).toLocaleString()} ج.م <small className="text-[10px] font-bold text-emerald-600">(له)</small>
                              </span>
                            ) : (
                              <span className="text-gray-400 font-normal">
                                0.00
                              </span>
                            )}
                          </td>

                          {/* أزرار التحكم بجوار الرصيد */}
                          <td className="p-3 text-center">
                            <div className="flex justify-center items-center gap-1.5">
                              <Link
                                  href={`/admin/reports/customer/${c.id}`}
                                  className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm"
                                  title="كشف حساب العميل التفصيلي"
                              >
                                  📚 كشف حساب
                              </Link>
                              <button onClick={() => handleEditClick(c)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg text-xs font-bold transition">
                                تعديل ✏️
                              </button>
                              <button onClick={() => handleDelete(c.id)} disabled={isDeleting} className="text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded-lg text-xs font-bold transition disabled:opacity-50">
                                حذف 🗑️
                              </button>
                            </div>
                          </td>
                      </tr>
                    )
                  })
                )}
            </tbody>

            {/* تذييل الجدول بإجماليات الأرصدة المعروضة */}
            {filteredCustomers.length > 0 && (
              <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
                <tr>
                  <td colSpan={6} className="p-3.5 text-left text-sm text-gray-700">
                    إجمالي مديونيات العملاء المعروضين:
                  </td>
                  <td className="p-3.5 text-center font-mono font-black text-base text-red-600 bg-red-50/50 border-x border-gray-300">
                    {balancesSummary.totalDebtors.toLocaleString()} ج.م
                  </td>
                  <td className="p-3.5 text-center text-xs text-gray-500 font-normal">
                    (صافي المستحقات: <b className="text-gray-900 font-mono font-bold">{balancesSummary.netReceivables.toLocaleString()} ج.م</b>)
                  </td>
                </tr>
              </tfoot>
            )}
            </table>
        </div>
      </div>

      {/* الشريط الإحصائي الثابت في أسفل الشاشة لإجمالي أرصدة العملاء */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t-2 border-slate-700 p-3 sm:p-4 shadow-2xl z-40 text-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          
          <div className="flex flex-wrap items-center justify-between w-full md:w-auto gap-4 md:gap-8">
            
            {/* إجمالي مديونيات العملاء (عليهم) */}
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">
                إجمالي مديونيات العملاء (عليهم للشركة):
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-rose-400">
                {balancesSummary.totalDebtors.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                ({balancesSummary.countDebtors} عميل مديون)
              </span>
            </div>

            {/* إجمالي الأرصدة الدائنة (لهم عندنا) */}
            {balancesSummary.totalCreditors > 0 && (
              <div className="border-r border-slate-800 pr-4 md:pr-6">
                <span className="text-[10px] text-slate-400 block font-bold">
                  أرصدة عملاء دائنة (لهم عندنا رصيد):
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  {balancesSummary.totalCreditors.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  ({balancesSummary.countCreditors} عميل دائن)
                </span>
              </div>
            )}

            {/* الصافي الإجمالي */}
            <div className="border-r border-slate-800 pr-4 md:pr-6">
              <span className="text-[10px] text-amber-400 block font-bold">
                صافي المستحقات العام للعملاء:
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                {balancesSummary.netReceivables.toLocaleString()} <small className="text-xs text-slate-300">ج.م</small>
              </span>
              <span className="text-[10px] text-slate-400 block">
                (المعروض: {filteredCustomers.length} عميل)
              </span>
            </div>

          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshCustomers}
              className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>تحديث الأرصدة</span>
            </button>
          </div>

        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
              <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
                  <h3 className="font-bold border-b pb-2 text-lg">تعديل بيانات العميل</h3>
                  <div className="space-y-3">
                    <input type="text" placeholder="الكود" className="w-full border p-3 rounded bg-gray-50 font-mono" value={editingCustomer.code} onChange={(e) => setEditingCustomer({...editingCustomer, code: e.target.value})} />
                    <input type="text" placeholder="الاسم" className="w-full border p-3 rounded" value={editingCustomer.name} onChange={(e) => setEditingCustomer({...editingCustomer, name: e.target.value})} />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="هاتف 1" className="w-full border p-3 rounded font-mono" value={editingCustomer.phone || ''} onChange={(e) => setEditingCustomer({...editingCustomer, phone: e.target.value})} />
                        <input type="text" placeholder="هاتف 2" className="w-full border p-3 rounded bg-yellow-50 font-mono" value={editingCustomer.phone2 || ''} onChange={(e) => setEditingCustomer({...editingCustomer, phone2: e.target.value})} />
                    </div>
                    <input type="text" placeholder="العنوان" className="w-full border p-3 rounded" value={editingCustomer.address || ''} onChange={(e) => setEditingCustomer({...editingCustomer, address: e.target.value})} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setIsEditModalOpen(false)} className="px-6 py-2 bg-gray-200 rounded font-bold">إلغاء</button>
                      <button onClick={handleEditSave} className="px-6 py-2 text-white bg-blue-600 rounded font-bold">حفظ</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}