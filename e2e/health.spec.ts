import { expect, test } from '@playwright/test'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
test('health reports db and provider modes honestly', async ({ request }) => {
  // 공개 응답은 정상 여부만 — 기능·공급자 구성은 CRON_SECRET 이 있을 때만(10/3, 운영 구성 노출 축소).
  const r = await request.get(`${BASE}/api/health`); expect(r.status()).toBe(200)
  const pub = await r.json(); expect(pub.db).toBe('up'); expect(pub.schema).toBe('ready'); expect(pub.providers).toBeUndefined()
  const d = await request.get(`${BASE}/api/health`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` } }); expect(d.status()).toBe(200)
  // Provider 는 환경마다 다르다 — 중요한 건 '숨기지 않는 것'이므로 mode 가 둘 중 하나임을 본다.
  const b = await d.json(); expect(b.db).toBe('up')
  for (const [name, mode] of Object.entries(b.providers)) expect([name, mode]).toEqual([name, expect.stringMatching(/^(live|mock)$/)])
})
test('security headers are present and the admin origin is not indexable', async ({ request }) => {
  const h = (await request.get(`${BASE}/login`)).headers()
  expect(h['x-frame-options']).toBe('DENY'); expect(h['x-content-type-options']).toBe('nosniff'); expect(h['x-powered-by']).toBeUndefined()
  const a = (await request.get(`${process.env.E2E_ADMIN ?? 'http://localhost:3100'}/login`)).headers()
  expect(a['x-robots-tag']).toContain('noindex')
})
