import { signUp } from './helpers'
import { expect, test } from '@playwright/test'
const WEB = process.env.E2E_BASE ?? 'http://localhost:3000'
const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3100'

/**
 * 계좌이체 한 바퀴: 주문 → 운영자 승인 → cron 지급 → 사용자 반영.
 * 주문만으로는 아무것도 지급되지 않는다는 것이 이 테스트의 핵심이다.
 */
test('bank transfer: an order pays out only after an admin confirms the deposit', async ({ page, browser, request }) => {
  await signUp(page, WEB)
  await page.goto(`${WEB}/recharge`)

  // 1) 주문 — 입금 계좌와 대조 코드를 받는다. 아직 Pro 가 아니다.
  // 환불 조건은 사기 전에 보여야 한다.
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  // 환불 조건은 사기 전에 볼 수 있다 — 시트의 ? 뒤에 있다.
  await page.getByRole('dialog').getByRole('button', { name: '도움말' }).click()
  await expect(page.locator('[data-refund-terms]')).toContainText('7일')
  await page.locator('input[value="pass"]').check()
  await page.getByRole('button', { name: '입금 안내 받기' }).click()
  const awaiting = page.locator('[data-bank-order="awaiting"]')
  await expect(awaiting.locator('[data-order-amount="9900"]')).toBeVisible()
  // 계좌번호·대조 코드는 ? 뒤에 있다. 송금 버튼 둘은 같은 위상으로 보인다.
  await page.getByRole('dialog').getByRole('button', { name: '도움말' }).click()
  await expect(awaiting).toContainText('000-000-0000')
  const code = (await awaiting.locator('[data-order-help]').textContent())!.match(/입금자명 · ([A-Z2-9]{6})/)![1]!
  await expect(awaiting.locator('[data-open-bank="toss"]')).toBeVisible()
  await expect(awaiting.locator('[data-open-bank="kakaobank"]')).toBeVisible()
  await expect(awaiting.locator('[data-confirm-deposit]')).toBeDisabled()

  await page.goto(`${WEB}/my/subscription`)
  await expect(page.locator('[data-plan="free"]')).toBeVisible()   // 주문은 지급이 아니다

  // 2) 운영자가 통장에서 확인하고 승인한다.
  // 운영 콘솔은 데스크톱 도구다. 전역 설정의 모바일·터치 에뮬레이션을 물려받으면
  // 표 오른쪽 끝의 승인 버튼을 탭으로 누르지 못해 클릭이 타임아웃된다.
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  const admin = await adminContext.newPage()
  try {
    await admin.goto(`${ADMIN}/payments`)
    await expect(admin).toHaveURL(/\/login/)                       // 미인증은 진입 불가
    await admin.getByPlaceholder('이메일').fill('e2e-admin@miro.dev')
    await admin.getByPlaceholder('비밀번호').fill('admin-pass-123')
    await admin.getByRole('button', { name: '로그인' }).click()
    // 로그인 완료를 기다린 뒤에 이동한다 — 곧바로 goto 하면 세션 쿠키가 아직 없다.
    await expect(admin.locator('[data-admin-role="superadmin"]')).toBeVisible()
    await admin.goto(`${ADMIN}/payments?status=awaiting`)
    const row = admin.locator(`[data-order-code="${code}"]`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('9,900원')
    await row.getByPlaceholder('입금 확인 메모').fill('E2E 입금 확인')
    await row.locator('[data-approve]').click()
    // 승인하면 이 주문은 대기 목록에서 빠진다 — 결과 메시지를 띄우던 패널도 함께 사라지므로
    // 메시지가 아니라 목록에서 없어졌는지를 본다.
    await expect(row).toHaveCount(0)
    await admin.goto(`${ADMIN}/payments?status=approved`)
    await expect(admin.locator(`[data-order-code="${code}"]`)).toContainText('E2E 입금 확인')
  } finally { await adminContext.close() }

  // 3) 지급은 cron 이 한다 — 승인 직후에는 아직 반영 전일 수 있다.
  const cron = await request.get(`${WEB}/api/cron/reality`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` },
  })
  expect(cron.ok()).toBe(true)

  // 4) 사용자 화면에 반영된다.
  await page.goto(`${WEB}/my/subscription`)
  await expect(page.locator('[data-plan="pro"]')).toBeVisible()
  await page.goto(`${WEB}/recharge`)
  await expect(page.locator('[data-wallet-history]')).toContainText('지급 완료')
})

test('bank transfer: one waiting order at a time', async ({ page }) => {
  await signUp(page, WEB)
  await page.goto(`${WEB}/recharge`)
  await page.getByRole('button', { name: '충전하기', exact: true }).click()
  await page.locator('input[value="pass"]').check()
  await page.getByRole('button', { name: '입금 안내 받기' }).click()
  // 대기 중에는 새 구매 버튼이 없고 기존 주문 안내만 남는다.
  await expect(page.getByRole('button', { name: '입금 안내 받기' })).toHaveCount(0)
  await expect(page.locator('[data-bank-order="awaiting"]')).toBeVisible()
})
