import { publishCharacter, signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** 명세서 2.2 확장 — 공개한 캐릭터는 다른 사람의 홈·발견·상세에 실리고, 누구나 대화를 시작할 수 있다. */
test('공개한 캐릭터는 다른 사람이 발견해서 대화를 시작할 수 있다', async ({ browser }) => {
  const name = `공개${Date.now() % 100000}`

  // A: 만들고 공개
  const a = await (await browser.newContext()).newPage()
  await signUp(a, BASE)
  await publishCharacter(a, BASE, { name, personality: '말이 짧고 군더더기가 없다.', startingContext: '비 내리는 저녁, 공방을 처음 찾았다.' })

  // 만들기의 공개 스위치는 기본으로 켜져 있다 — 편집 페이지에서도 켜진 채 저장되는지 본다.
  const sessionId = a.url().split('/chat/')[1]!
  const { characterId } = await a.evaluate(async (id) => (await fetch(`/api/dev/session/${id}`)).json(), sessionId)
  await a.goto(`${BASE}/my/characters/${characterId}/edit`)
  await a.getByRole('switch', { name: /다른 사람에게 공개/ }).check({ force: true })
  await a.getByRole('button', { name: '저장' }).click()
  await expect(a).toHaveURL(/\/character\//)

  // B: 홈 전체 목록(최신순) 앞쪽에서 찾아 들어가 대화 시작 — 검색 페이지는 없어졌다(2026-09-30).
  const b = await (await browser.newContext()).newPage()
  await signUp(b, BASE)
  await b.goto(`${BASE}/home`)
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
  // 만들기의 공개 스위치는 기본으로 켜져 있다 — 이 테스트는 끄고 게시한다.
  await publishCharacter(a, BASE, { name, personality: '조용하다.', startingContext: '첫 만남.', isPublic: false })

  const b = await (await browser.newContext()).newPage()
  await signUp(b, BASE)
  await b.goto(`${BASE}/home`)
  await expect(b.getByRole('heading', { name: '장르' })).toBeVisible()
  await expect(b.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)
})

test('예전 /discover·/home/search 링크는 홈으로 간다', async ({ page }) => {
  for (const path of ['/discover?q=%EB%B9%84%EA%B3%B5%EA%B0%9C', '/home/search?q=%EB%B9%84%EA%B3%B5%EA%B0%9C']) {
    await page.goto(`${BASE}${path}`)
    await expect(page).toHaveURL(/\/home(\?|$)/)
  }
})

test('하단 첫 탭은 미로(홈)이고, 공식 미로 캐릭터가 실린다', async ({ page }) => {
  await page.goto(`${BASE}/home`)
  // 2026-09-30: 홈 탭 이름이 '미로' 이고 따로 있던 미로 탭(/miro)은 내비에서 빠졌다.
  await expect(page.locator('nav a[href="/home"]')).toHaveText(/미로/)
  await expect(page.locator('nav a[href="/miro"]')).toHaveCount(0)
  await expect(page.locator('nav a[href="/discover"]')).toHaveCount(0)
  // 앱은 미로 캐릭터만 — 공식 시드도 미로 캐릭터라 홈에 실린다.
  await expect(page.getByRole('link', { name: /토마스/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /강태윤/ }).first()).toBeVisible()
})
