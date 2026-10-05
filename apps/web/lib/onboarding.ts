import { eq } from 'drizzle-orm'
import { isLanguage, type Language } from '@miro/domain'
import { WELCOME_GRANT } from '@miro/config'
import { db, termsConsents, userPersonas, userSettings, users } from '@miro/db'
import { privacyVersion, termsVersion } from '@/lib/legal'
import { observe } from '@/lib/observe'
import { getPersona, parsePersona, savePersona } from '@/lib/persona'
import { grantRecharge } from '@/lib/usage/guard'
import { REQUIRED_TERMS, TASTES, type Taste } from '@/lib/onboarding-options'
import { msg } from '@/lib/i18n'

/**
 * 첫 로그인 온보딩(2026-09-30 결정): 언어 → 닉네임 → 성별 → 취향 → 생년월일(선택) → 약관. 마지막에 한 번에 저장한다.
 * 닉네임·성별은 페르소나로(캐릭터가 부르는 이름), 취향·생년월일은 사용자에, 언어·선택 동의는 설정에 남긴다.
 * 언어는 고르는 순간 쿠키로 먼저 바뀐다(화면이 바로 그 언어로) — 여기서는 계정 설정에 남긴다.
 */
export type OnboardingInput = {
  language: Language
  nickname: string
  gender: 'female' | 'male' | null
  tastes: Taste[]
  birthDate: string | null
  marketing: boolean
  nightMarketing: boolean
}
export type OnboardingError = { step: number; error: string }

/** 폼 → 입력. 틀린 칸이 있으면 그 단계 번호(1부터)와 이유를 돌려준다 — 화면은 그 단계로 돌아간다. */
export function parseOnboarding(form: FormData, today = new Date()): ({ ok: true; input: OnboardingInput }) | ({ ok: false } & OnboardingError) {
  const language = form.get('language')
  if (!isLanguage(language)) return { ok: false, step: 1, error: msg('언어를 골라 주세요.') }

  const name = parsePersona({ name: form.get('nickname'), gender: null, description: null })
  if (!name.ok) return { ok: false, step: 2, error: String(form.get('nickname') ?? '').trim() ? msg('닉네임은 12자까지 쓸 수 있어요.') : msg('닉네임을 적어 주세요.') }

  const g = form.get('gender')
  if (g !== 'female' && g !== 'male' && g !== 'none') return { ok: false, step: 3, error: msg('성별을 골라 주세요.') }

  const tastes = TASTES.filter((t) => form.getAll('taste').includes(t))
  if (tastes.length === 0) return { ok: false, step: 4, error: msg('취향을 하나 이상 골라 주세요.') }

  const birth = form.get('birthDate')
  const birthDate = typeof birth === 'string' && birth ? birth : null
  if (birthDate && !validBirthDate(birthDate, today)) return { ok: false, step: 5, error: msg('생년월일을 다시 확인해 주세요.') }
  // 약관 제4조: 만 18세 이상만 가입(10/3 점검). 생년월일을 적었으면 한국 날짜로 만 나이를 본다.
  if (birthDate && fullAge(birthDate, today) < 18) return { ok: false, step: 5, error: msg('만 18세 이상만 가입할 수 있어요.') }

  if (!REQUIRED_TERMS.every((k) => form.get(k) === 'on')) return { ok: false, step: 6, error: msg('필수 항목에 모두 동의해 주세요.') }

  return { ok: true, input: {
    language, nickname: name.persona.name, gender: g === 'none' ? null : g, tastes, birthDate,
    marketing: form.get('marketing') === 'on', nightMarketing: form.get('nightMarketing') === 'on',
  } }
}

/** 'YYYY-MM-DD', 실제로 있는 날짜, 1900년 이후, 오늘 이전. */
/** 닉네임 미리 저장(닉네임 단계에서 '다음' 을 누르면 뒤에서 돈다). 페르소나로 저장해 두어 마지막 단계가 다시 쓰지 않게 한다. */
export async function precheckNickname(userId: string, nickname: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getPersona(userId)
  const saved = await savePersona(userId, { name: nickname, gender: existing?.gender ?? null, description: existing?.description ?? null })
  return saved.ok ? { ok: true } : { ok: false, error: saved.error }
}

function fullAge(v: string, today: Date): number {
  const now = today.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  return Number(now.slice(0, 4)) - Number(v.slice(0, 4)) - (now.slice(5) < v.slice(5) ? 1 : 0)
}

function validBirthDate(v: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01' && d <= today
}

/**
 * 저장. 닉네임은 페르소나 이름으로 저장한다 — 길이·빈 값이 틀리면 닉네임 단계로 돌려보낸다.
 * 가입 보상은 계정당 한 번 — (provider 'welcome', 사용자 id) UNIQUE 가 두 번째 지급을 막는다.
 */
export async function completeOnboarding(userId: string, input: OnboardingInput): Promise<({ ok: true; welcomed: boolean }) | ({ ok: false } & OnboardingError)> {
  const existing = await getPersona(userId)
  // 닉네임 단계에서 미리 저장해 둔 이름이면(precheckNickname) 성별만 맞춘다.
  const saved = existing?.name === input.nickname
    ? await db.update(userPersonas).set({ gender: input.gender, updatedAt: new Date() }).where(eq(userPersonas.userId, userId)).then(() => ({ ok: true as const }))
    : await savePersona(userId, { name: input.nickname, gender: input.gender, description: existing?.description ?? null })
  if (!saved.ok) return { ok: false, step: 2, error: saved.error }

  const now = new Date()
  await db.transaction(async (tx) => {
    // 국외 이전 동의는 처리방침 버전으로 따로 남긴다(REQUIRED_TERMS 가 체크를 보장한다).
    await tx.insert(termsConsents).values({ userId, termsVersion: termsVersion(now), privacyVersion: privacyVersion(now), transferVersion: privacyVersion(now) })
    const consents = { language: input.language, marketingConsentAt: input.marketing ? now : null, nightMarketingConsentAt: input.nightMarketing ? now : null }
    await tx.insert(userSettings).values({ userId, ...consents })
      .onConflictDoUpdate({ target: userSettings.userId, set: { ...consents, updatedAt: now } })
    await tx.update(users).set({ birthDate: input.birthDate, tastes: input.tastes, displayName: input.nickname })
      .where(eq(users.id, userId))
  })

  try {
    const { granted } = await grantRecharge({
      userId, amount: WELCOME_GRANT.units, source: 'grant', provider: 'welcome', externalRef: userId,
      expiresAt: new Date(now.getTime() + WELCOME_GRANT.validDays * 86_400_000),
    })
    return { ok: true, welcomed: granted }
  } catch (e) {
    // 보상 지급 실패가 가입을 되돌리지는 않는다 — 운영자가 로그로 보고 수동 지급한다.
    observe('onboarding.welcome_grant_failed', { userId, error: (e as Error).message })
    return { ok: true, welcomed: false }
  }
}
