import { signInAgain, signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function signup(page: Page) {
  return signUp(page, BASE, `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
}
async function roleplay(page: Page, slug = 'thomas') {
  await page.goto(`${BASE}/character/${slug}`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  return page.url().split('/chat/')[1]!
}

test('archive: list, archive, restore, delete with confirmation, and empty state', async ({ page }) => {
  await signup(page)
  await page.goto(`${BASE}/archive`)
  await expect(page.getByText('진행 중인 역할극이 없습니다.')).toBeVisible()
  const id = await roleplay(page)
  await page.goto(`${BASE}/archive`)
  const row = page.locator('[data-session-row]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('토마스')
  await expect(row).toContainText('런던 구시가지')
  await expect(page.locator('body')).not.toContainText(/신뢰|호감도/)

  // 목록을 나누지 않는다 — 보관해도 같은 자리에 '보관됨' 으로 남는다.
  await row.getByRole('button', { name: '보관' }).click()
  await expect(page.locator('[data-session-row][data-status="archived"]')).toHaveCount(1)
  await expect(page.locator('[data-session-row]')).toContainText('보관됨')
  await page.getByRole('button', { name: '복원' }).click()
  await expect(page.locator('[data-session-row][data-status="active"]')).toHaveCount(1)

  await page.goto(`${BASE}/archive`)
  await page.getByRole('link', { name: '삭제' }).click()
  await expect(page).toHaveURL(new RegExp(`/archive/delete/${id}`))
  await expect(page.getByText(/복구를 요청할 수 있으며/)).toBeVisible()
  await page.getByRole('button', { name: '삭제 확정' }).click()
  await expect(page.getByText('역할극을 삭제했습니다.')).toBeVisible()
  await expect(page.locator('[data-session-row]')).toHaveCount(0)
  // 삭제된 대화는 열 수 없다
  expect((await page.goto(`${BASE}/chat/${id}`))?.status()).toBe(404)
})

test('settings: quiet hours off is saved and survives reload', async ({ page }) => {
  await signup(page)
  await page.goto(`${BASE}/my/settings`)
  const quiet = page.getByLabel(/야간 연락 차단/)
  await expect(quiet).toBeChecked()                      // 기본 차단 (명세서 5.1)
  await quiet.uncheck()
  await page.getByLabel('시작').fill('22:00')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('button', { name: '저장됨' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(/야간 연락 차단/)).not.toBeChecked()
  await expect(page.getByLabel('시작')).toHaveValue('22:00')
})

test('report a character message and see it accepted; duplicates are refused', async ({ page }) => {
  await signup(page); await roleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()
  await page.getByRole('link', { name: '신고' }).first().click()
  await expect(page).toHaveURL(/\/report\?type=message/)
  const reportUrl = page.url()
  await page.getByLabel('괴롭힘·혐오').check()
  await page.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.locator('[data-report-done]')).toBeVisible()
  await page.goto(reportUrl)
  await page.getByLabel('기타').check()
  await page.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '이미 접수된 신고' })).toBeVisible()
})

test('adult verification: failure locks for 24h; success unlocks the mature toggle', async ({ page }) => {
  await signup(page)
  await page.goto(`${BASE}/my/verify`)
  await expect(page.getByText(/성인 인증 Provider 미구성/)).toBeVisible()
  await page.getByLabel('생년월일').fill('2015-01-01')
  await page.getByLabel(/사용 정책에 동의/).check()
  await page.getByRole('button', { name: '인증하기' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '인증에 실패' }).first()).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-verify-locked]')).toBeVisible()   // 24시간 잠금

  // 다른 사용자로 성공 경로
  await page.context().clearCookies()
  await signup(page)
  await page.goto(`${BASE}/my/verify`)
  await page.getByLabel('생년월일').fill('1990-05-05')
  await page.getByLabel(/사용 정책에 동의/).check()
  await page.getByRole('button', { name: '인증하기' }).click()
  await expect(page.locator('[data-verified]')).toBeVisible()
  await roleplay(page)
  await expect(page.getByLabel('성인')).toBeVisible()
})

test('unverified users never see the mature toggle', async ({ page }) => {
  await signup(page); await roleplay(page)
  await expect(page.getByLabel('성인')).toHaveCount(0)
})

test('account delete: impact shown, then login is refused', async ({ page }) => {
  const email = await signup(page); await roleplay(page)
  await page.goto(`${BASE}/my/delete`)
  await expect(page.locator('[data-impact]')).toContainText('역할극 1개')
  await page.getByRole('button', { name: '계정 삭제 확정' }).click()
  await expect(page.locator('[data-account-deleted]')).toBeVisible()
  const back = await signInAgain(page, BASE, email)
  expect(back).toMatch(/\/login\?error=deleted/)
  await expect(page.getByRole('alert').filter({ hasText: '삭제된 계정' })).toBeVisible()
})
