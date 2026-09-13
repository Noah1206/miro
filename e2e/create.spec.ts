import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function signup(page: import('@playwright/test').Page) {
  await signUp(page, BASE)
  await expect(page).toHaveURL(/\/home/)
}

/** Scenario 2 (부분) — Character Create → RP 진입. */
test('quick create produces an editable draft and starts a roleplay', async ({ page }) => {
  await signup(page)
  await page.goto(`${BASE}/create`)

  await page.getByPlaceholder('어떤 캐릭터를 원하시나요?')
    .fill('다른 사람한텐 싸가지 없는데 나한테만 잘해주는 30살 검사')
  await page.getByRole('button', { name: 'AI 로 초안 만들기' }).click()

  // 초안이 도착하면 폼으로 넘어간다 — 빈칸이 이미 채워진 상태로.
  await expect(page.getByRole('heading', { name: '캐릭터', exact: true })).toBeVisible()

  // Provider 미구성 상태는 사용자에게 숨기지 않는다
  await expect(page.getByText(/Mock 출력입니다/)).toBeVisible()

  // 이름은 편집 가능해야 한다 — 확정값이 아니라 Draft 다
  const nameField = page.locator('input[name="name"]')
  await expect(nameField).toBeVisible()
  await nameField.fill('윤지훈')
  // 한 장짜리 폼이다 — 이름과 제목만 채우면 바로 저장된다.
  await page.locator('input[name="title"]').fill('검사와의 계약')
  await page.getByRole('button', { name: '저장하고 시작하기' }).click()

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  await expect(page.getByText('윤지훈').first()).toBeVisible()
})

test('rejects input that is too short to build from', async ({ page }) => {
  await signup(page)
  await page.goto(`${BASE}/create`)
  await page.getByPlaceholder('어떤 캐릭터를 원하시나요?').fill('음')
  await page.getByRole('button', { name: 'AI 로 초안 만들기' }).click()
  await expect(page.getByText('조금 더 자세히 적어 주세요.')).toBeVisible()
})
