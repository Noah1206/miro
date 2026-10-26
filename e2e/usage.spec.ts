import { confirmConversationPersona, signUp } from './helpers'
import { WELCOME_GRANT } from '../packages/config/src'
import { db, rechargeGrants, users, eq } from '../packages/db/src'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function enterRoleplay(page: Page) {
  const email = await signUp(page, BASE)
  await page.goto(`${BASE}/character/taeyun`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  await confirmConversationPersona(page)
  return email
}

test('exhausting a monthly window preserves the signup wallet and existing conversation', async ({ page }) => {
  await enterRoleplay(page)
  const chat = page.url()
  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')
  await composer.fill('첫 출근입니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(composer).toHaveValue('')
  await expect(page.getByText('첫 출근입니다.')).toBeVisible()
  expect((await page.request.post(`${BASE}/api/dev/usage`)).ok()).toBe(true)
  const usage = await (await page.request.get(`${BASE}/api/usage`)).json()
  expect(usage.providedTokens).toBe(0)
  // The mock provider costs zero. Monthly exhaustion must not debit the signup grant.
  expect(usage.tokensRemaining).toBe(WELCOME_GRANT.units)
  await page.goto(`${BASE}/my/subscription`)
  await expect(page.locator('main [data-token-balance]:visible').last()).toHaveAttribute('data-token-balance', String(WELCOME_GRANT.units))
  await page.goto(chat)
  await expect(page.getByText('첫 출근입니다.')).toBeVisible()
})

test('token history shows the actual wallet without an obsolete subscription meter', async ({ page }) => {
  await signUp(page, BASE)
  await page.goto(`${BASE}/my/subscription`)
  await expect(page.getByRole('heading', { name: '토큰 사용 내역' })).toBeVisible()
  await expect(page.locator('main [data-token-balance]:visible').last()).toHaveAttribute('data-token-balance', String(WELCOME_GRANT.units))
  await expect(page.getByRole('heading', { name: '최근 내역' })).toBeVisible()
  await expect(page.getByRole('meter')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/호감도|신뢰 \d+/)
})

test('recharge shows refund terms and an empty wallet asks for tokens', async ({ page }) => {
  const email = await signUp(page, BASE)
  await page.goto(`${BASE}/recharge`)
  await expect(page.locator(`main [data-recharge-balance="${WELCOME_GRANT.units}"]`)).toBeVisible()
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '충전', exact: true })).toContainText('충전할 금액')
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await page.getByRole('button', { name: '도움말' }).click()
  await expect(page.locator('[data-refund-terms]')).toContainText('7일')
  // Local fixture: remove the gift as well as the monthly balance to exercise real exhaustion.
  const [user] = await db.select().from(users).where(eq(users.email, email))
  await db.update(rechargeGrants).set({ status: 'revoked' }).where(eq(rechargeGrants.userId, user!.id))
  expect((await page.request.post(`${BASE}/api/dev/usage`)).ok()).toBe(true)
  await page.reload()
  await expect(page.locator('[data-usage-spent]')).toContainText('토큰을 충전하면 대화를 이어갈 수 있어요.')
})

test('the recharge page requires a login', async ({ page }) => {
  await page.goto(`${BASE}/recharge`)
  await expect(page).toHaveURL(/\/home\?.*login=1/)
})
