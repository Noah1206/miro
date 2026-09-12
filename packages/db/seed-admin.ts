import { eq } from 'drizzle-orm'
import { db } from './src/client'
import { adminUsers } from './src/schema/index'
import { hashPassword } from './src/password'

/** 최초 superadmin. 환경변수로만 만든다 — 사용자 앱 어디에도 운영자 가입 경로는 없다. */
const email = process.env.ADMIN_SEED_EMAIL, password = process.env.ADMIN_SEED_PASSWORD
if (!email || !password) { console.error('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD required'); process.exit(1) }
const role = (process.env.ADMIN_SEED_ROLE ?? 'superadmin') as 'viewer' | 'reviewer' | 'superadmin'
const existing = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
if (existing[0]) await db.update(adminUsers).set({ passwordHash: hashPassword(password), role }).where(eq(adminUsers.id, existing[0].id))
else await db.insert(adminUsers).values({ email, passwordHash: hashPassword(password), role })
console.log(`admin ready: ${email} (${role})`); process.exit(0)
