import { expect, test } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
test('health reports db and provider modes honestly', async ({ request }) => {
  const r = await request.get(`${BASE}/api/health`); expect(r.status()).toBe(200)
  const b = await r.json(); expect(b.db).toBe('up'); expect(b.providers.llm).toBe('mock'); expect(b.providers.push).toBe('mock')
})
test('security headers are present and the admin origin is not indexable', async ({ request }) => {
  const h = (await request.get(`${BASE}/onboarding`)).headers()
  expect(h['x-frame-options']).toBe('DENY'); expect(h['x-content-type-options']).toBe('nosniff'); expect(h['x-powered-by']).toBeUndefined()
  const a = (await request.get(`${process.env.E2E_ADMIN ?? 'http://localhost:3100'}/login`)).headers()
  expect(a['x-robots-tag']).toContain('noindex')
})
