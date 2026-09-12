import { expect, test } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
test('health reports db and provider modes honestly', async ({ request }) => {
  const r = await request.get(`${BASE}/api/health`); expect(r.status()).toBe(200)
  // Provider 는 환경마다 다르다 — 중요한 건 '숨기지 않는 것'이므로 mode 가 둘 중 하나임을 본다.
  const b = await r.json(); expect(b.db).toBe('up')
  for (const [name, mode] of Object.entries(b.providers)) expect([name, mode]).toEqual([name, expect.stringMatching(/^(live|mock)$/)])
})
test('security headers are present and the admin origin is not indexable', async ({ request }) => {
  const h = (await request.get(`${BASE}/login`)).headers()
  expect(h['x-frame-options']).toBe('DENY'); expect(h['x-content-type-options']).toBe('nosniff'); expect(h['x-powered-by']).toBeUndefined()
  const a = (await request.get(`${process.env.E2E_ADMIN ?? 'http://localhost:3100'}/login`)).headers()
  expect(a['x-robots-tag']).toContain('noindex')
})
