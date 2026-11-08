import { Prisma } from '@prisma/client'

// أكواد شجرة الحسابات القياسية المعتمدة في النظام
export const STANDARD_ACCOUNTS = {
  // 1. الأصول (Assets)
  CASH_MAIN: { code: '1101', name: 'الخزينة النقدية والمحافظ', category: 'ASSET', type: 'DEBIT', parentCode: '11' },
  BANK_ACCOUNTS: { code: '1102', name: 'الحسابات البنكية', category: 'ASSET', type: 'DEBIT', parentCode: '11' },
  CUSTOMERS: { code: '1103', name: 'العملاء والمدينون التجاريون', category: 'ASSET', type: 'DEBIT', parentCode: '11' },
  INVENTORY: { code: '1104', name: 'مخزون البضاعة والمنتجات', category: 'ASSET', type: 'DEBIT', parentCode: '11' },

  // 2. الخصوم والالتزامات (Liabilities)
  VENDORS: { code: '2101', name: 'الموردون والدائنون التجاريون', category: 'LIABILITY', type: 'CREDIT', parentCode: '21' },
  CHECKS_PAYABLE: { code: '2102', name: 'أوراق الدفع (شيكات صادرة)', category: 'LIABILITY', type: 'CREDIT', parentCode: '21' },

  // 3. حقوق الملكية (Equity)
  PARTNERS_CAPITAL: { code: '3101', name: 'رأس المال وجاري الشركاء', category: 'EQUITY', type: 'CREDIT', parentCode: '3' },
  RETAINED_EARNINGS: { code: '3201', name: 'الأرباح المرحلة والفائض المتراكم', category: 'EQUITY', type: 'CREDIT', parentCode: '3' },

  // 4. الإيرادات (Revenues)
  SALES_REVENUE: { code: '4101', name: 'إيراد مبيعات الفواتير', category: 'REVENUE', type: 'CREDIT', parentCode: '4' },
  SALES_RETURNS_ALLOWANCES: { code: '4201', name: 'مردودات ومسموحات المبيعات والخصم', category: 'REVENUE', type: 'DEBIT', parentCode: '4' },

  // 5. التكاليف والمصروفات (Expenses & COGS)
  COGS: { code: '5101', name: 'تكلفة البضاعة المباعة (COGS)', category: 'EXPENSE', type: 'DEBIT', parentCode: '5' },
  OPERATING_EXPENSES: { code: '5201', name: 'المصروفات العامة والتشغيلية والنثريات', category: 'EXPENSE', type: 'DEBIT', parentCode: '5' },
  SALARIES_EXPENSES: { code: '5301', name: 'الأجور والرواتب ومستحقات الموظفين', category: 'EXPENSE', type: 'DEBIT', parentCode: '5' },
}

export interface AccountingLineInput {
  accountCode: string
  accountName: string
  accountType: 'CUSTOMER' | 'VENDOR' | 'SAFE' | 'BANK' | 'EMPLOYEE' | 'OTHER_ACCOUNT' | 'EXPENSE' | 'REVENUE' | 'CHART_ACCOUNT'
  accountId?: string | null
  debit: number
  credit: number
  notes?: string | null
}

export interface CreateAutoEntryParams {
  date: Date
  description: string
  reference: string
  userId: string
  lines: AccountingLineInput[]
}

/**
 * التأكد التلقائي من وجود شجرة الحسابات الأساسية في قاعدة البيانات
 */
export async function ensureStandardChartAccounts(tx: Prisma.TransactionClient) {
  for (const acc of Object.values(STANDARD_ACCOUNTS)) {
    const existing = await (tx as any).chartAccount.findUnique({
      where: { code: acc.code }
    })

    if (!existing) {
      await (tx as any).chartAccount.create({
        data: {
          code: acc.code,
          name: acc.name,
          category: acc.category,
          type: acc.type,
          parentCode: acc.parentCode,
          balance: 0,
          description: `حساب قياسي تلقائي: ${acc.name}`
        }
      })
    }
  }
}

