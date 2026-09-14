import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** Scenario 2 (부분) — Character Create → RP 진입. 만들기는 바로 폼이다 (AI 초안 경로 없음). */
test('필수 세 칸을 채우면 등록되고 역할극이 시작된다', async ({ page }) => {
  await signUp(page, BASE)
  await page.goto(`${BASE}/create`)

  // 필수가 비어 있으면 등록은 잠김.
  await expect(page.getByRole('button', { name: '등록' })).toBeDisabled()

  await page.locator('input[name="name"]').fill('윤지훈')

  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.getByRole('tab', { name: /성격/ }).click()
  await page.locator('textarea[name="personality"]').fill('다른 사람한텐 싸가지 없는데 나한테만 잘해준다.')
  await page.getByRole('tab', { name: /인트로/ }).click()
  await page.locator('textarea[name="startingContext"]').fill('검찰청 복도에서 처음 마주쳤다.')

  await expect(page.getByRole('button', { name: '등록' })).toBeEnabled()
  await page.getByRole('button', { name: '등록' }).click()

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  await expect(page.getByText('윤지훈').first()).toBeVisible()
})

test('임시저장은 이름만 있으면 되고, 편집 화면으로 간다', async ({ page }) => {
  await signUp(page, BASE)
  await page.goto(`${BASE}/create`)
  await expect(page.getByRole('button', { name: '임시저장' })).toBeDisabled()
  await page.locator('input[name="name"]').fill('초안')
  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.getByRole('button', { name: '임시저장' }).click()
  await expect(page).toHaveURL(/\/my\/characters\/[0-9a-f-]{36}\/edit/)
})
