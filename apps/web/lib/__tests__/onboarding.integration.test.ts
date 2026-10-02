import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, rechargeGrants, termsConsents, userSettings, users } from '@miro/db'
import { deleteAccount } from '@/lib/ops/account'
import { getPersona } from '../persona'
import { completeOnboarding, parseOnboarding, precheckNickname, type OnboardingInput } from '../onboarding'
import { testDatabaseUrl } from '../../../../tooling/test-database'

function form(values: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) for (const x of [v].flat()) f.append(k, x)
  return f
}
const FULL = { language: 'en', nickname: ' 지우 ', gender: 'female', taste: ['hl', 'bl', 'yuri'], birthDate: '2000-02-29', terms: 'on', privacy: 'on', ai: 'on', push: 'on', marketing: 'on' }
const TODAY = new Date('2026-09-30T00:00:00Z')

describe('온보딩 입력', () => {
  it('reads every step and keeps only known values', () => {
    expect(parseOnboarding(form(FULL), TODAY)).toEqual({ ok: true, input: {
      language: 'en', nickname: '지우', gender: 'female', tastes: ['bl', 'hl'], birthDate: '2000-02-29', marketing: true, nightMarketing: false,
    } })
    expect(parseOnboarding(form({ ...FULL, gender: 'none', birthDate: '' }), TODAY)).toMatchObject({ ok: true, input: { gender: null, birthDate: null } })
  })

  it('sends the user back to the step that is wrong', () => {
    const step = (v: Record<string, string | string[]>) => { const r = parseOnboarding(form(v), TODAY); return r.ok ? 0 : r.step }
    expect(step({ ...FULL, language: 'fr' })).toBe(1)
    expect(step({ ...FULL, nickname: '  ' })).toBe(2)
    expect(step({ ...FULL, nickname: '가'.repeat(13) })).toBe(2)
    expect(step({ ...FULL, gender: '' })).toBe(3)
    expect(step({ ...FULL, taste: ['yuri'] })).toBe(4)
    for (const bad of ['2001-02-29', '2026-10-01', '1899-12-31', '2000/01/01']) expect(step({ ...FULL, birthDate: bad })).toBe(5)
    expect(step({ ...FULL, ai: '' })).toBe(6)
    expect(step({ ...FULL, push: '' })).toBe(6) // 캐릭터 알림도 필수(2026-10-01)
  })
})

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => { vi.unstubAllEnvs() })
afterAll(async () => {
  for (const id of made) { await db.delete(rechargeGrants).where(eq(rechargeGrants.userId, id)); await db.delete(users).where(eq(users.id, id)) }
})
async function user() {
  const [u] = await db.insert(users).values({ email: `onboarding-${randomUUID()}@example.test`, displayName: '구글 실명' }).returning({ id: users.id })
  made.push(u!.id)
  return u!.id
}
const INPUT: OnboardingInput = { language: 'ja', nickname: '지우', gender: 'female', tastes: ['hl'], birthDate: '2000-01-02', marketing: true, nightMarketing: false }

describeDb('온보딩 저장', () => {
  it('saves the profile, consents and a one-time 7-day welcome gift, and the account deletion clears the profile', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const id = await user()
    expect(await completeOnboarding(id, INPUT)).toEqual({ ok: true, welcomed: true })
    expect(await getPersona(id)).toEqual({ name: '지우', gender: 'female', description: null })
    const [u] = await db.select().from(users).where(eq(users.id, id))
    expect(u).toMatchObject({ displayName: '지우', birthDate: '2000-01-02', tastes: ['hl'] })
    expect(await db.select().from(termsConsents).where(eq(termsConsents.userId, id))).toHaveLength(1)
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, id))
    expect(s!.language).toBe('ja')
    expect(s!.marketingConsentAt).not.toBeNull()
    expect(s!.nightMarketingConsentAt).toBeNull()
    const [g] = await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId, id))
    expect(g).toMatchObject({ amount: 300, source: 'grant', provider: 'welcome', externalRef: id })
    const days = (g!.expiresAt!.getTime() - g!.createdAt.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(6.99); expect(days).toBeLessThan(7.01)

    // 두 번째 완료는 보상을 다시 주지 않는다.
    expect(await completeOnboarding(id, INPUT)).toEqual({ ok: true, welcomed: false })
    expect(await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId, id))).toHaveLength(1)

    expect(await deleteAccount(id)).toBe('completed')
    const [gone] = await db.select().from(users).where(eq(users.id, id))
    expect(gone).toMatchObject({ birthDate: null, tastes: [] })
  })

  // 10/2: AI 안전 검사를 뺐다 — 닉네임 단계는 페르소나로 미리 저장만 하고, 마지막 단계는 성별만 맞춘다.
  it('saves the nickname on its own step, so the final save only sets the gender', async () => {
    const id = await user()
    expect(await precheckNickname(id, ' 지우 ')).toEqual({ ok: true })
    expect(await getPersona(id)).toMatchObject({ name: '지우', gender: null })
    expect(await completeOnboarding(id, INPUT)).toMatchObject({ ok: true })
    expect(await getPersona(id)).toMatchObject({ name: '지우', gender: 'female' })
    const [u] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, id))
    expect(u!.displayName).toBe('지우')
    // 형식이 틀린 닉네임은 이유를 돌려주고 저장하지 않는다.
    const other = await user()
    expect(await precheckNickname(other, '가'.repeat(13))).toEqual({ ok: false, error: '이름은 12자까지 쓸 수 있어요.' })
    expect(await getPersona(other)).toBeNull()
  })
})
