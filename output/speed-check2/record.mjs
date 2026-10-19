import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const DIR = '/Users/johyeon-ung/Desktop/Miro/output/speed-check2'
const token = readFileSync(`${DIR}/.token`, 'utf8').trim()
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { console.log('ERROR ' + String(e?.message ?? e).split(token).join('<token>').split('\n')[0]); process.exit(1) })
const PLAN = [
  ['official-ryu-haram', ['오늘도 3시 10분이네요. 복권 한 장 주세요.', '하람 씨는 왜 꼭 새벽에만 일해요?', '응']],
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
    const sheet = await page.getByText('알림이 꺼져 있어요').or(page.getByText('나중에')).first().isVisible({ timeout: 300 }).catch(() => false)
    if (sheet) console.log(JSON.stringify({ slug, turn: i + 1, sheetMidChat: true }))
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
