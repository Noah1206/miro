import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * Scenario 1 (부분) — Signup → 공식 캐릭터 → 역할극 시작.
 * Phase 4 에서 RP 턴까지 이어붙인다.
 */
test('signup through entering a roleplay', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByRole('link', { name: '시작하기' }).click()
  await expect(page).toHaveURL(/\/login/)
  // 가입/로그인이 나뉘지 않는다 — 소셜 버튼 하나. "계정이 없으신가요?" 는 안내를 펼친다.
  await page.getByRole('button', { name: '계정이 없으신가요?' }).click()
  await expect(page.getByText(/따로 가입하지 않아도/)).toBeVisible()
  await signUp(page, BASE)

  await expect(page).toHaveURL(/\/welcome/)
  await page.getByRole('link', { name: /MIRO ORIGINALS/ }).click()

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