/**
 * محرك ترحيل قيد يومية آلي متزن داخل Transaction
 */
export async function createAutoJournalEntry(
  tx: Prisma.TransactionClient,
  params: CreateAutoEntryParams
) {
  // فحص عدم التكرار لنفس المرجع
  if (params.reference) {
    const existing = await (tx as any).journalEntry.findFirst({
      where: { reference: params.reference }
    })
    if (existing) {
      return existing
    }
  }

  // فلترة البنود ذات القيمة الصفرية
  const validLines = params.lines.filter(l => (Number(l.debit) > 0 || Number(l.credit) > 0))
  if (validLines.length < 2) {
    return null
  }

  const totalDebit = Math.round(validLines.reduce((s, l) => s + Number(l.debit || 0), 0) * 100) / 100
  const totalCredit = Math.round(validLines.reduce((s, l) => s + Number(l.credit || 0), 0) * 100) / 100

  // التحقق الحاسم من توازن القيد
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `فشل ترحيل القيد المحاسبي: القيد غير متزن! إجمالي المدين (${totalDebit}) لا يتساوى مع إجمالي الدائن (${totalCredit}) - المرجع: ${params.reference}`
    )
  }

  // إنشاء القيد الرئيسي
  const entry = await (tx as any).journalEntry.create({
    data: {
      date: params.date,
      description: params.description,
      reference: params.reference,
      totalAmount: totalDebit,
      userId: params.userId,
      lines: {
        create: validLines.map(l => ({
          accountType: l.accountType,
          accountId: l.accountId || null,
          accountName: l.accountName,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          notes: l.notes || null
        }))
      }
    }
  })

  // تحديث أرصدة شجرة الحسابات (ChartAccount)
  for (const line of validLines) {
    if (line.accountCode) {
      const chartAcc = await (tx as any).chartAccount.findUnique({
        where: { code: line.accountCode }
      })

      if (chartAcc) {
        // إذا كان الحساب مدين بطبيعته: الزيادة في المدين ترفع الرصيد والعكس
        const isDebitNature = chartAcc.type === 'DEBIT'
        const change = isDebitNature
          ? (Number(line.debit) - Number(line.credit))
          : (Number(line.credit) - Number(line.debit))

        await (tx as any).chartAccount.update({
          where: { id: chartAcc.id },
          data: { balance: { increment: change } }
        })
      }
    }
  }

  return entry
}

// =========================================================================
// دوال الترحيل المتخصصة لكل عملية تجارية
// =========================================================================

/**
 * 1. ترحيل فاتورة مبيعات (أوردر بيع عادي أو بازار)
 */
