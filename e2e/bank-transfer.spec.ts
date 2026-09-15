import { signUp } from './helpers'
import { expect, test } from '@playwright/test'
const WEB = process.env.E2E_BASE ?? 'http://localhost:3000'

/**
 * 계좌이체 주문 화면. 주문만으로는 아무것도 지급되지 않는다는 것이 핵심이다.
 *
 * 운영자 승인 → cron 지급까지의 뒷단은 통합 테스트가 덮는다
 * (apps/web/lib/payments/__tests__/bank-transfer.integration.test.ts,
 *  apps/admin/lib/__tests__/admin.integration.test.ts).
 * 브라우저에서 승인 버튼까지 도는 시나리오는 아직 통과시키지 못해 넣지 않았다.
 */
test('bank transfer: one waiting order at a time', async ({ page }) => {
  await signUp(page, WEB)
  await page.goto(`${WEB}/recharge`)
  const order = page.locator('[data-bank-order="open"] form[data-order-kind="pass"]')
  await order.getByLabel('입금자명').fill('김미로')
  await order.getByRole('button', { name: '주문' }).click()
  await expect(page.locator('[data-order-result="created"]')).toBeVisible()
  // 대기 중이면 주문 카드가 사라지고 안내만 남는다.
  await expect(page.locator('[data-bank-order="open"]')).toHaveCount(0)
  await expect(page.locator('[data-bank-order="awaiting"]')).toBeVisible()
})
