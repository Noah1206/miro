import { expect, test } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

// 이용권 구매 화면은 2026-09-28 에 뺐다(Pro 는 당분간 팔지 않는다). 결제 webhook 의 서명 검사만 남긴다.
test('the webhook rejects a bad signature', async ({ request }) => {
  const r = await request.post(`${BASE}/api/payments/webhook`, { data: { checkoutId: 'mockco_x_y', outcome: 'success' }, headers: { 'x-payment-signature': 'mock:nope' } })
  expect(r.status()).toBe(400)
})
