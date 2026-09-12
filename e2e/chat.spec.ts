import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function enterRoleplay(page: Page, slug = 'thomas') {
  await page.goto(`${BASE}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`rp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()
  await page.goto(`${BASE}/character/${slug}`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

test('a free-form turn persists and the world header reflects state', async ({ page }) => {
  await enterRoleplay(page)

  // 현재 세계 상태가 헤더에 보인다
  await expect(page.getByText(/런던 구시가지 · 저녁/).first()).toBeVisible()

  const composer = page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…')
  await composer.fill('책상을 주먹으로 친다.\n"그건 제 실수가 아닙니다."')
  await page.getByRole('button', { name: '전송' }).click()

  // 사용자 입력과 캐릭터 응답이 모두 남는다
  await expect(page.getByText('그건 제 실수가 아닙니다')).toBeVisible()
  await expect(page.getByText(/Mock 응답입니다/)).toBeVisible()
  await expect(page.locator('text=토마스:')).toBeVisible()
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
  await expect(page.getByText(/런던 구시가지/).first()).toBeVisible()
})

test('output style can be switched', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByRole('button', { name: '서사형' }).click()
  await expect(page.getByRole('button', { name: '서사형' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: '서사형' })).toHaveAttribute('aria-pressed', 'true')
})

test('relationship numbers are never shown to the user', async ({ page }) => {
  await enterRoleplay(page)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()

  const body = await page.locator('body').innerText()
  expect(body).not.toMatch(/호감도|신뢰 \d+|애착 \d+|관계 수치/)
})
