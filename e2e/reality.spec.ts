import { realityCharacter, signUp, daytime } from './helpers'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret'

const CRON = `/api/cron/reality?now=${encodeURIComponent(daytime())}`

/** 선연락은 미로 캐릭터에만 온다. 시드의 reality 복제본으로 들어간다. */
async function enterRoleplay(page: Page, slug = 'thomas') {
  await signUp(page, BASE)
  const id = await realityCharacter(page, slug)
  await page.goto(`${BASE}/character/${id}`)
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

  // 재진입: 캐릭터가 먼저 보낸 편지는 문자 페이지에 있고, 캐릭터챗에는 섞이지 않는다 (9/26: 두 페이지 분리)
  await page.goto(`${BASE}/messages/${sessionId}`)
  await expect(page.locator('[data-reality-message]')).toBeVisible()
  await expect(page.locator('[data-reality-message]').getByText('편지')).toBeVisible()
  await expect(page.getByRole('heading', { name: '토마스', exact: true })).toBeVisible()
  await page.goto(`${BASE}/chat/${sessionId}`)
  await expect(page.locator('[data-reality-message]')).toHaveCount(0)
  await expect(page.getByText('의뢰 건으로 왔습니다.')).toBeVisible()
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

  await page.goto(`${BASE}/messages/${sessionId}`)
  await expect(page.locator('[data-reality-message]')).toHaveCount(0)
})

/**
 * 문자 페이지 — 캐릭터가 근무 중이면 답장이 미뤄지고, 그동안 보낸 문자도 막히지 않는다.
 * (9/26 회귀: 미뤄진 문자가 요청을 'pending' 으로 남겨 15분 동안 다음 문자가 '저장 충돌' 로 실패했다.)
 */
test('texting a busy character: replies are deferred and a second text is not blocked', async ({ page }) => {
  const sessionId = await enterRoleplay(page)
  const db = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!
  const { execFileSync } = await import('node:child_process')
  execFileSync('psql', ['-X', '-q', db, '-c', `update contact_profiles cp set routine = '{"version":1,"source":"authored","note":null,"generatedAt":"x","blocks":[{"days":[],"start":"00:00","end":"23:59","label":"근무","availability":"busy"}]}'::jsonb from roleplay_sessions rs where rs.id = '${sessionId}' and cp.character_id = rs.character_id`])

  await page.goto(`${BASE}/messages/${sessionId}`)
  const input = page.getByLabel('문자 입력')
  await input.fill('바빠?')
  await page.getByRole('button', { name: '보내기' }).click()
  await expect(page.locator('[data-reply-delayed]')).toContainText('근무')
  await input.fill('끝나면 연락해')
  await page.getByRole('button', { name: '보내기' }).click()
  await expect(page.getByText('끝나면 연락해')).toBeVisible()
  // 입력창의 오류 문구(저장 충돌 등)가 없어야 한다 — Next 의 경로 안내기도 role=alert 라 입력창 안만 본다.
  await expect(page.locator('form').locator('xpath=..').getByRole('alert')).toHaveCount(0)
  await expect(page.locator('[data-reply-delayed]')).toBeVisible()
  // 문자는 캐릭터챗 기록에 섞이지 않는다
  await page.goto(`${BASE}/chat/${sessionId}`)
  await expect(page.getByText('끝나면 연락해')).toHaveCount(0)
})
