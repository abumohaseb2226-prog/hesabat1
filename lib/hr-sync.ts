import { Pool } from 'pg'

// استخدام بورت 5432 المباشر لسوبابيز لتجنب قيود PgBouncer
const hrDirectConnectionString =
  process.env.HR_DIRECT_URL ||
  'postgresql://postgres.nqdtrpcatubcanzdqyfr:saad2226197@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'

const globalForHrPool = global as unknown as { hrPool: Pool }

export const hrPool =
  globalForHrPool.hrPool ||
  new Pool({
    connectionString: hrDirectConnectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })

if (process.env.NODE_ENV !== 'production') globalForHrPool.hrPool = hrPool

// دالة فحص الاتصال المباشر بقاعدة بيانات الحضور والانصراف
export async function testHrConnection() {
  try {
    const empCount = await hrPool.query(`SELECT COUNT(*)::int as count FROM "Employee"`)
    const lastTrans = await hrPool.query(
      `SELECT id, type, amount, note, date, "createdAt" 
       FROM "CashTransaction" 
       ORDER BY id DESC 
       LIMIT 1`
    )

    return {
      success: true,
      employeesCount: empCount.rows[0]?.count || 0,
      lastTransaction: lastTrans.rows[0] || null
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

// دالة ترحيل صرف الراتب/السلفة إلى تطبيق الحضور والانصراف (amrhh)
export async function syncPaymentToHrApp(data: {
  employeeName: string
  amount: number
  description: string
  safeName?: string
  date: Date
}) {
  try {
    const cleanName = data.employeeName.trim()

    // 1. البحث عن الموظف في جدول Employee بتطبيق الحضور
    const empResult = await hrPool.query(
      `SELECT id, name, code FROM "Employee" 
       WHERE TRIM(name) = TRIM($1)
          OR TRANSLATE(name, 'أإآةى', 'ااايه') = TRANSLATE($1, 'أإآةى', 'ااايه')
          OR name ILIKE $2
       LIMIT 1`,
      [cleanName, `%${cleanName}%`]
    )

    let hrEmployeeId: number | null = null
    let employeeDisplayName = cleanName

    if (empResult.rows.length > 0) {
      hrEmployeeId = empResult.rows[0].id
      employeeDisplayName = empResult.rows[0].name
    } else {
      console.warn(`⚠️ لم يتم العثور على الموظف (${cleanName}) في تطبيق الحضور`)
    }

    const note = data.description || 'سلفة / راتب'

    // 2. إدراج الحركة فوراً في جدول CashTransaction بتطبيق الحضور
    const insertResult = await hrPool.query(
      `INSERT INTO "CashTransaction" ("type", "amount", "note", "date", "employeeId", "createdAt")
       VALUES ('OUTCOME'::"CashType", $1, $2, $3, $4, NOW())
       RETURNING id, type, amount, note, date, "employeeId"`,
      [Number(data.amount), note, data.date, hrEmployeeId]
    )

    const createdRow = insertResult.rows[0]

    return {
      success: true,
      hrTransactionId: createdRow.id,
      matchedEmployee: employeeDisplayName,
      matchedId: hrEmployeeId
    }
  } catch (error: any) {
    console.error('❌ خطأ أثناء ترحيل الحركة إلى تطبيق الحضور:', error)
    return { success: false, error: error.message }
  }
}