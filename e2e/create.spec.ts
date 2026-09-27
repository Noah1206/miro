import { signUp } from './helpers'
import { expect, test } from '@playwright/test'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * Scenario 2 (부분) — Character Create → RP 진입. 만들기는 바로 폼이다 (AI 초안 경로 없음).
 * 머리에는 게시 버튼 하나만 있다 — 임시저장 버튼은 만들기 화면에서 없어졌다.
 */
test('필수 네 칸을 채우면 게시되고 역할극이 시작된다', async ({ page }) => {
  await signUp(page, BASE)
  await page.goto(`${BASE}/create`)
  const publish = page.getByRole('button', { name: '게시', exact: true })

  // 필수가 비어 있으면 게시는 잠기고, 버튼 옆에 무엇이 비었는지 보인다.
  await expect(publish).toBeDisabled()
  await expect(page.getByText('이름 · 소개 · 성격 · 첫 장면 입력', { exact: true })).toBeVisible()

  // 이름·소개·성격 설명은 첫 탭(프로필)에 함께 있다.
  await page.locator('input[name="name"]').fill('윤지훈')
  await page.locator('input[name="title"]').fill('한 줄 소개')
  await page.locator('textarea[name="personality"]').fill('다른 사람한텐 싸가지 없는데 나한테만 잘해준다.')
  await expect(page.getByText('첫 장면 입력', { exact: true })).toBeVisible()
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
