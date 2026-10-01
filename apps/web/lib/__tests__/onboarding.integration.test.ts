import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, rechargeGrants, termsConsents, userSettings, users } from '@miro/db'
import { deleteAccount } from '@/lib/ops/account'
import { getPersona } from '../persona'
import { completeOnboarding, parseOnboarding, precheckNickname, type OnboardingInput } from '../onboarding'
import { testDatabaseUrl } from '../../../../tooling/test-database'

// 안전 검사 — 기본은 mock. 거부·장애 경로만 live 모양의 가짜 분류기로 바꾼다(persona 테스트와 같은 방식).
const safety = vi.hoisted(() => ({ verdict: null as null | 'unavailable' | { allowed: boolean; category: string } }))
vi.mock('@/lib/simulation/mock-llm', async (original) => {
  const real = await original<typeof import('@/lib/simulation/mock-llm')>()
  return { ...real, resolveRpLLM: (...args: Parameters<typeof real.resolveRpLLM>) => safety.verdict
    ? { info: { mode: 'live', name: 'test', notice: null }, generateStructured: async () => { if (safety.verdict === 'unavailable') throw new Error('provider_http_429'); return safety.verdict } }
    : real.resolveRpLLM(...args) }
})

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
afterEach(() => { safety.verdict = null; vi.unstubAllEnvs() })
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

  it('checks the nickname on its own step, so the final save does not wait for the safety check again', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const id = await user()
    expect(await precheckNickname(id, ' 지우 ')).toEqual({ ok: true })
    expect(await getPersona(id)).toMatchObject({ name: '지우', gender: null })
    // 마지막 저장에서 검사를 다시 부르면 거부되도록 — 부르지 않으니 그대로 끝난다.
    safety.verdict = { allowed: false, category: 'sexual' }
    expect(await completeOnboarding(id, INPUT)).toMatchObject({ ok: true })
    expect(await getPersona(id)).toMatchObject({ name: '지우', gender: 'female' })
    // 미리 검사에서 막히면 이유를 돌려주고 저장하지 않는다.
    const other = await user()
    expect(await precheckNickname(other, '다른 이름')).toEqual({ ok: false, error: '이 닉네임은 쓸 수 없어요. 다른 표현으로 적어 주세요.' })
    expect(await getPersona(other)).toBeNull()
  })

  it('stops at the nickname when the safety check rejects it, and finishes without a persona when the check is down', async () => {
    const rejected = await user()
    safety.verdict = { allowed: false, category: 'sexual' }
    expect(await completeOnboarding(rejected, INPUT)).toEqual({ ok: false, step: 2, error: '이 닉네임은 쓸 수 없어요. 다른 표현으로 적어 주세요.' })
    expect(await db.select().from(termsConsents).where(eq(termsConsents.userId, rejected))).toHaveLength(0)

    const down = await user()
    safety.verdict = 'unavailable'
    expect(await completeOnboarding(down, INPUT)).toMatchObject({ ok: true })
    expect(await getPersona(down)).toBeNull()
    // 검사하지 못한 닉네임은 공개 이름(작성자 이름)에 쓰지 않는다.
    const [u] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, down))
    expect(u!.displayName).toBe('구글 실명')
  })
})
