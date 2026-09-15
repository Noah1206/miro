import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret'

/** 오늘 14:00 현지 — 세 캐릭터의 활동 시간 안, Quiet Hours 밖. 테스트가 실행 시각에 묶이지 않게 한다. */
function daytime(): string {
  const d = new Date(); d.setHours(14, 0, 0, 0); return d.toISOString()
}
const CRON = `/api/cron/reality?now=${encodeURIComponent(daytime())}`

async function enterRoleplay(page: Page, slug = 'thomas') {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/${slug}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
  return page.url().split('/chat/')[1]!
}

/**
 * Scenario 1 (후반) — RP → 앱 종료 → Reality Contact 판단 → 재진입 시 상태 유지.
 * Push 자체는 브라우저 밖이라 검증하지 않고, 인앱 메시지 도달과 세계관 표현을 검증한다.
 */
test('the character reaches out while the user is away, in the world\'s own idiom', async ({ page, request }) => {
  const sessionId = await enterRoleplay(page, 'thomas')

  // 한 턴 진행해 관계를 만든다
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('의뢰 건으로 왔습니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')).toHaveValue('')
  await expect(page.getByText('의뢰 건으로 왔습니다.')).toBeVisible()

  // 앱을 떠났다 — 며칠 지났고, 관계가 형성돼 있으며, 그 사이 공방에 일이 생겼다
  await page.evaluate(async ([id]) => {
    await fetch(`/api/dev/session/${id}/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idleMinutes: 60 * 24 * 2,
        relationship: { trust: 50, attachment: 50, emotionalDistance: 45 },
        activeEvent: { type: 'crisis', summary: '공방에 물이 샜다' },
      }),
    })
  }, [sessionId])
  await page.goto(`${BASE}/home`)

  // 서버 스케줄러가 돈다 (앱이 닫혀 있어도 도는 경로)
  const cron = await request.get(`${BASE}${CRON}`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  })
  expect(cron.status()).toBe(200)
  const run = await cron.json()
  expect(run.claimed).toBeGreaterThanOrEqual(1)

  // 재진입: 캐릭터가 먼저 보낸 편지가 있고, 기존 대화와 세계 상태도 그대로다
  await page.goto(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-reality-message]')).toBeVisible()
  await expect(page.getByText('토마스 · 편지')).toBeVisible()
  await expect(page.getByText('의뢰 건으로 왔습니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '토마스', exact: true })).toBeVisible()
})

test('the cron endpoint refuses calls without the secret', async ({ request }) => {
  expect((await request.get(`${BASE}/api/cron/reality`)).status()).toBe(401)
  expect((await request.get(`${BASE}/api/cron/reality`, { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401)
})

test('a fresh stranger with nothing going on is left alone', async ({ page, request }) => {
  const sessionId = await enterRoleplay(page, 'taeyun')
  await page.evaluate(async ([id]) => {
    await fetch(`/api/dev/session/${id}/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idleMinutes: 60 * 24 * 10 }),
    })
  }, [sessionId])
  await request.get(`${BASE}${CRON}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })

  await page.goto(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-reality-message]')).toHaveCount(0)
})
