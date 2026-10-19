import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const DIR = '/Users/johyeon-ung/Desktop/Miro/output/stream-timing'
const token = readFileSync(`${DIR}/.token`, 'utf8').trim()
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { console.log('ERROR ' + String(e?.message ?? e).split(token).join('<token>').split('\n')[0]); process.exit(1) })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: [] })
await ctx.addCookies([{ name: 'miro_session', value: token, domain: 'miroapp.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
await ctx.addInitScript(() => {
  const orig = window.fetch
  window.__turnEvents = []
  window.fetch = async (...args) => {
    const res = await orig(...args)
    const url = String(args[0]?.url ?? args[0])
    if (!url.includes('/api/turn') || !res.body) return res
    const [a, b] = res.body.tee()
    ;(async () => { const r = b.pipeThrough(new TextDecoderStream()).getReader(); let buf = ''
      for (;;) { const { value, done } = await r.read(); if (done) break; buf += value; const lines = buf.split('\n'); buf = lines.pop()
        for (const l of lines) { try { const e = JSON.parse(l); window.__turnEvents.push({ t: Date.now(), type: e.type, n: e.blocks?.length ?? null }) } catch {} } } })()
    return new Response(a, { headers: res.headers, status: res.status })
  }
})
const page = await ctx.newPage()
await page.goto('https://miroapp.app/character/official-han-jiseob', { waitUntil: 'domcontentloaded' })
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
await page.waitForTimeout(6000); if (await later.first().isVisible({ timeout: 500 }).catch(() => false)) await later.first().click()
const input = page.locator('textarea[name=input]')
await page.screenshot({ path: `${DIR}/before-input.png` })
await input.waitFor({ state: 'visible', timeout: 30_000 })
await page.waitForFunction(() => !document.querySelector('textarea[name=input]')?.disabled, null, { timeout: 60_000 }).catch(() => {})
if (await later.first().isVisible({ timeout: 500 }).catch(() => false)) await later.first().click()
await input.fill('*식탁 끝자리에 조심스럽게 앉으며* 전갈 받았어요. 같이 식사하자고 하셔서… 조금 놀랐어요.')
const before = (await page.locator('[role=log]').innerText().catch(() => '')).length
const sentAt = Date.now()
await page.locator('button[type=submit][data-empty]').click()
// 보낸 말이 화면에 붙은 뒤를 기준으로, 답의 첫 글자가 나타나는 순간을 0.2초 단위로 잰다
await page.waitForTimeout(800)
const baseline = (await page.locator('[role=log]').innerText().catch(() => '')).length
let firstAt = 0, last = '', stableSince = 0
for (let i = 0; i < 900; i++) {
  await page.waitForTimeout(200)
  const text = await page.locator('[role=log]').innerText().catch(() => '')
  if (!firstAt && text.length > baseline + 2) { firstAt = Date.now(); await page.screenshot({ path: `${DIR}/first-char.png` }) }
  if (text !== last) { last = text; stableSince = Date.now() }
  else if (firstAt && Date.now() - stableSince > 4000) break
}
const events = await page.evaluate(() => window.__turnEvents)
writeFileSync(`${DIR}/timing.json`, JSON.stringify({ events: events.map(e => ({ ...e, sec: (e.t - sentAt) / 1000 })), sentAt, firstAt, firstSec: (firstAt - sentAt) / 1000, doneSec: (stableSince - sentAt) / 1000, before, baseline }))
await page.screenshot({ path: `${DIR}/final.png` })
await ctx.close(); await browser.close()
console.log('done')