export async function postSalesOrderToLedger(
  tx: Prisma.TransactionClient,
  data: {
    orderId: string
    orderNo: number
    customerId: string
    customerName: string
    totalAmount: number
    depositPaid: number
    safeId?: string | null
    safeName?: string | null
    cogsAmount: number
    date: Date
    userId: string
  }
) {
  await ensureStandardChartAccounts(tx)

  const lines: AccountingLineInput[] = []
  const netDue = Math.max(0, data.totalAmount - data.depositPaid)

  // الطرف المدين 1: النقدية المحصلة في الخزنة
  if (data.depositPaid > 0) {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
      accountName: data.safeName ? `خزنة: ${data.safeName}` : STANDARD_ACCOUNTS.CASH_MAIN.name,
      accountType: 'SAFE',
      accountId: data.safeId || null,
      debit: data.depositPaid,
      credit: 0,
      notes: `تحصيل نقدي أوردر #${data.orderNo}`
    })
  }

  // الطرف المدين 2: مديونية العميل الآجلة (المتبقي)
  if (netDue > 0) {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.CUSTOMERS.code,
      accountName: `عميل: ${data.customerName}`,
      accountType: 'CUSTOMER',
      accountId: data.customerId,
      debit: netDue,
      credit: 0,
      notes: `مبيعات آجلة أوردر #${data.orderNo}`
    })
  }

  // الطرف الدائن: إيراد المبيعات
  lines.push({
    accountCode: STANDARD_ACCOUNTS.SALES_REVENUE.code,
    accountName: STANDARD_ACCOUNTS.SALES_REVENUE.name,
    accountType: 'REVENUE',
    debit: 0,
    credit: data.totalAmount,
    notes: `إثبات إيراد مبيعات أوردر #${data.orderNo}`
  })

  // القيد المالي الأول: إثبات المبيعات والتحصيل
  await createAutoJournalEntry(tx, {
    date: data.date,
    description: `فاتورة بيع أوردر #${data.orderNo} للعميل: ${data.customerName}`,
    reference: `ORD-${data.orderNo}`,
    userId: data.userId,
    lines
  })

  // القيد المالي الثاني (الموازي): إثبات تكلفة البضاعة المباعة وخروج المخزون
  if (data.cogsAmount > 0) {
    await createAutoJournalEntry(tx, {
      date: data.date,
      description: `تكلفة البضاعة المباعة لأوردر #${data.orderNo}`,
      reference: `COGS-ORD-${data.orderNo}`,
      userId: data.userId,
      lines: [
        {
          accountCode: STANDARD_ACCOUNTS.COGS.code,
          accountName: STANDARD_ACCOUNTS.COGS.name,
          accountType: 'EXPENSE',
          debit: data.cogsAmount,
          credit: 0,
          notes: `إثبات تكلفة مبيعات أوردر #${data.orderNo}`
        },
        {
          accountCode: STANDARD_ACCOUNTS.INVENTORY.code,
          accountName: STANDARD_ACCOUNTS.INVENTORY.name,
          accountType: 'CHART_ACCOUNT',
          debit: 0,
          credit: data.cogsAmount,
          notes: `خصم بضاعة مباعة أوردر #${data.orderNo} من المخزون`
        }
      ]
    })
  }
}

/**
 * 2. ترحيل فاتورة مشتريات من مورد
 */
export async function postPurchaseInvoiceToLedger(
  tx: Prisma.TransactionClient,
  data: {
    invoiceNo: string
    vendorId: string
    vendorName: string
    totalAmount: number
    isCash: boolean
    safeId?: string | null
    safeName?: string | null
    date: Date
    userId: string
  }
) {
  await ensureStandardChartAccounts(tx)

  const lines: AccountingLineInput[] = [
    // مدين: زيادة المخزون السلعي
    {
      accountCode: STANDARD_ACCOUNTS.INVENTORY.code,
      accountName: STANDARD_ACCOUNTS.INVENTORY.name,
      accountType: 'CHART_ACCOUNT',
      debit: data.totalAmount,
      credit: 0,
      notes: `إضافة مخزون مشتريات فاتورة #${data.invoiceNo}`
    }
  ]

  // دائن: إما الخزنة (نقدي) أو حساب المورد (آجل)
  if (data.isCash && data.safeId) {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
      accountName: data.safeName ? `خزنة: ${data.safeName}` : STANDARD_ACCOUNTS.CASH_MAIN.name,
      accountType: 'SAFE',
      accountId: data.safeId,
      debit: 0,
      credit: data.totalAmount,
      notes: `سداد نقدي فاتورة مشتريات #${data.invoiceNo}`
    })
  } else {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.VENDORS.code,
      accountName: `مورد: ${data.vendorName}`,
      accountType: 'VENDOR',
      accountId: data.vendorId,
      debit: 0,
      credit: data.totalAmount,
      notes: `استحقاق آجل فاتورة مشتريات #${data.invoiceNo}`
    })
  }

  await createAutoJournalEntry(tx, {
    date: data.date,
    description: `فاتورة مشتريات #${data.invoiceNo} من المورد: ${data.vendorName}`,
    reference: `PUR-${data.invoiceNo}`,
    userId: data.userId,
    lines
  })
}

