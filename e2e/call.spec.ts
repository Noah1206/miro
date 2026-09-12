import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret'
function daytime() { const d = new Date(); d.setHours(14, 0, 0, 0); return d.toISOString() }

async function enterRoleplay(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`ca-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()
  await page.goto(`${BASE}/character/taeyun`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  return page.url().split('/chat/')[1]!
}

/** Scenario 4 — Incoming Video Call → Accept → Usage Guard → Call → End → Call State 저장 → Chat 기록. */
test('incoming video call: the user sees it is video before accepting, talks, hangs up, and the record lands in chat', async ({ page, request }) => {
  const sessionId = await enterRoleplay(page)
  await page.evaluate(async ([id]) => {
    await fetch(`/api/dev/session/${id}/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idleMinutes: 60 * 24, relationship: { trust: 50, attachment: 50, emotionalDistance: 40 },
        pendingIntent: { channel: 'video_call', reason: '얼굴 보고 싶어서', urgency: 0.95 },
      }),
    })
  }, [sessionId])
  await request.get(`${BASE}/api/cron/reality?now=${encodeURIComponent(daytime())}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

  await page.goto(`${BASE}/chat/${sessionId}`)
  const incoming = page.locator('[data-incoming-call="video"]')
  await expect(incoming).toBeVisible()
  await expect(incoming.getByText('영상통화 수신')).toBeVisible()          // 받기 전에 영상임을 안다
  await incoming.getByRole('button', { name: '영상으로 받기' }).click()

  await expect(page).toHaveURL(/\/call\//)
  await expect(page.locator('[data-call-channel="video"]')).toBeVisible()
  await expect(page.getByText(/Video Provider 미구성/)).toBeVisible()      // 실시간 영상인 척하지 않는다

  await page.getByPlaceholder('말하기…').fill('잘 지냈어요?')
  await page.getByRole('button', { name: '말하기' }).click()
  await expect(page.getByText('잘 지냈어요?')).toBeVisible()

  await page.getByRole('button', { name: '종료' }).click()
  await expect(page).toHaveURL(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-call-record]')).toContainText('영상통화')
  await expect(page.locator('[data-incoming-call]')).toHaveCount(0)

  await page.goto(`${BASE}/my`)
  await expect(page.locator('[data-usage-remaining]')).not.toHaveAttribute('data-usage-remaining', '100')  // 통화 시간이 차감됐다
})

test('declining leaves a record and no call screen', async ({ page, request }) => {
  const sessionId = await enterRoleplay(page)
  await page.evaluate(async ([id]) => {
    await fetch(`/api/dev/session/${id}/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idleMinutes: 60 * 24, relationship: { trust: 50, attachment: 50, emotionalDistance: 40 },
        pendingIntent: { channel: 'voice_call', reason: 'x', urgency: 0.9 } }),
    })
  }, [sessionId])
  await request.get(`${BASE}/api/cron/reality?now=${encodeURIComponent(daytime())}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
  await page.goto(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-incoming-call="voice"]')).toBeVisible()
  await page.getByRole('button', { name: '거절' }).click()
  await expect(page.locator('[data-call-record]')).toContainText('음성통화 거절')
})

test('outgoing voice call from the chat', async ({ page }) => {
  const sessionId = await enterRoleplay(page)
  await page.getByRole('button', { name: '통화', exact: true }).click()
  await expect(page).toHaveURL(/\/call\//)
  await expect(page.locator('[data-call-channel="voice"]')).toBeVisible()
  await page.getByRole('button', { name: '종료' }).click()
  await expect(page).toHaveURL(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-call-record]')).toContainText('음성통화')
})
