import { expect, test, type Page } from '@playwright/test'
const WEB = process.env.E2E_BASE ?? 'http://localhost:3957'
const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3157'

async function userReports(page: Page) {
  await page.goto(`${WEB}/login`)
  await page.getByRole('tab', { name: '회원가입' }).click()
  await page.getByPlaceholder('이메일').fill(`ad-${Date.now()}@miro.dev`)
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill('password123')
  await page.getByRole('button', { name: '회원가입' }).click()
  await page.getByRole('button', { name: '모두 동의하고 시작하기' }).click()
  await page.goto(`${WEB}/character/thomas`)
  await page.getByRole('button', { name: '역할극 시작하기' }).click()
  await expect(page).toHaveURL(/\/chat\//)   // 리다이렉트 완료 후에 URL 을 잡는다
  const chat = page.url()
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('신고할 내용입니다.')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('신고할 내용입니다.')).toBeVisible()
  await page.getByRole('link', { name: '신고' }).first().click()
  await page.getByLabel('안전 정책 위반').check()
  await page.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.locator('[data-report-done]')).toBeVisible()
  const reportId = new URL(page.url()).searchParams.get('id')!
  return { chat, reportId }
}

test('admin flow: login → report list → detail with context → restrict → audit; user sees the restriction', async ({ page, browser }) => {
  const { chat, reportId } = await userReports(page)

  const admin = await (await browser.newContext()).newPage()
  await admin.goto(`${ADMIN}/reports`)
  await expect(admin).toHaveURL(/\/login/)                          // 미인증은 진입 불가
  await admin.getByPlaceholder('이메일').fill('e2e-admin@miro.dev')
  await admin.getByPlaceholder('비밀번호').fill('admin-pass-123')
  await admin.getByRole('button', { name: '로그인' }).click()
  await expect(admin).toHaveURL(/\/reports/)
  await expect(admin.locator('[data-admin-role="superadmin"]')).toBeVisible()

  await expect(admin.locator('[data-report-row]').first()).toBeVisible()
  // 병렬 테스트가 만든 다른 신고와 섞이지 않도록 이 사용자의 신고로 바로 간다
  await admin.goto(`${ADMIN}/reports/${reportId}`)
  // 신고 대상은 캐릭터의 응답이다 — 사용자 자신의 메시지는 신고할 수 없다
  await expect(admin.locator('[data-report-snapshot]')).toContainText('토마스')
  await admin.getByPlaceholder(/검토 메모/).fill('안전 정책 위반 확인')
  await admin.getByRole('button', { name: '역할극 제한' }).click()
  await expect(admin.locator('[data-act-result="ok"]')).toBeVisible()
  await expect(admin.locator('[data-report-status]')).toHaveText('resolved')
  await expect(admin.locator('[data-history-row]')).toHaveCount(1)
  await admin.goto(`${ADMIN}/audit`)
  await expect(admin.locator('[data-audit-row]').first()).toContainText('restrict_session')

  // 사용자 쪽: 제한이 적용되어 새 턴이 거부된다. 상태는 삭제되지 않는다.
  await page.goto(chat)
  await expect(page.locator('[data-restricted]')).toBeVisible()
  await expect(page.getByText('신고할 내용입니다.')).toBeVisible()
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('한 마디 더')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '제한되었습니다' })).toBeVisible()
})

test('a wrong password does not get in, and the admin origin serves nothing to the user app', async ({ page }) => {
  await page.goto(`${ADMIN}/login`)
  await page.getByPlaceholder('이메일').fill('e2e-admin@miro.dev')
  await page.getByPlaceholder('비밀번호').fill('wrong')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '실패' })).toBeVisible()
  expect((await page.goto(`${WEB}/admin`))?.status()).toBe(404)
})
