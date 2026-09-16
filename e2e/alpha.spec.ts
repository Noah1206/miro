import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** Closed Alpha — 로그인 없이 랜딩 → 대화 → 관계 변화 → 리얼리티 메시지 → 웨이트리스트. AI 는 mock 이어도 흐름은 끝까지 돈다. */
test('알파: 회원가입 없이 대화하고, 행동에 따라 유진이 먼저 메시지를 보내고, 웨이트리스트로 이어진다', async ({ page, request }) => {
  // 알파의 '먼저 오는 메시지' 는 미로(reality) 캐릭터에만 열린다. 시드 유진은 chat 이므로 운영자가
  // /characters 에서 하는 지정을 여기서 dev 라우트로 대신한다. 운영 DB 의 유진은 지정하지 않았다.
  const designated = await request.post(`${BASE}/api/dev/character-type`, { data: { slug: 'yujin', type: 'reality' } })
  expect(designated.ok()).toBe(true)
  await page.goto(`${BASE}/alpha`)
  await expect(page.getByText('아까 전화 왜 안 받았어?')).toBeVisible()
  await page.getByRole('button', { name: '답장하기' }).click()
  await expect(page).toHaveURL(/\/alpha\/chat/)

  // 빠른 답장 → 유진의 답 (정식 파이프라인: 의미 이벤트 → 규칙 → 상태 → AI → 검증 → 커밋)
  await page.getByRole('button', { name: '친구들이랑 있었어' }).click()
  await expect(page.getByRole('log')).toContainText('친구들이랑 있었어')
  await expect(page.getByRole('log').locator('p').nth(2)).toBeVisible({ timeout: 30000 })

  // 자유 입력 — 질투 규칙(jealousy_spike) → 답장 뒤 유진이 먼저 메시지를 보낸다 (리얼리티 메시지, 즉시 발송)
  await page.getByLabel('메시지 입력').fill('오늘 다른 남자랑 술 마셨어')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-reality-message]').first()).toBeVisible({ timeout: 45000 })

  // 관계 숫자는 화면 어디에도 없다
  await expect(page.locator('body')).not.toContainText(/affection|jealousy|trust/i)

  // 웨이트리스트 — 이메일 하나
  await page.goto(`${BASE}/alpha/waitlist`)
  await page.getByLabel('이메일').fill(`alpha-${Date.now()}@miro.dev`)
  await page.getByRole('button', { name: '이 관계 계속하기' }).click()
  await expect(page.getByText('다음 Alpha에서 이어갈 수 있도록 알려드릴게요.')).toBeVisible()
})

test('알파: 세션 쿠키 없이 대화 화면에 오면 랜딩으로 돌려보낸다', async ({ page }) => {
  await page.goto(`${BASE}/alpha/chat`)
  await expect(page).toHaveURL(/\/alpha$/)
})
