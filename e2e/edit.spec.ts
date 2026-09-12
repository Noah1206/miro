import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function createCharacter(page: import('@playwright/test').Page, name: string) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()

  await page.goto(`${BASE}/create`)
  await page.getByPlaceholder('어떤 캐릭터를 원하시나요?').fill('무뚝뚝한 외과의')
  await page.getByRole('button', { name: '초안 만들기' }).click()
  await page.locator('input[name="name"]').fill(name)
  await page.getByRole('button', { name: '저장하고 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)
}

/** page 컨텍스트로 조회해야 세션 쿠키가 실린다. */
async function characterIdOf(page: import('@playwright/test').Page): Promise<string> {
  const sessionId = page.url().split('/chat/')[1]!
  const body = await page.evaluate(
    async (id) => (await fetch(`/api/dev/session/${id}`)).json(),
    sessionId,
  )
  expect(body.characterId).toBeTruthy()
  return body.characterId as string
}

test('advanced editor saves one section without touching others', async ({ page }) => {
  await createCharacter(page, '한도윤')
  const characterId = await characterIdOf(page)

  await page.goto(`${BASE}/my/characters/${characterId}/edit`)
  await expect(page.getByRole('heading', { name: '한도윤' })).toBeVisible()

  // 성격 섹션만 저장
  const personality = page.locator('form', { hasText: '성격' }).first()
  await personality.locator('textarea[name="personality"]').fill('말수가 적고 환자 앞에서만 부드러워진다.')
  await personality.getByRole('button', { name: '저장' }).click()
  await expect(personality.getByRole('button', { name: '저장됨' })).toBeVisible()

  // 새로고침해도 유지된다
  await page.reload()
  await expect(page.locator('textarea[name="personality"]'))
    .toHaveValue('말수가 적고 환자 앞에서만 부드러워진다.')
  // 이름은 건드리지 않았으므로 그대로
  await expect(page.locator('input[name="name"]')).toHaveValue('한도윤')
})

test('another user cannot open someone else\'s editor', async ({ page, browser }) => {
  await createCharacter(page, '남의캐릭터')
  const characterId = await characterIdOf(page)

  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await otherPage.goto(`${BASE}/login`)
  await otherPage.getByRole('tab', { name: '회원가입' }).click()
  await otherPage.getByPlaceholder('이메일').fill(`x-${Date.now()}@miro.dev`)
  await otherPage.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await otherPage.getByRole('button', { name: '회원가입' }).click()
  await otherPage.getByRole('button', { name: '모두 동의하고 시작하기' }).click()

  const res = await otherPage.goto(`${BASE}/my/characters/${characterId}/edit`)
  expect(res?.status()).toBe(404)
  await other.close()
})
