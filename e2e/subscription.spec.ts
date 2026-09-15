import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
async function signupAndPlay(page: Page) {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/taeyun`); await page.getByRole('button', { name: '대화 시작하기' }).click(); await expect(page).toHaveURL(/\/chat\//)
}

/** Scenario 3 (완결) — Free → 제공량 소진 → 요금제 안내 → 결제 → 새 한도로 즉시 계속. */
test('free user hits the wall, subscribes, and continues in the same window', async ({ page }) => {
  await signupAndPlay(page)
  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')
  await composer.fill('첫 마디.'); await page.getByRole('button', { name: '전송' }).click(); await expect(page.getByText('첫 마디.')).toBeVisible()
  await page.evaluate(() => fetch('/api/dev/usage', { method: 'POST' }))
  // 제공량을 다 써도 MIRO 대화는 막히지 않는다 — 업그레이드는 요금제 화면에서 시작한다.
  await composer.fill('막힌 마디.'); await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('막힌 마디.')).toBeVisible()
  await page.goto(`${BASE}/plans`)
  await page.locator('[data-upgrade]').click()
  await expect(page).toHaveURL(/\/subscribe/)
  await expect(page.getByText(/실제 결제가 일어나지 않는/)).toBeVisible()      // Mock 임을 숨기지 않는다
  await expect(page.getByText(/1개월 이용권: 9,900원/)).toBeVisible()
  await expect(page.getByText(/자동 결제되지 않고/)).toBeVisible()   // 자동 갱신이 없음을 구매 전에 밝힌다
  await page.locator('[data-checkout]').click()
  await expect(page.locator('[data-mock-checkout]')).toBeVisible()
  await page.getByRole('button', { name: '결제 성공' }).click()
  await expect(page.locator('[data-payment-result="success"]')).toBeVisible()

  await page.goto(`${BASE}/my/subscription`); await expect(page.locator('[data-plan="pro"]')).toBeVisible()
  await page.goto(`${BASE}/archive`)
  await page.locator('[data-session-row] a').first().click()
  await expect(page).toHaveURL(/\/chat\//)
  await composer.fill('이제 되나.'); await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('이제 되나.')).toBeVisible()                    // 같은 창에서 바로 이어진다
})

test('a failed payment grants nothing; a bought pass runs to its end date; restore works', async ({ page }) => {
  await signupAndPlay(page)
  await page.goto(`${BASE}/subscribe`); await page.locator('[data-checkout]').click()
  await page.getByRole('button', { name: '결제 실패' }).click()
  await expect(page.locator('[data-payment-result="failed"]')).toBeVisible()
  await page.goto(`${BASE}/my/subscription`); await expect(page.locator('[data-plan="free"]')).toBeVisible()

  await page.goto(`${BASE}/subscribe`); await page.locator('[data-checkout]').click(); await page.getByRole('button', { name: '결제 성공' }).click()
  await expect(page.locator('[data-payment-result="success"]')).toBeVisible()   // 서버 액션 완료를 기다린 뒤 이동한다
  await page.goto(`${BASE}/my/subscription`); await expect(page.locator('[data-sub-status="active"]')).toBeVisible()
  // 자동 갱신이 없으므로 해지 버튼도 없다 — 기간이 끝나는 날짜를 그대로 보여준다.
  await expect(page.getByRole('button', { name: '구독 해지' })).toHaveCount(0)
  await expect(page.locator('[data-keeps-until]')).toContainText('까지 유지')
  await page.goto(`${BASE}/my/subscription`); await expect(page.locator('[data-plan="pro"]')).toBeVisible()
})

test('the webhook rejects a bad signature', async ({ request }) => {
  const r = await request.post(`${BASE}/api/payments/webhook`, { data: { checkoutId: 'mockco_x_y', outcome: 'success' }, headers: { 'x-payment-signature': 'mock:nope' } })
  expect(r.status()).toBe(400)
})
