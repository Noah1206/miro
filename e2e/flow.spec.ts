import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * Scenario 1 (부분) — Signup → 공식 캐릭터 → 역할극 시작.
 * Phase 4 에서 RP 턴까지 이어붙인다.
 */
test('terms cannot be skipped without checking every item', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await page.getByRole('link', { name: 'Google로 계속하기' }).click()
  await page.getByPlaceholder('이메일').fill(`gate-${Date.now()}@miro.dev`)
  await page.getByRole('button', { name: '계속' }).click()
  await expect(page).toHaveURL(/\/terms/)

  // '모두 동의하고 가입하기' 가 부분 일치로 함께 잡히므로 정확히 일치시킨다.
  const submit = page.getByRole('button', { name: /^(동의하고 가입하기|다음으로 진행하기)$/ })
  await expect(submit).toBeDisabled()

  const boxes = page.getByRole('checkbox')
  await expect(boxes).toHaveCount(3)
  await boxes.first().click()
  await expect(submit).toBeDisabled()            // 하나만으로는 열리지 않는다
  await boxes.nth(1).click(); await boxes.nth(2).click()
  await expect(submit).toBeEnabled()             // 전부 체크해야 열린다
  await expect(submit).toHaveText('다음으로 진행하기')

  // 다시 풀면 게이트가 닫히고 '모두 동의' 가 보이는 채로 돌아와야 한다
  // (AnimatePresence 재등장 시 버튼이 opacity 0 으로 남던 버그).
  await boxes.nth(2).click()
  await expect(submit).toBeDisabled()
  const agreeAll = page.getByRole('button', { name: '모두 동의하고 가입하기' })
  await expect(agreeAll).toBeVisible()
  await expect(agreeAll).toHaveCSS('opacity', '1')

  await agreeAll.click()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page).toHaveURL(/\/home/)
})

test('a visitor can browse before signing in, and lands back where they were', async ({ page }) => {
  await page.goto(`${BASE}/home`)
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()

  // 상세까지는 로그인 없이 볼 수 있고, 입장할 때 묻는다.
  await page.locator('a[href="/character/thomas"]').first().click()
  await expect(page).toHaveURL(/\/character\/thomas/)
  // 로그인은 화면을 떠나지 않고 시트로 묻는다 — 보던 캐릭터가 뒤에 그대로 남는다.
  await page.getByRole('button', { name: '로그인하고 시작하기' }).click()
  await expect(page.locator('[data-login-sheet]')).toBeVisible()
  await expect(page).toHaveURL(/\/character\/thomas/)
  // 시트의 제공자 버튼이 보던 곳으로 돌아올 next 를 들고 있다.
  await expect(page.locator('[data-login-provider="google"]'))
    .toHaveAttribute('href', /next=%2Fcharacter%2Fthomas/)

  // signUp 이 로그인 화면부터 진행하므로 시트를 닫고 평소 경로로 들어간다.
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/login?next=${encodeURIComponent('/character/thomas')}`)
  await signUp(page, BASE)
  // 로그인·동의를 마치면 보던 캐릭터로 돌아온다.
  await expect(page).toHaveURL(/\/character\/thomas/)
  await expect(page.getByRole('button', { name: '대화 시작하기' })).toBeVisible()
})

test('signup through entering a roleplay', async ({ page }) => {
  // 로그인 전에도 홈이 먼저다 — 무엇이 있는지 보여주고 나서 묻는다.
  await page.goto(`${BASE}/`)
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('토마스').first()).toBeVisible()
  // 헤더의 로그인도 화면을 떠나지 않고 시트로 묻는다 — 홈이 뒤에 그대로 남고, 돌아올 곳은 홈이다.
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.locator('[data-login-sheet]')).toBeVisible()
  await expect(page).toHaveURL(/\/home/)
  await expect(page.locator('[data-login-provider="google"]')).toHaveAttribute('href', /next=%2Fhome/)

  // signUp 이 로그인 화면부터 진행하므로 시트를 닫고 평소 경로로 들어간다. 로그인 화면은 직접 열면 그대로 있다.
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/login`)
  // 가입/로그인이 나뉘지 않는다 — 소셜 버튼 하나로 즉시 진행한다.
  await signUp(page, BASE)

  // 동의를 마치면 곧장 홈이다 — 별도의 시작 화면을 두지 않는다.
  await expect(page).toHaveURL(/\/home/)
  // 같은 캐릭터가 여러 행에 등장하므로 첫 번째만 본다.
  await expect(page.getByText('토마스').first()).toBeVisible()
  await expect(page.getByText('강태윤').first()).toBeVisible()
  await expect(page.getByText('히사시').first()).toBeVisible()

  await page.getByText('토마스').first().click()
  await expect(page).toHaveURL(/\/character\/thomas/)
  await expect(page.getByText('고서 복원가')).toBeVisible()
  await expect(page.getByText(/비 내리는 저녁/)).toBeVisible()

  await page.getByRole('button', { name: '대화 시작하기' }).click()

  // 세션이 생성되고 저장된 세계 상태가 복구되어야 한다
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { name: '토마스', exact: true })).toBeVisible()
})

test('re-entering the same character continues the existing session', async ({ page }) => {
  const email = `e2e2-${Date.now()}@miro.dev`

  await signUp(page, BASE)

  await page.goto(`${BASE}/character/hisashi`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  const first = page.url()

  // 다시 들어가도 새 세션을 만들지 않는다
  await page.goto(`${BASE}/character/hisashi`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(first)
})