/**
 * 3. ترحيل مرتجع مبيعات
 */
export async function postSalesReturnToLedger(
  tx: Prisma.TransactionClient,
  data: {
    returnNo: number
    customerId: string
    customerName: string
    refundAmount: number
    isCash: boolean
    safeId?: string | null
    safeName?: string | null
    cogsAmount: number
    date: Date
    userId: string
  }
) {
  await ensureStandardChartAccounts(tx)

  const lines: AccountingLineInput[] = [
    // مدين: مردودات المبيعات
    {
      accountCode: STANDARD_ACCOUNTS.SALES_RETURNS_ALLOWANCES.code,
      accountName: STANDARD_ACCOUNTS.SALES_RETURNS_ALLOWANCES.name,
      accountType: 'REVENUE',
      debit: data.refundAmount,
      credit: 0,
      notes: `مردودات مبيعات إيصال #${data.returnNo}`
    }
  ]

  // دائن: خروج كاش من الخزنة أو تخفيض حساب العميل
  if (data.isCash && data.safeId) {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
      accountName: data.safeName ? `خزنة: ${data.safeName}` : STANDARD_ACCOUNTS.CASH_MAIN.name,
      accountType: 'SAFE',
      accountId: data.safeId,
      debit: 0,
      credit: data.refundAmount,
      notes: `رد نقدية لمرتجع مبيعات #${data.returnNo}`
    })
  } else {
    lines.push({
      accountCode: STANDARD_ACCOUNTS.CUSTOMERS.code,
      accountName: `عميل: ${data.customerName}`,
      accountType: 'CUSTOMER',
      accountId: data.customerId,
      debit: 0,
      credit: data.refundAmount,
      notes: `تخفيض مديونية العميل لمرتجع #${data.returnNo}`
    })
  }

  await createAutoJournalEntry(tx, {
    date: data.date,
    description: `مرتجع مبيعات #${data.returnNo} للعميل: ${data.customerName}`,
    reference: `RET-${data.returnNo}`,
    userId: data.userId,
    lines
  })

  // قيد موازي: إعادة البضاعة للمخزون وخفض التكلفة
  if (data.cogsAmount > 0) {
    await createAutoJournalEntry(tx, {
      date: data.date,
      description: `إعادة بضاعة مرتجع #${data.returnNo} إلى المخزون`,
      reference: `COGS-RET-${data.returnNo}`,
      userId: data.userId,
      lines: [
        {
          accountCode: STANDARD_ACCOUNTS.INVENTORY.code,
          accountName: STANDARD_ACCOUNTS.INVENTORY.name,
          accountType: 'CHART_ACCOUNT',
          debit: data.cogsAmount,
          credit: 0,
          notes: `إرجاع بضاعة مرتجع #${data.returnNo} للمخزون`
        },
        {
          accountCode: STANDARD_ACCOUNTS.COGS.code,
          accountName: STANDARD_ACCOUNTS.COGS.name,
          accountType: 'EXPENSE',
          debit: 0,
          credit: data.cogsAmount,
          notes: `تخفيض تكلفة البضاعة المباعة لمرتجع #${data.returnNo}`
        }
      ]
    })
  }
}

/**
 * 4. ترحيل سندات القبض والصرف والمصروفات الموحدة
 */
