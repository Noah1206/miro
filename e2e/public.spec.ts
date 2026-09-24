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

  // B: 이름으로 검색해서 들어가 대화 시작 — 빈 검색은 기본 목록을 싣지 않으므로 검색어가 필요하다.
  const b = await (await browser.newContext()).newPage()
  await signUp(b, BASE)
  await b.goto(`${BASE}/home/search?q=${encodeURIComponent(name)}`)
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
  await b.goto(`${BASE}/home/search?q=${encodeURIComponent(name)}`)
  await expect(b.getByText('검색 결과가 없어요. 검색어나 장르를 바꿔보세요.')).toBeVisible()
  await expect(b.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)
})

test('예전 /discover 링크는 검색어를 들고 /home/search 로 간다', async ({ page }) => {
  await page.goto(`${BASE}/discover?q=%EB%B9%84%EA%B3%B5%EA%B0%9C`)
  await expect(page).toHaveURL(/\/home\/search\?q=/)
  expect(new URL(page.url()).searchParams.get('q')).toBe('비공개')
})

test('하단 탭의 발견 자리는 미로이고, 미로에는 지정된 캐릭터만 실린다', async ({ page }) => {
  await page.goto(`${BASE}/home`)
  await expect(page.locator('nav a[href="/miro"]')).toHaveText(/미로/)
  await expect(page.locator('nav a[href="/discover"]')).toHaveCount(0)
  await page.locator('nav a[href="/miro"]').click()
  await expect(page).toHaveURL(/\/miro$/)
  await expect(page.getByRole('heading', { name: '미로' })).toBeVisible()
  // 시드는 chat 으로 시작한다. 지정하지 않은 공식 캐릭터는 여기 나오지 않는다 —
  // (알파 spec 이 유진을 지정하므로 '비어 있음' 은 단정하지 않고, 지정되지 않은 쪽만 본다.)
  await expect(page.getByRole('link', { name: /토마스/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /강태윤/ })).toHaveCount(0)
})
