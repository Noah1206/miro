import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function enterRoleplay(page: Page) {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/taeyun`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

/** Scenario 3 — Free → 제공량 소진 → MIRO 대화는 계속 → Pro 전환 → 새 한도로 계속. */
test('a free user keeps chatting on MIRO after the allowance runs out, and upgrades', async ({ page }) => {
  await enterRoleplay(page)
  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')

  await composer.fill('첫 출근입니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(composer).toHaveValue('')
  await expect(page.getByText('첫 출근입니다.')).toBeVisible()

  // 창을 소진한다
  await page.evaluate(() => fetch('/api/dev/usage', { method: 'POST' }))

  // MIRO 기본 대화는 제공량과 무관하게 이어진다 — 한도 경고가 뜨지 않는다.
  await composer.fill('한 마디 더.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('한 마디 더.')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: '사용량을 모두 썼어요' })).toHaveCount(0)
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
  await page.goto(`${BASE}/my/subscription`)
  await expect(page.locator('[data-plan="pro"]')).toBeVisible()

  // 월간 창은 유지하고 Pro 한도를 즉시 적용한다.
  await expect(page.locator('[data-usage-remaining]')).not.toHaveAttribute('data-usage-remaining', '0')
})

test('subscription page shows the plan and reset time', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()
  await page.goto(`${BASE}/my/subscription`)
  await expect(page.locator('[data-plan="free"]')).toBeVisible()
  await expect(page.getByText(/에 초기화/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/호감도|신뢰 \d+/)
})

test('the recharge page reports real usage and sells nothing yet', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()

  // 내 요금제에서 충전소로 들어간다.
  await page.goto(`${BASE}/my/subscription`)
  await page.getByRole('link', { name: '충전소' }).click()
  await expect(page).toHaveURL(/\/recharge$/)

  // 실제 월간 사용량을 읽어 보여준다.
  await expect(page.locator('[data-usage-remaining]')).toBeVisible()
  await expect(page.getByText(/에 초기화/)).toBeVisible()
  // 상품과 잔액은 준비 중이라고만 말한다 — 가격도, 구매 버튼도, 가짜 0 잔액도 없다.
  await expect(page.locator('[data-recharge-products="pending"]')).toBeVisible()
  await expect(page.locator('[data-recharge-balance="unavailable"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /구매|결제|충전하기/ })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/원 |₩|\$/)

  // 제공량을 다 써도 충전소는 소진 상태와 MIRO 로 이어가는 길을 알린다.
  await page.evaluate(() => fetch('/api/dev/usage', { method: 'POST' }))
  await page.reload()
  await expect(page.locator('[data-usage-spent]')).toContainText('MIRO 기본 대화는 계속 이어갈 수 있어요')
})

test('the recharge page requires a login', async ({ page }) => {
  await page.goto(`${BASE}/recharge`)
  await expect(page).toHaveURL(/\/login/)
})
