import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** 명세서 2.2 확장 — 공개한 캐릭터는 다른 사람의 홈·발견·상세에 실리고, 누구나 대화를 시작할 수 있다. */
test('공개한 캐릭터는 다른 사람이 발견해서 대화를 시작할 수 있다', async ({ browser }) => {
  const name = `공개${Date.now() % 100000}`

  // A: 만들고 공개
  const a = await (await browser.newContext()).newPage()
  await signUp(a, BASE)
  await a.goto(`${BASE}/create?mode=manual`)
  await a.locator('input[name="name"]').fill(name)
  await a.locator('input[name="title"]').fill('한 줄 소개')
  await a.getByRole('tab', { name: /성격/ }).click()
  await a.locator('textarea[name="personality"]').fill('말이 짧고 군더더기가 없다.')
  await a.getByRole('tab', { name: /인트로/ }).click()
  await a.locator('textarea[name="startingContext"]').fill('비 내리는 저녁, 공방을 처음 찾았다.')
  await a.getByRole('button', { name: '등록' }).click()
  await expect(a).toHaveURL(/\/chat\//)

  // 만들기에는 공개 스위치가 없다 — 편집 페이지의 공개 섹션에서 켠다.
  const sessionId = a.url().split('/chat/')[1]!
  const { characterId } = await a.evaluate(async (id) => (await fetch(`/api/dev/session/${id}`)).json(), sessionId)
  await a.goto(`${BASE}/my/characters/${characterId}/edit`)
  const pub = a.locator('form', { has: a.getByRole('checkbox', { name: /다른 사람에게 공개/ }) })
  await pub.getByRole('checkbox', { name: /다른 사람에게 공개/ }).check({ force: true })
  await pub.getByRole('button', { name: '저장' }).click()
  await expect(pub.getByRole('button', { name: '저장됨' })).toBeVisible()

  // B: 발견에서 보고 들어가 대화 시작
  const b = await (await browser.newContext()).newPage()
  await signUp(b, BASE)
  await b.goto(`${BASE}/discover`)
  await b.getByRole('link', { name: new RegExp(name) }).first().click()
  await expect(b).toHaveURL(/\/character\//)
  await expect(b.getByRole('heading', { name })).toBeVisible()
  await b.getByRole('button', { name: '대화 시작하기' }).click()
  await expect(b).toHaveURL(/\/chat\//)
})

test('공개하지 않은 캐릭터는 다른 사람에게 보이지 않는다', async ({ browser }) => {
  const name = `비공개${Date.now() % 100000}`
  const a = await (await browser.newContext()).newPage()
  await signUp(a, BASE)
  await a.goto(`${BASE}/create?mode=manual`)
  await a.locator('input[name="name"]').fill(name)
  await a.locator('input[name="title"]').fill('한 줄 소개')
  await a.getByRole('tab', { name: /성격/ }).click()
  await a.locator('textarea[name="personality"]').fill('조용하다.')
  await a.getByRole('tab', { name: /인트로/ }).click()
  await a.locator('textarea[name="startingContext"]').fill('첫 만남.')
  await a.getByRole('button', { name: '등록' }).click()
  await expect(a).toHaveURL(/\/chat\//)

  const b = await (await browser.newContext()).newPage()
  await signUp(b, BASE)
  await b.goto(`${BASE}/discover`)
  await expect(b.getByText(name)).toHaveCount(0)
})
