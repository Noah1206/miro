import { enterCharacterCreate, signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/** 유형 선택 → 필수 항목 검증 → 게시 → 저장한 세계로 대화 진입. */
test('필수 네 칸을 채우면 게시되고 역할극이 시작된다', async ({ page }) => {
  await signUp(page, BASE)
  await enterCharacterCreate(page, BASE)
  const publish = page.getByRole('button', { name: '게시', exact: true })

  // 필수가 비어 있으면 게시가 잠긴다. 사용자가 삭제한 중복 안내는 다시 요구하지 않는다.
  await expect(publish).toBeDisabled()
  await expect(page.getByRole('button', { name: '임시저장', exact: true })).toBeDisabled()

  // 이름·소개·성격 설명은 첫 탭(프로필)에 함께 있다.
  await page.locator('input[name="name"]').fill('윤지훈')
  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.locator('textarea[name="personality"]').fill('다른 사람한텐 싸가지 없는데 나한테만 잘해준다.')
  await expect(page.getByRole('button', { name: '임시저장', exact: true })).toBeEnabled()
  await expect(publish).toBeDisabled()

  // 첫 장면은 인트로 탭의 전체 화면 편집기에 있다. 확인으로 닫아야 게시 버튼이 드러난다.
  await page.getByRole('tab', { name: '인트로', exact: true }).click()
  await page.locator('textarea[name="startingContext"]').fill('검찰청 복도에서 처음 마주쳤다.')
  // 첫 장면의 장소는 선택이다. 적으면 세계가 거기서 시작한다.
  await page.locator('input[name="worldLocation"]').fill('검찰청 복도')
  await page.getByRole('button', { name: '인트로 확인' }).click()

  // 다 채우면 버튼 옆 안내가 공개 여부로 바뀐다. 공개 스위치는 기본으로 켜져 있다.
  await expect(page.getByText('공개 게시', { exact: true })).toBeVisible()
  await expect(publish).toBeEnabled()
  await publish.click()

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  await expect(page.getByText('윤지훈').first()).toBeVisible()
  // 세계는 적은 장소에서 시작한다 — '어딘가' 가 아니다.
  await page.getByRole('button', { name: '윤지훈 — 관계와 세계 보기' }).click()
  const world = page.getByRole('dialog').getByText(/검찰청 복도/)
  await expect(world).toBeVisible()
  await expect(world).not.toContainText('어딘가')
})

test('/create 는 미로 캐릭터로 바로 열고, 비공개 초안을 재개해 게시하면 다음 만들기는 새 초안이다', async ({ page }) => {
  await signUp(page, BASE)
  // 하단 만들기 탭은 없다(2026-09-30) — 만들기는 주소로 연다. 유형 선택 없이 미로 캐릭터 편집기로 간다.
  await expect(page.getByRole('button', { name: '만들기', exact: true })).toHaveCount(0)
  await page.goto(`${BASE}/create`)
  await expect(page).toHaveURL(/\/create\?type=reality&draft=/)
  await expect(page.getByRole('heading', { name: '미로 캐릭터', exact: true })).toBeVisible()
  await page.locator('input[name="name"]').fill('비공개서점')
  await page.locator('input[name="title"]').fill('따뜻한 차를 건네는 서점 주인')
  await page.locator('textarea[name="personality"]').fill('차분하고 다정한 존댓말을 쓴다.')
  await page.getByRole('switch', { name: /다른 사람에게 공개/ }).uncheck({ force: true })
  await page.getByRole('tab', { name: '인트로', exact: true }).click()
  await page.locator('textarea[name="startingContext"]').fill('비 오는 저녁의 서점에서 만났다.')
  await page.getByRole('button', { name: '인트로 확인' }).click()
  await page.getByRole('button', { name: '임시저장', exact: true }).click()
  await expect(page).toHaveURL(/\/my\/characters\/[0-9a-f-]+\/edit$/)
  await page.reload()
  await expect(page.getByRole('switch', { name: /다른 사람에게 공개/ })).not.toBeChecked()
  await expect(page.locator('input[name="name"]')).toHaveValue('비공개서점')
  await page.getByRole('button', { name: '게시', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/)
  await page.goto(`${BASE}/my/characters?filter=private`)
  await expect(page.getByRole('link', { name: /비공개서점, 비공개/ })).toBeVisible()
  await page.goto(`${BASE}/create`)
  await expect(page).toHaveURL(/\/create\?type=reality&draft=/)
  await expect(page.locator('input[name="name"]')).toHaveValue('')
})

test('옛 일반 캐릭터 만들기 주소도 미로 캐릭터 만들기로 간다', async ({ page }) => {
  await signUp(page, BASE)
  await page.goto(`${BASE}/create?type=chat`)
  await expect(page).toHaveURL(/\/create\?type=reality&draft=/)
  await expect(page.getByRole('heading', { name: '미로 캐릭터', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '관계', exact: true })).toBeVisible()
})
