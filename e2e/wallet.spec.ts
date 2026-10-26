import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { db, bankTransferOrders, callSessions, contactProfiles, rechargeGrants, users } from '../packages/db/src'
import { testDatabaseUrl } from '../tooling/test-database'
import { confirmConversationPersona, realityCharacter, signUp } from './helpers'

if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Wallet E2E needs an explicit local test DATABASE_URL')
// The db workspace owns the existing Drizzle dependency.
const { eq } = createRequire(join(__dirname, '../packages/db/package.json'))('drizzle-orm')
const WEB = process.env.E2E_BASE ?? 'http://localhost:3200'
const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3300'

async function enter(page: Page, empty = true) {
  const email = await signUp(page, WEB)
  const [user] = await db.select().from(users).where(eq(users.email, email))
  const id = await realityCharacter(page)
  await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', generatedAt: new Date().toISOString(), note: null,
    blocks: [{ days: [], start: '00:00', end: '23:59', label: '테스트 자유 시간', availability: 'free' }] } }).where(eq(contactProfiles.characterId, id))
  await page.goto(`${WEB}/character/${id}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  await confirmConversationPersona(page)
  const sessionId = page.url().split('/chat/')[1]!
  if (empty) {
    expect((await page.request.post(`${WEB}/api/dev/usage`)).ok()).toBe(true)
    // 가입 선물(300 미로, 2026-09-30 부터)도 지운다 — '잔액 부족' 흐름은 충전 잔액이 0 이어야 보인다.
    await db.update(rechargeGrants).set({ status: 'revoked' }).where(eq(rechargeGrants.userId, user!.id))
  }
  await page.goto(`${WEB}/messages/${sessionId}`)
  return { sessionId, userId: user!.id }
}

async function approve(browser: Browser, code: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  try {
    const admin = await context.newPage()
    await admin.goto(`${ADMIN}/payments`)
    await admin.getByPlaceholder('이메일').fill('e2e-admin@miro.dev')
    await admin.getByPlaceholder('비밀번호').fill('admin-pass-123')
    await admin.getByRole('button', { name: '로그인' }).click()
    await expect(admin.locator('[data-admin-role="superadmin"]')).toBeVisible()
    await admin.goto(`${ADMIN}/payments?status=awaiting`)
    const row = admin.locator(`[data-order-code="${code}"]`)
    await row.getByPlaceholder('입금 확인 메모').fill('로컬 테스트 입금 확인')
    await row.locator('[data-approve]').click()
    await expect(row).toHaveCount(0)
  } finally { await context.close() }
}

// These financial flows do not register a real browser push subscription.
// Exercise the app's supported no-Web-Push path independently of a locally configured VAPID key.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { Reflect.deleteProperty(window, 'PushManager') }) })

test('recharge → admin approval → settlement credits once without starting a retired call', async ({ page, browser, request }) => {
  const { userId, sessionId } = await enter(page)
  await page.goto(`${WEB}/my`)
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '충전', exact: true })).toBeVisible()
  await page.locator('input[value="recharge:e2e_small"]').check()
  const a11y = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(a11y.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  await page.getByRole('button', { name: '다음으로' }).click()
  await expect(page.locator('[data-bank-order="awaiting"]')).toBeVisible()
  await expect(page.locator('[data-sheet-balance="0"]')).toBeVisible()
  const [placed] = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))
  expect(placed).toBeDefined()
  await approve(browser, placed!.referenceCode)
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
  expect((await request.get(`${WEB}/api/cron/reality`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` } })).ok()).toBe(true)
  await page.goto(`${WEB}/recharge`)
  await expect(page.locator('[data-recharge-balance="300"]')).toBeVisible()
  await expect(page.locator('[data-wallet-history]')).toContainText('토큰 충전')
  await page.getByRole('button', { name: '전체 내역' }).click()
  await expect(page.getByRole('dialog', { name: 'Miro Pay 전체 내역' })).toContainText('지급 완료')
  expect(await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))).toHaveLength(1)
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
})

test('closing recharge never starts a call when credit arrives later', async ({ page }) => {
  const { userId, sessionId } = await enter(page)
  await expect(page.getByRole('button', { name: '통화', exact: true })).toHaveCount(0)
  await page.goto(`${WEB}/my`)
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '충전', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await db.insert(rechargeGrants).values({ userId, source: 'grant', amount: 20 })
  await page.goto(`${WEB}/recharge`)
  await expect(page.locator('[data-recharge-balance="20"]')).toBeVisible()
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
  expect(await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))).toHaveLength(0)
})

test('a failed recharge balance read can be retried by reopening, without starting a call', async ({ page }) => {
  const { sessionId } = await enter(page, false)
  await page.goto(`${WEB}/my`)
  let fail = true
  await page.route('**/my', route => {
    if (fail && route.request().method() === 'POST') { fail = false; return route.abort('failed') }
    return route.continue()
  })
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('잔액을 불러오지 못했어요')
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '충전', exact: true })).toContainText('충전할 금액')
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0)
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
})
