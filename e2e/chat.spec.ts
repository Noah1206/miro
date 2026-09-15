import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function enterRoleplay(page: Page, slug = 'thomas') {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/${slug}`)
  await page.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

test('a free-form turn persists and the world header reflects state', async ({ page }) => {
  await enterRoleplay(page)

  // 현재 세계 상태가 헤더에 보인다
  await expect(page.getByRole('heading', { name: '토마스', exact: true })).toBeVisible()

  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')
  await composer.fill('책상을 주먹으로 친다.\n"그건 제 실수가 아닙니다."')
  await page.getByRole('button', { name: '전송' }).click()

  // 사용자 입력과 캐릭터 응답이 모두 남는다
  await expect(page.getByText(/그건 제 실수가 아닙니다/).first()).toBeVisible()
  await expect(page.getByText(/Mock 응답입니다/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: '역할극 입력' })).toHaveValue('')
})

test('state survives leaving and re-entering the chat', async ({ page }) => {
  await enterRoleplay(page)
  const url = page.url()

  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('처음 뵙겠습니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('처음 뵙겠습니다.')).toBeVisible()

  // 앱을 떠났다가 돌아온다
  await page.goto(`${BASE}/home`)
  await page.goto(url)

  // 마지막 메시지가 아니라 대화 전체와 세계 상태가 복구된다
  await expect(page.getByText('처음 뵙겠습니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '토마스', exact: true })).toBeVisible()
})

test('model menu defaults to MIRO and keeps ECHO closed to a free account', async ({ page }) => {
  await enterRoleplay(page)
  const picker = page.getByRole('button', { name: 'AI 모델 선택' })
  await expect(picker).toHaveText('MIRO')
  await picker.click()
  await expect(page.getByRole('dialog', { name: '모델 선택' })).toBeVisible()
  await expect(page.getByText(/MIRO 기본 대화는 무료예요/)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: /편하게 이어가는 일상 대화/ })).toHaveAttribute('aria-pressed', 'true')
  // ECHO 는 같은 모델을 쓰지만 Pro 전용이다 — Free 계정에는 열리지 않는다.
  await expect(page.getByRole('dialog').getByRole('button', { name: /ECHO/ })).toBeDisabled()
  await expect(page.getByText('서사형', { exact: true })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(picker).toBeFocused()
  await page.reload()
  await expect(picker).toHaveText('MIRO')
})

test('relationship numbers are never shown to the user', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()

  const body = await page.locator('body').innerText()
  expect(body).not.toMatch(/호감도|신뢰 \d+|애착 \d+|관계 수치/)
})


test('unsent draft survives reload and a failed transport preserves it', async ({ page }) => {
  await enterRoleplay(page)
  const composer = page.getByRole('textbox', { name: '역할극 입력' })
  await composer.fill('이 내용은 실패해도 남아야 해요.')
  await page.reload()
  await expect(composer).toHaveValue('이 내용은 실패해도 남아야 해요.')
  await page.route('**/chat/**', async route => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await page.getByRole('button', { name: '전송', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '연결이 끊겼어요' })).toBeVisible()
  await expect(composer).toHaveValue('이 내용은 실패해도 남아야 해요.')
  await page.unroute('**/chat/**')
  await page.getByRole('button', { name: '전송', exact: true }).click()
  await expect(composer).toHaveValue('')
  await expect(page.getByText('이 내용은 실패해도 남아야 해요.', { exact: true })).toHaveCount(1)
})
