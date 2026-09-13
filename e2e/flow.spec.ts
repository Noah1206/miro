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

test('signup through entering a roleplay', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page).toHaveURL(/\/login/)
  // 가입/로그인이 나뉘지 않는다 — 소셜 버튼 하나. "계정이 없으신가요?" 는 안내를 펼친다.
  await page.getByRole('button', { name: '계정이 없으신가요?' }).click()
  await expect(page.getByText(/따로 가입하지 않아도/)).toBeVisible()
  await signUp(page, BASE)

  // 동의를 마치면 곧장 홈이다 — 별도의 시작 화면을 두지 않는다.
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('토마스')).toBeVisible()
  await expect(page.getByText('강태윤')).toBeVisible()
  await expect(page.getByText('히사시')).toBeVisible()

  await page.getByText('토마스').click()
  await expect(page).toHaveURL(/\/character\/thomas/)
  await expect(page.getByText('고서 복원가')).toBeVisible()
  await expect(page.getByText(/비 내리는 저녁/)).toBeVisible()

  await page.getByRole('button', { name: '역할극 시작하기' }).click()

  // 세션이 생성되고 저장된 세계 상태가 복구되어야 한다
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  await expect(page.getByText('런던 구시가지').first()).toBeVisible()
})

test('re-entering the same character continues the existing session', async ({ page }) => {
  const email = `e2e2-${Date.now()}@miro.dev`

  await signUp(page, BASE)

  await page.goto(`${BASE}/character/hisashi`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  const first = page.url()

  // 다시 들어가도 새 세션을 만들지 않는다
  await page.goto(`${BASE}/character/hisashi`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(first)
})
