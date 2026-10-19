import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const DIR = '/Users/johyeon-ung/Desktop/Miro/output/typing-demo'
const token = readFileSync(`${DIR}/.token`, 'utf8').trim()
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { console.log('ERROR ' + String(e?.message ?? e).split(token).join('<token>').split('\n')[0]); process.exit(1) })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 390, height: 844 } }, permissions: [] })
await ctx.addCookies([{ name: 'miro_session', value: token, domain: 'miroapp.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
const page = await ctx.newPage()
await page.goto('https://miroapp.app/character/official-baek-dohyun', { waitUntil: 'domcontentloaded' })
await page.locator('#start-roleplay button[type=submit]').click()
await page.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 120_000 })
const later = page.getByRole('button', { name: '나중에' })
if (await later.first().isVisible({ timeout: 6000 }).catch(() => false)) await later.first().click()
const nameField = page.locator('input[name=name]')
if (await nameField.isVisible({ timeout: 4000 }).catch(() => false)) {
  await nameField.fill('지우')
  await page.locator('form:has(input[name=name]) button[type=submit]').click()
  await page.waitForTimeout(3000)
}
if (await later.first().isVisible({ timeout: 3000 }).catch(() => false)) await later.first().click()
const skip = page.getByRole('button', { name: '인트로 전체 보기' })
if (await skip.isVisible({ timeout: 8000 }).catch(() => false)) await skip.click()
const input = page.locator('textarea[name=input]')
await page.screenshot({ path: `${DIR}/before-input.png` })
await input.waitFor({ state: 'visible', timeout: 30_000 })
await page.waitForFunction(() => !document.querySelector('textarea[name=input]')?.disabled, null, { timeout: 60_000 }).catch(() => {})
await input.fill('처음 뵙겠습니다. 그 병, 제 거라고 들었는데… 무슨 기억이 들어 있는지 차근차근 이야기해 주실래요?')
const sentAt = Date.now()
await page.locator('button[type=submit][data-empty]').click()
// 답이 쳐지는 동안 2초마다 화면을 남긴다(최대 150초)
let n = 0; let last = ''
for (let t = 0; t < 75; t++) {
  await page.waitForTimeout(2000)
  const text = await page.locator('[role=log]').innerText().catch(() => '')
  if (t % 3 === 0) await page.screenshot({ path: `${DIR}/shot-${String(n++).padStart(2, '0')}.png` })
  if (text === last && text.length > 400 && Date.now() - sentAt > 30_000) break
  last = text
}
writeFileSync(`${DIR}/timing.json`, JSON.stringify({ sentAt, endAt: Date.now(), chars: last.length }))
await page.screenshot({ path: `${DIR}/final.png` })
await ctx.close(); await browser.close()
console.log('done')
