import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { db, bankTransferOrders, callSessions, contactProfiles, rechargeGrants, users } from '../packages/db/src'
import { testDatabaseUrl } from '../tooling/test-database'
import { realityCharacter, signUp } from './helpers'

if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Wallet E2E needs an explicit local test DATABASE_URL')
// The db workspace owns the existing Drizzle dependency.
const { eq } = createRequire(join(__dirname, '../packages/db/package.json'))('drizzle-orm')
const WEB = process.env.E2E_BASE ?? 'http://localhost:3200'
const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3300'

async function enter(page: Page, empty = true) {
  const email = await signUp(page, WEB)
  const id = await realityCharacter(page)
  await db.update(contactProfiles).set({ routine: { version: 1, source: 'authored', generatedAt: new Date().toISOString(), note: null,
    blocks: [{ days: [], start: '00:00', end: '23:59', label: '테스트 자유 시간', availability: 'free' }] } }).where(eq(contactProfiles.characterId, id))
  await page.goto(`${WEB}/character/${id}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  const sessionId = page.url().split('/chat/')[1]!
  if (empty) expect((await page.request.post(`${WEB}/api/dev/usage`)).ok()).toBe(true)
  await page.goto(`${WEB}/messages/${sessionId}`)
  const [user] = await db.select().from(users).where(eq(users.email, email))
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

test('insufficient balance → recharge → admin approval → settlement → original call once', async ({ page, browser, request }) => {
  const { userId, sessionId } = await enter(page)
  await page.getByRole('button', { name: '통화', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('크레딧이 부족해요')
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
  await page.getByRole('button', { name: '충전하고 이어가기' }).click()
  await page.locator('input[value="recharge:e2e_small"]').check()
  const a11y = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(a11y.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  await page.getByRole('button', { name: '입금 안내 받기' }).click()
  const awaiting = page.locator('[data-bank-order="awaiting"]')
  await expect(awaiting).toBeVisible()
  await expect(page).toHaveURL(`${WEB}/messages/${sessionId}`)
  await expect(page.locator('[data-sheet-balance="0"]')).toBeVisible()
  // 대조 코드는 화면에서 ? 를 눌러야 보인다 — 테스트는 주문 행에서 읽는다.
  const [placed] = await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))
  await approve(browser, placed!.referenceCode)
  // '입금 확인하기' 는 송금 버튼을 누른 뒤에만 열린다. 외부 앱·웹 이동은 막아 둔다.
  await expect(page.locator('[data-confirm-deposit]')).toBeDisabled()
  await page.evaluate(() => { window.open = () => null })
  await awaiting.locator('[data-open-bank="toss"]').click()
  await page.getByRole('button', { name: '입금 확인하기' }).click()
  await expect(page.locator('[data-bank-order="approved"]')).toContainText('지급 대기')
  await expect(page.locator('[data-sheet-balance="0"]')).toBeVisible()
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
  expect((await request.get(`${WEB}/api/cron/reality`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` } })).ok()).toBe(true)
  await page.getByRole('button', { name: '입금 확인하기' }).click()
  await expect(page).toHaveURL(/\/call\//)
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(1)
  expect(await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.userId, userId))).toHaveLength(1)
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await expect(page).toHaveURL(`${WEB}/messages/${sessionId}`)
  await page.goto(`${WEB}/recharge`)
  await expect(page.locator('[data-recharge-balance="295"]')).toBeVisible()
  await expect(page.locator('[data-wallet-history]')).toContainText('음성통화')
  await expect(page.locator('[data-wallet-history]')).toContainText('크레딧 충전')
  await page.getByRole('button', { name: '전체 내역' }).click()
  await expect(page.getByRole('dialog', { name: 'Miro Pay 전체 내역' })).toContainText('지급 완료')
})

test('closing the sheet cancels the pending action; credit arriving later never starts a call', async ({ page }) => {
  const { userId, sessionId } = await enter(page)
  await page.getByRole('button', { name: '통화', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '나중에', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await db.insert(rechargeGrants).values({ userId, source: 'grant', amount: 20 })
  await page.goto(`${WEB}/recharge`)
  await expect(page.locator('[data-recharge-balance="20"]')).toBeVisible()
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
})

test('a failed balance read can retry; sufficient funds start one call without a purchase confirmation', async ({ page }) => {
  const { sessionId } = await enter(page, false)
  let fail = true
  await page.route(`**/messages/${sessionId}`, route => {
    if (fail && route.request().method() === 'POST') { fail = false; return route.abort('failed') }
    return route.continue()
  })
  await page.getByRole('button', { name: '통화', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('잔액을 불러오지 못했어요')
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(0)
  await page.getByRole('button', { name: '다시 확인하기' }).click()
  await expect(page).toHaveURL(/\/call\//)
  expect(await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId))).toHaveLength(1)
  await page.getByRole('button', { name: '종료', exact: true }).click()
})
