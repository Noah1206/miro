import { expect, type Page } from '@playwright/test'

/**
 * 소셜 로그인(개발 시뮬레이션)으로 새 계정을 만들고 온보딩(언어·닉네임·성별·취향·생년월일·약관)까지 통과한다. 사용한 이메일을 돌려준다.
 * 온보딩이 닉네임으로 페르소나를 만들고, 끝나면 가입 선물 시트가 뜬다 — 닫고 돌려준다.
 * 페르소나 관문을 시험하는 테스트는 { persona: false } — 온보딩이 만든 페르소나를 개발 API 로 지운다.
 */
export async function signUp(page: Page, base: string, email = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`, opts: { persona?: boolean } = {}): Promise<string> {
  // 이미 로그인 화면이면 그대로 진행한다 — 다시 이동하면 ?next= 가 날아간다.
  if (!/\/login/.test(page.url())) await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await expect(page).toHaveURL(/\/auth\/mock\/google/)
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByRole('button', { name: '계속' }).click()
  await expect(page).toHaveURL(/\/onboarding/)
  await passOnboardingProfile(page)
  // 약관은 '전체 동의하고 시작하기' 로 한 번에 켜고 진행한다.
  await page.getByRole('button', { name: '전체 동의하고 시작하기' }).click()
  // Wait for the signup action and redirect before a test starts another navigation.
  await expect(page).not.toHaveURL(/\/onboarding/)
  await closeWelcome(page)
  if (opts.persona === false) {
    const ok = await page.evaluate(async () => (await fetch('/api/dev/persona', { method: 'DELETE' })).ok)
    expect(ok).toBe(true)
  }
  return email
}

/** 온보딩 1~5단계(언어 → 닉네임 → 성별 → 취향 → 생년월일 건너뛰기). 약관 단계 앞에서 멈춘다. */
export async function passOnboardingProfile(page: Page, nickname = '테스터') {
  await page.getByRole('radio', { name: '한국어' }).click()
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByLabel('닉네임').fill(nickname)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('radio', { name: '밝히지 않음' }).click()
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('checkbox', { name: /HL/ }).click()
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await expect(page.getByRole('heading', { name: '시작하기 전에' })).toBeVisible()
}

/** 가입 선물 시트를 닫는다 — 닫으면 주소의 ?welcome=1 도 지워진다. */
export async function closeWelcome(page: Page) {
  const sheet = page.locator('[data-welcome-sheet]')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(sheet).toBeHidden()
}

/** 로그인한 사용자의 페르소나를 개발 API 로 만든다 — 화면을 옮기지 않는다. */
export async function createPersona(page: Page, name = '테스터') {
  const ok = await page.evaluate(async (n) => (await fetch('/api/dev/persona', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })).ok, name)
  expect(ok).toBe(true)
}

/**
 * 시드 캐릭터를 내 소유의 미로(reality) 캐릭터로 복제하고 그 id 를 돌려준다.
 * 시드는 chat 이라 사진·통화·Live·선연락이 열리지 않는다 — Reality 를 검증하는 테스트는 이걸로 들어간다.
 * 복제본은 비공개·비공식이라 다른 워커의 홈·미로·검색에 나타나지 않는다.
 */
export async function realityCharacter(page: Page, slug = 'thomas'): Promise<string> {
  const id = await page.evaluate(async (s) => {
    const r = await fetch('/api/dev/reality-character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: s }) })
    if (!r.ok) throw new Error(`reality clone failed: ${r.status}`)
    return ((await r.json()) as { id: string }).id
  }, slug)
  return id
}

/** 기존 계정으로 다시 로그인 시도. 결과 URL 을 돌려준다 (삭제된 계정이면 /login?error=deleted). */
export async function signInAgain(page: Page, base: string, email: string): Promise<string> {
  // 이미 로그인 화면이면 그대로 진행한다 — 다시 이동하면 ?next= 가 날아간다.
  if (!/\/login/.test(page.url())) await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByRole('button', { name: '계속' }).click()
  await page.waitForLoadState('networkidle')
  return page.url()
}

/** 가입 계정의 기본 시간대(Asia/Seoul) 오후 2시. 실행 머신의 TZ와 무관하다. */
export function daytime(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (name: string) => parts.find(p => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}T14:00:00+09:00`
}

/**
 * 만들기 화면에서 필수 네 칸(이름·소개·성격 설명·첫 장면)을 채워 게시한다. 끝나면 새 대화(/chat/…)에 있다.
 * 첫 장면은 인트로 탭의 전체 화면 편집기 안에 있다 — '인트로 확인'으로 닫아야 머리의 게시 버튼이 드러난다.
 * 공개 스위치는 기본으로 켜져 있다.
 */
/** 만들기는 미로 캐릭터 편집기로 바로 연다(2026-09-29: 유형 선택 없음). */
export async function enterCharacterCreate(page: Page, base: string) {
  await page.goto(`${base}/create`)
  await expect(page).toHaveURL(/\/create\?type=reality&draft=/)
  await expect(page.getByRole('heading', { name: '미로 캐릭터', exact: true })).toBeVisible()
}

export async function publishCharacter(page: Page, base: string, c: { name: string; personality: string; startingContext: string; isPublic?: boolean }) {
  await enterCharacterCreate(page, base)
  await page.locator('input[name="name"]').fill(c.name)
  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.locator('textarea[name="personality"]').fill(c.personality)
  if (c.isPublic === false) await page.getByRole('switch', { name: /다른 사람에게 공개/ }).uncheck({ force: true })
  await page.getByRole('tab', { name: '인트로', exact: true }).click()
  await page.locator('textarea[name="startingContext"]').fill(c.startingContext)
  await page.getByRole('button', { name: '인트로 확인' }).click()
  await page.getByRole('button', { name: '게시', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
}
