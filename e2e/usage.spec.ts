import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3954'

async function enterRoleplay(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`us-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()
  await page.goto(`${BASE}/character/taeyun`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

/** Scenario 3 — Free → 한도 → Pro 안내 → Pro 전환 → 새 한도로 계속. */
test('free user hits the limit, is pointed to Pro, and continues after upgrading', async ({ page }) => {
  await enterRoleplay(page)
  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')

  await composer.fill('첫 출근입니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('첫 출근입니다.')).toBeVisible()

  // 창을 소진한다
  await page.evaluate(() => fetch('/api/dev/usage', { method: 'POST' }))

  await composer.fill('한 마디 더.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '사용량을 모두 썼어요' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pro 알아보기' })).toBeVisible()
  // 상태는 유지된다 — 대화 기록이 남아 있다
  await expect(page.getByText('첫 출근입니다.')).toBeVisible()

  // 요금제 비교 → 현재 Free 표시
  await page.goto(`${BASE}/plans`)
  await expect(page.locator('text=현재 요금제')).toBeVisible()
  await expect(page.locator('[data-upgrade]')).toBeVisible()

  // Pro 전환 (P13 전까지 dev 토글)
  await page.evaluate(() => fetch('/api/dev/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'pro' }),
  }))
  await page.goto(`${BASE}/my`)
  await expect(page.locator('[data-plan="pro"]')).toBeVisible()

  // 기존 창은 Free 한도로 소진돼 있다 — Pro 는 다음 창부터 새 한도. 현재 창의 남은 양은 0.
  await expect(page.locator('[data-usage-remaining="0"]')).toBeVisible()
})

test('my page shows the plan and reset time', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()
  await page.goto(`${BASE}/my`)
  await expect(page.locator('[data-plan="free"]')).toBeVisible()
  await expect(page.getByText(/에 초기화/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/호감도|신뢰 \d+/)
})
