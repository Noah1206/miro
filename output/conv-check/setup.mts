// One synthetic QA account on production for the 2026-10-16 conversation check. Not committed.
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db, users, authSessions } from '@miro/db'
import { completeOnboarding } from '@/lib/onboarding'

const EMAIL = 'qa+conv-check-20261016@example.invalid'
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
if (existing) throw new Error('test account already exists; refusing to reuse')
const [user] = await db.insert(users).values({ email: EMAIL, displayName: '검증' }).returning({ id: users.id })
const done = await completeOnboarding(user!.id, { language: 'ko', nickname: '검증', gender: null, birthDate: '1994-03-15', marketing: false, nightMarketing: false })
if (!done.ok) throw new Error('onboarding failed: ' + done.error)
const token = randomBytes(32).toString('hex')
await db.insert(authSessions).values({ userId: user!.id, token: 'sha256:' + createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 4 * 3_600_000) })
writeFileSync('/Users/johyeon-ung/Desktop/Miro/output/conv-check/.token', token, { mode: 0o600 })
writeFileSync('/Users/johyeon-ung/Desktop/Miro/output/conv-check/account.json', JSON.stringify({ userId: user!.id, email: EMAIL, welcomed: done.welcomed, createdAt: new Date().toISOString() }, null, 2))
console.log(JSON.stringify({ userId: user!.id, welcomed: done.welcomed }))
process.exit(0)
