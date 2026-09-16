import { expect, type Page } from '@playwright/test'

/** 소셜 로그인(개발 시뮬레이션)으로 새 계정을 만들고 약관까지 통과한다. 사용한 이메일을 돌려준다. */
export async function signUp(page: Page, base: string, email = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`): Promise<string> {
  // 이미 로그인 화면이면 그대로 진행한다 — 다시 이동하면 ?next= 가 날아간다.
  if (!/\/login/.test(page.url())) await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await expect(page).toHaveURL(/\/auth\/mock\/google/)
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByRole('button', { name: '계속' }).click()
  await expect(page).toHaveURL(/\/terms/)
  // 동의는 실제로 체크해야 열린다 — '모두 동의' 로 한 번에 켜고 진행한다.
  await page.getByRole('button', { name: '모두 동의하고 가입하기' }).click()
  await page.getByRole('button', { name: '다음으로 진행하기' }).click()
  // Wait for the signup action and redirect before a test starts another navigation.
  await expect(page).not.toHaveURL(/\/terms(?:\?|$)/)
  return email
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
