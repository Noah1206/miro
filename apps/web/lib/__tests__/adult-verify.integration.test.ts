import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { confirmAdult, verificationPrefix } from '../adult-verify'
import { testDatabaseUrl } from '../../../../tooling/test-database'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
async function user() {
  const [u] = await db.insert(users).values({ email: `adult-${randomUUID()}@example.test` }).returning({ id: users.id })
  made.push(u!.id)
  return u!.id
}
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!

/** 성인 인증(10/2): PortOne 건은 계정에 묶이고, 미성년만 24시간 잠근다. */
describeDb('성인 인증 확인', () => {
  const portOne = () => {
    vi.stubEnv('PORTONE_API_SECRET', 'secret'); vi.stubEnv('PORTONE_STORE_ID', 'store'); vi.stubEnv('PORTONE_IDENTITY_CHANNEL_KEY', 'channel')
  }
  const answer = (birthDate: string) => vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'VERIFIED', verifiedCustomer: { birthDate } })))

  it("refuses another account's verification without asking PortOne", async () => {
    portOne()
    const [me, other] = [await user(), await user()]
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await confirmAdult(me, { identityVerificationId: verificationPrefix(other) + 'abcd1234' })).toMatchObject({ ok: false, lockedUntil: null })
    expect(spy).not.toHaveBeenCalled()
    expect((await row(me)).adultVerifiedAt).toBeNull()
  })

  it('records a verified adult with the policy agreement, and locks a minor for 24 hours', async () => {
    portOne()
    const adult = await user(), minor = await user()
    answer('1990-05-01')
    expect(await confirmAdult(adult, { identityVerificationId: verificationPrefix(adult) + 'a' })).toEqual({ ok: true })
    const a = await row(adult)
    expect(a.adultVerifiedAt).not.toBeNull()
    expect(a.maturePolicyAgreedAt).not.toBeNull()
    answer('2015-01-01')
    const now = new Date()
    expect(await confirmAdult(minor, { identityVerificationId: verificationPrefix(minor) + 'b' }, now)).toMatchObject({ ok: false, lockedUntil: new Date(now.getTime() + 24 * 3600_000) })
    expect((await row(minor)).adultVerifyFailedAt).toEqual(now)
    // 잠긴 동안은 PortOne 에 묻지 않는다.
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await confirmAdult(minor, { identityVerificationId: verificationPrefix(minor) + 'c' })).toMatchObject({ ok: false, reason: null })
    expect(spy).not.toHaveBeenCalled()
  })
})
