import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function createCharacter(page: import('@playwright/test').Page, name: string) {
  await signUp(page, BASE)

  await page.goto(`${BASE}/create`)
  await page.locator('input[name="name"]').fill(name)
  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.getByRole('tab', { name: /성격/ }).click()
  await page.locator('textarea[name="personality"]').fill('무뚝뚝한 외과의.')
  await page.getByRole('tab', { name: /상황/ }).click()
  await page.locator('textarea[name="startingContext"]').fill('같은 병원 복도.')
  await page.getByRole('button', { name: '확인' }).click()
  await page.getByRole('button', { name: '등록' }).click()
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

test('편집은 만들기와 같은 폼이고, 저장하면 소개 페이지로 돌아온다', async ({ page }) => {
  await createCharacter(page, '한도윤')
  const characterId = await characterIdOf(page)

  await page.goto(`${BASE}/my/characters/${characterId}/edit`)
  await expect(page.locator('input[name="name"]')).toHaveValue('한도윤')

  await page.getByRole('tab', { name: /성격/ }).click()
  await page.locator('textarea[name="personality"]').fill('말수가 적고 환자 앞에서만 부드러워진다.')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page).toHaveURL(new RegExp(`/character/${characterId}`))

  // 다시 열면 고친 값이 남아 있고, 안 건드린 이름은 그대로
  await page.goto(`${BASE}/my/characters/${characterId}/edit`)
  await expect(page.locator('textarea[name="personality"]')).toHaveValue('말수가 적고 환자 앞에서만 부드러워진다.')
  await expect(page.locator('input[name="name"]')).toHaveValue('한도윤')
})

test('another user cannot open someone else\'s editor', async ({ page, browser }) => {
  await createCharacter(page, '남의캐릭터')
  const characterId = await characterIdOf(page)

  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signUp(otherPage, BASE)

  const res = await otherPage.goto(`${BASE}/my/characters/${characterId}/edit`)
  // Next streams the not-found boundary with 200 after headers have been sent.
  await expect(otherPage.getByRole('heading', { name: '404', exact: true })).toBeVisible()
  await expect(otherPage.locator('input[name="name"]')).toHaveCount(0)
  await other.close()
})
