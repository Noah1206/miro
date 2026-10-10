import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signUp } from './helpers'

// These financial flows do not register a real browser push subscription.
// Exercise the app's supported no-Web-Push path independently of a locally configured VAPID key.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { Reflect.deleteProperty(window, 'PushManager') }) })

test('model choices use token balances and reply length, and open a token-only recharge catalog', async ({ page }) => {
  await signUp(page, process.env.E2E_BASE!)
  await page.goto('/character/thomas')
  await page.getByRole('button', { name: '대화 시작하기', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\//)
  await page.getByRole('button', { name: 'AI 모델 선택' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('모든 모델에서 토큰을 사용해요')
  await expect(dialog).toContainText('300 미로 토큰')
  await expect(dialog).toContainText('일반 답변')
  await expect(dialog).toContainText('긴 답변')
  await expect(dialog).not.toContainText('무료')
  await expect(dialog).not.toContainText('ECHO')
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(accessibility.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  await page.screenshot({ path: '/Users/johyeon-ung/Documents/Codex/2026-10-10/new-chat/outputs/miro-token-model-picker.png' })
  await dialog.getByRole('button', { name: '토큰 충전', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '모델 선택', exact: true })).toBeHidden()
  const recharge = page.getByRole('dialog', { name: 'Miro Pay', exact: true })
  await expect(recharge).toContainText('300 미로 토큰')
  await expect(recharge).toContainText('3,000원')
  await expect(recharge.locator('input[value="recharge:e2e_small"]')).toHaveCount(1)
  await expect(recharge.locator('input[value^="pass:"]')).toHaveCount(0)
  await page.screenshot({ path: '/Users/johyeon-ung/Documents/Codex/2026-10-10/new-chat/outputs/miro-token-recharge.png' })
})
