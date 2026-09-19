import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function enterRoleplay(page: Page, slug = 'thomas') {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/${slug}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

/**
 * 생성 실패는 유저가 손쓸 수 있는 일이 아니다 — 오류 문구 대신 기다림을 이어 둔다.
 * 다만 유저를 가두지는 않는다: 입력은 계속 가능하고, 한참 뒤에는 조용히 거둔다.
 */
test('a generation failure keeps waiting instead of showing an error', async ({ page }) => {
  await enterRoleplay(page)
  const composer = page.getByRole('textbox', { name: '역할극 입력' })

  // 서버 액션의 성공 응답을 생성 실패로 바꿔 흘린다 — 실패를 강제할 장치가 따로 없다.
  await page.route('**/chat/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const res = await route.fetch()
    const body = (await res.text()).replace(/"succeeded":true/g, '"keepWaiting":true')
    await route.fulfill({ response: res, body })
  })

  await composer.fill('실패해도 오류 문구는 뜨지 않아야 해요.')
  await page.getByRole('button', { name: '전송', exact: true }).click()

  // 캐릭터가 아직 쓰는 중인 것처럼 보인다 — 오류 문구가 아니라.
  await expect(page.getByRole('status')).toContainText('입력 중')
  // 생성 실패 문구는 어디에도 없다.
  await expect(page.getByText('지금은 답을 만들지 못했어요')).toHaveCount(0)
  await expect(page.getByText('연결이 끊겼어요')).toHaveCount(0)

  // 유저는 갇히지 않는다 — 계속 쓸 수 있다.
  await expect(composer).toBeEnabled({ timeout: 30_000 })
})