export async function postPaymentToLedger(
  tx: Prisma.TransactionClient,
  data: {
    receiptNo: number
    type: 'IN' | 'OUT' | 'TRANSFER'
    partyType: 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE' | 'EXPENSE'
    partyId?: string | null
    partyName?: string | null
    amount: number
    safeId: string
    safeName: string
    targetSafeId?: string | null
    targetSafeName?: string | null
    description?: string | null
    date: Date
    userId: string
  }
) {
  await ensureStandardChartAccounts(tx)

  const lines: AccountingLineInput[] = []
  const ref = `PAY-${data.receiptNo}`

  // أ. تحويل بين الخزائن
  if (data.type === 'TRANSFER' && data.targetSafeId) {
    lines.push(
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.targetSafeName || 'المستهدفة'}`,
        accountType: 'SAFE',
        accountId: data.targetSafeId,
        debit: data.amount,
        credit: 0,
        notes: `تحويل وارد من ${data.safeName}`
      },
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.safeName}`,
        accountType: 'SAFE',
        accountId: data.safeId,
        debit: 0,
        credit: data.amount,
        notes: `تحويل صادر إلى ${data.targetSafeName}`
      }
    )
  }
  // ب. سند قبض من عميل (تحصيل مديونية)
  else if (data.type === 'IN' && data.partyType === 'CUSTOMER') {
    lines.push(
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.safeName}`,
        accountType: 'SAFE',
        accountId: data.safeId,
        debit: data.amount,
        credit: 0,
        notes: `تحصيل نقدي من ${data.partyName}`
      },
      {
        accountCode: STANDARD_ACCOUNTS.CUSTOMERS.code,
        accountName: `عميل: ${data.partyName}`,
        accountType: 'CUSTOMER',
        accountId: data.partyId,
        debit: 0,
        credit: data.amount,
        notes: `سداد مديونية العميل`
      }
    )
  }
  // ج. سند دفع لمورد (سداد مستحقات)
  else if (data.type === 'OUT' && data.partyType === 'VENDOR') {
    lines.push(
      {
        accountCode: STANDARD_ACCOUNTS.VENDORS.code,
        accountName: `مورد: ${data.partyName}`,
        accountType: 'VENDOR',
        accountId: data.partyId,
        debit: data.amount,
        credit: 0,
        notes: `سداد مستحقات المورد`
      },
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.safeName}`,
        accountType: 'SAFE',
        accountId: data.safeId,
        debit: 0,
        credit: data.amount,
        notes: `صرف نقدي للمورد`
      }
    )
  }
  // د. صرف مصروفات عامة ونثريات
  else if (data.type === 'OUT' && data.partyType === 'EXPENSE') {
    lines.push(
      {
        accountCode: STANDARD_ACCOUNTS.OPERATING_EXPENSES.code,
        accountName: STANDARD_ACCOUNTS.OPERATING_EXPENSES.name,
        accountType: 'EXPENSE',
        debit: data.amount,
        credit: 0,
        notes: data.description || 'مصروفات تشغيلية وعامة'
      },
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.safeName}`,
        accountType: 'SAFE',
        accountId: data.safeId,
        debit: 0,
        credit: data.amount,
        notes: `صرف مصروفات من الخزنة`
      }
    )
  }
  // هـ. سلفة / صرف لموظف
  else if (data.type === 'OUT' && data.partyType === 'EMPLOYEE') {
    lines.push(
      {
        accountCode: STANDARD_ACCOUNTS.SALARIES_EXPENSES.code,
        accountName: `سلفة/راتب موظف: ${data.partyName}`,
        accountType: 'EMPLOYEE',
        accountId: data.partyId,
        debit: data.amount,
        credit: 0,
        notes: data.description || 'سلفة / مسحوبات موظف'
      },
      {
        accountCode: STANDARD_ACCOUNTS.CASH_MAIN.code,
        accountName: `خزنة: ${data.safeName}`,
        accountType: 'SAFE',
        accountId: data.safeId,
        debit: 0,
        credit: data.amount,
        notes: `صرف نقدية للموظف`
      }
    )
  }

  if (lines.length >= 2) {
    await createAutoJournalEntry(tx, {
      date: data.date,
      description: data.description || `سند رقم #${data.receiptNo}`,
      reference: ref,
      userId: data.userId,
      lines
    })
  }
}