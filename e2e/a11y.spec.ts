import { signUp } from './helpers'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'

async function signupAndPlay(page: Page) {
  await signUp(page, BASE)
  await page.goto(`${BASE}/character/thomas`); await page.getByRole('button', { name: '역할극 시작하기' }).click(); await expect(page).toHaveURL(/\/chat\//)
  await page.getByPlaceholder('대사, 행동, 묘사를 자유롭게…').fill('안녕하세요.'); await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('안녕하세요.')).toBeVisible()
  return page.url()
}

/** WCAG 2.2 AA 자동 검사. 모든 화면을 먼저 모은 뒤 serious/critical 이 0 인지 본다. */
const found: string[] = []
async function audit(page: Page, name: string) {
  await page.waitForLoadState('networkidle')
  // 등장이 끝난 뒤를 본다. reduce-motion 이어도 Motion 은 한 프레임 뒤에 최종값을 쓰므로,
  // 진행 중인 애니메이션이 없어질 때까지 기다린 다음 검사한다 — 페이드 중간값을 명암비 위반으로 읽지 않게.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 })
    .catch(() => undefined)
  await page.waitForTimeout(250)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
  for (const v of r.violations) {
    for (const n of v.nodes.slice(0, 3)) {
      const d = (n.any[0] ?? n.all[0])?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
      const extra = d?.contrastRatio ? ` fg=${d.fgColor} bg=${d.bgColor} ratio=${d.contrastRatio}` : ''
      found.push(`[${name}] ${v.impact} ${v.id} ${n.target.join(' ')}${extra} :: ${n.html.replace(/\s+/g, ' ').slice(0, 110)}`)
    }
  }
}
test.afterAll(() => {
  console.log('AXE-REPORT-BEGIN\n' + (found.join('\n') || 'clean') + '\nAXE-REPORT-END')
  const serious = found.filter((l) => / (serious|critical) /.test(l))
  expect(serious, serious.join('\n')).toEqual([])
})

test('public screens', async ({ page }) => {
  for (const [path, name] of [['/login', 'login'], ['/auth/mock/google?state=x&redirect_uri=/api/auth/google/callback', 'mock-consent']] as const) { await page.goto(`${BASE}${path}`); await audit(page, name) }
})
// 13개 화면을 한 번에 훑는다. 원격 DB(Supabase)에서는 기본 30초로 모자란다.
test.describe.configure({ timeout: 120_000 })
test('signed-in screens', async ({ page }) => {
  const chat = await signupAndPlay(page)
  for (const [path, name] of [['/home', 'home'], ['/character/thomas', 'detail'], ['/create', 'create'], ['/archive', 'archive'], ['/my', 'my'], ['/plans', 'plans'], ['/my/settings', 'settings'], ['/my/verify', 'verify'], ['/my/delete', 'delete'], ['/subscribe', 'subscribe']] as const) {
    await page.goto(`${BASE}${path}`); await audit(page, name)
  }
  await page.goto(chat); await audit(page, 'chat')
  await page.goto(chat.replace('/chat/', '/live/')); await audit(page, 'live')
})
