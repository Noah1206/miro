// node drive.mjs start <slug>            → opens the room through the real site and records its sessionId
// node drive.mjs turn <slug> <text>       → one /api/turn on https://miroapp.app (never resubmits a pending request)
// node drive.mjs text <slug> <text>       → one messenger text via /api/messages
import { chromium, request } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'

const DIR = '/Users/johyeon-ung/Desktop/Miro/output/conv-check2'
const BASE = 'https://miroapp.app'
const token = readFileSync(`${DIR}/.token`, 'utf8').trim()
const rooms = existsSync(`${DIR}/rooms.json`) ? JSON.parse(readFileSync(`${DIR}/rooms.json`, 'utf8')) : {}
const cookie = { name: 'miro_session', value: token, domain: 'miroapp.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }
const [cmd, slug, ...rest] = process.argv.slice(2)
for (const ev of ['uncaughtException','unhandledRejection']) process.on(ev, e => { console.log('ERROR ' + String(e?.message ?? e).split(token).join('<token>').split('\n')[0]); process.exit(1) })
const log = (entry) => appendFileSync(`${DIR}/log.ndjson`, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')

if (cmd === 'start') {
  if (rooms[slug]) throw new Error('room already started')
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  await ctx.addCookies([cookie])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/character/${slug}`, { waitUntil: 'domcontentloaded' })
  await page.locator('#start-roleplay button[type=submit]').click()
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 120_000 })
  const sessionId = page.url().match(/\/chat\/([0-9a-f-]{36})/)[1]
  rooms[slug] = sessionId
  writeFileSync(`${DIR}/rooms.json`, JSON.stringify(rooms, null, 2))
  log({ cmd, slug, sessionId })
  console.log(JSON.stringify({ slug, sessionId }))
  await browser.close()
} else if (cmd === 'turn' || cmd === 'text') {
  const sessionId = rooms[slug]
  if (!sessionId) throw new Error('start the room first')
  const input = rest.join(' ')
  const requestId = randomUUID()
  const api = await request.newContext({ baseURL: BASE, storageState: { cookies: [{ ...cookie, expires: -1 }], origins: [] } })
  const started = Date.now()
  log({ cmd, slug, sessionId, requestId, input, phase: 'submit' })
  if (cmd === 'turn') {
    const res = await api.post('/api/turn', { multipart: { sessionId, input, requestId, chatModel: 'miro' }, timeout: 300_000 })
    const lines = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l))
    const done = lines.findLast(l => l.type === 'done')?.state ?? null
    const resets = lines.filter(l => l.type === 'reset').length
    const out = { slug, requestId, status: res.status(), ms: Date.now() - started, resets, succeeded: done?.succeeded ?? false, error: done?.error ?? null,
      keepWaiting: done?.keepWaiting ?? false, retryWithSameId: done?.retryWithSameId ?? false, notice: done?.notice ?? null,
      reply: (done?.messages ?? []).filter(m => m.role !== 'user').map(m => (m.blocks?.length ? m.blocks.map(b => `[${b.type}${b.speaker ? ':' + b.speaker : ''}] ${b.text}`).join('\n') : m.content)) }
    log({ cmd, slug, sessionId, requestId, phase: 'done', ...out })
    console.log(JSON.stringify(out, null, 1))
  } else {
    const res = await api.post('/api/messages', { data: { sessionId, input, requestId, sentAt: new Date().toISOString() }, timeout: 60_000 })
    const out = { slug, requestId, status: res.status(), ms: Date.now() - started, body: await res.text() }
    log({ cmd, slug, sessionId, requestId, phase: 'done', ...out })
    console.log(JSON.stringify(out, null, 1))
  }
} else throw new Error('usage: start|turn|text <slug> [text]')
