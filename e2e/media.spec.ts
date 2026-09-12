import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3951'

async function enterRoleplay(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`md-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()
  await page.goto(`${BASE}/character/thomas`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

test('a character photo appears in the chat', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByRole('button', { name: '사진' }).click()

  const photo = page.getByAltText('캐릭터가 보낸 사진')
  await expect(photo).toBeVisible()
  // Provider 미구성 상태를 숨기지 않는다
  await expect(page.getByText(/Image Provider 미구성/)).toBeVisible()
})

test('live scene continues the same simulation and returns to chat', async ({ page }) => {
  await enterRoleplay(page)
  const chatUrl = page.url()
  const sessionId = chatUrl.split('/chat/')[1]!

  await page.getByRole('link', { name: 'Live Scene' }).click()
  await expect(page).toHaveURL(new RegExp(`/live/${sessionId}`))

  // Chat 과 같은 세계 상태를 쓴다
  await expect(page.getByText(/런던 구시가지 · 저녁/)).toBeVisible()

  // 제안 행동은 힌트일 뿐 — 자유 입력이 항상 가능하다
  await page.getByPlaceholder('무엇을 하시겠어요?').fill('창가로 걸어가 커튼을 걷는다.')
  await page.getByRole('button', { name: '행동' }).click()
  await expect(page.getByText('창가로 걸어가 커튼을 걷는다.')).toBeVisible()

  // Chat 으로 돌아오면 Live Scene 의 결과가 이어진다
  await page.getByRole('link', { name: '‹ 대화로' }).click()
  await expect(page).toHaveURL(chatUrl)
  await expect(page.getByText('창가로 걸어가 커튼을 걷는다.')).toBeVisible()
})

test('a suggested action only fills the input, never submits for the user', async ({ page }) => {
  await enterRoleplay(page)
  await page.goto(`${BASE}/live/${page.url().split('/chat/')[1]}`)

  await page.getByRole('button', { name: '가만히 지켜본다.' }).click()
  await expect(page.getByPlaceholder('무엇을 하시겠어요?')).toHaveValue('가만히 지켜본다.')
  // 아직 전송되지 않았다
  await expect(page.locator('p', { hasText: '가만히 지켜본다.' })).toHaveCount(0)
})
