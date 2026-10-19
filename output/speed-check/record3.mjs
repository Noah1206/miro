import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const DIR = '/Users/johyeon-ung/Desktop/Miro/output/speed-check'
const token = readFileSync(`${DIR}/.token`, 'utf8').trim()
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { console.log('ERROR ' + String(e?.message ?? e).split(token).join('<token>').split('\n')[0]); process.exit(1) })
const PLAN = [
  ['official-baek-dohyun', ['비 오는 날엔 손님이 많아요?', '내일 또 와도 돼요?']],
  ['official-seo-ian', ['오늘 방송에서 제 사연 읽어 주셔서 고마웠어요.', '목소리 실제로 들으니까 좀 떨려요.', '응']],
]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: [] })
await ctx.addCookies([{ name: 'miro_session', value: token, domain: 'miroapp.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
const rows = []
for (const [slug, inputs] of PLAN) {
  const page = await ctx.newPage()
  await page.goto(`https://miroapp.app/character/${slug}`, { waitUntil: 'domcontentloaded' })
  await page.locator('#start-roleplay button[type=submit]').click()
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 120_000 })
  const later = page.getByRole('button', { name: '나중에' })
  if (await later.first().isVisible({ timeout: 6000 }).catch(() => false)) await later.first().click()
  const nameField = page.locator('input[name=name]')
  if (await nameField.isVisible({ timeout: 4000 }).catch(() => false)) {
    await nameField.fill('지우'); await page.locator('form:has(input[name=name]) button[type=submit]').click(); await page.waitForTimeout(3000)
  }
  if (await later.first().isVisible({ timeout: 3000 }).catch(() => false)) await later.first().click()
  const skip = page.getByRole('button', { name: '인트로 전체 보기' })
  if (await skip.isVisible({ timeout: 8000 }).catch(() => false)) await skip.click()
  const input = page.locator('textarea[name=input]')
  await input.waitFor({ state: 'visible', timeout: 30_000 })
  for (const [i, text] of inputs.entries()) {
    await page.waitForFunction(() => !document.querySelector('button[type=submit][data-empty]')?.disabled || document.querySelector('textarea[name=input]'), null, { timeout: 60_000 }).catch(() => {})
    if (await later.first().isVisible({ timeout: 500 }).catch(() => false)) await later.first().click()
    await input.fill(text)
    const sentAt = Date.now()
    await page.locator('button[type=submit][data-empty]').click()
    await page.waitForTimeout(800)
    const baseline = (await page.locator('[role=log]').innerText().catch(() => '')).length
    let firstAt = 0, last = '', stableSince = 0
    for (let k = 0; k < 900; k++) {
      await page.waitForTimeout(200)
      const t = await page.locator('[role=log]').innerText().catch(() => '')
      if (!firstAt && t.length > baseline + 2) firstAt = Date.now()
      if (t !== last) { last = t; stableSince = Date.now() } else if (firstAt && Date.now() - stableSince > 5000) break
    }
    const row = { slug, turn: i + 1, firstSec: firstAt ? (firstAt - sentAt) / 1000 : null, doneSec: (stableSince - sentAt) / 1000, url: page.url() }
    rows.push(row); console.log(JSON.stringify(row))
    await page.screenshot({ path: `${DIR}/${slug}-${i + 1}.png` })
  }
  await page.close()
}
writeFileSync(`${DIR}/timing.json`, JSON.stringify(rows, null, 1))
await ctx.close(); await browser.close(); console.log('done')
