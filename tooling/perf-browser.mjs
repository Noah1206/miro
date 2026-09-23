import { execFileSync } from 'node:child_process'
import { statfsSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { testDatabaseUrl } from './test-database.ts'

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument)
  if (!match) throw new Error(`Expected --key=value, got ${argument}`)
  return [match[1], match[2]]
}))
const databaseUrl = testDatabaseUrl(process.env.TEST_DATABASE_URL)
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a local *_test database')
const database = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !/^\/[a-z0-9_]+_test$/i.test(database.pathname)) {
  throw new Error('Browser fixtures require localhost and a database name ending in _test')
}
const id = args['run-id']
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Pass --run-id=<uuid> from perf-load seed')
const origin = new URL(args.origin ?? 'http://127.0.0.1:3100')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.protocol !== 'http:' || origin.port !== '3100' || origin.pathname !== '/' || origin.search) {
  throw new Error('Browser target must be loopback port 3100, never :3000 or remote')
}
const samplesPerRoute = Number(args.samples ?? 5)
if (!Number.isSafeInteger(samplesPerRoute) || samplesPerRoute < 2 || samplesPerRoute > 30) throw new Error('Use --samples=2..30')
const maxTotalSeconds = Number(args['max-total-seconds'] ?? 900)
if (!Number.isSafeInteger(maxTotalSeconds) || maxTotalSeconds < 30 || maxTotalSeconds > 1_800) throw new Error('Use --max-total-seconds=30..1800')

function query(sql) {
  return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', databaseUrl, '-c', sql], { encoding: 'utf8' }).trim()
}

const owner = query(`SELECT id FROM users WHERE email = 'perf+${id}-owner@example.invalid'`)
if (!owner) throw new Error('Run fixture not found')
const characterCount = Number(query(`SELECT count(*) FROM characters WHERE owner_id = '${owner}'`))
if (![10_000, 100_000, 1_000_000].includes(characterCount)) throw new Error(`Unexpected character stage ${characterCount}`)
const token = query(`SELECT s.token FROM auth_sessions s JOIN users u ON u.id = s.user_id
  WHERE u.email = 'perf+${id}-1@example.invalid'`)
if (!token) throw new Error('Fixture auth session not found')
const label = `PF${id.slice(0, 8)}`
const fingerprint = await fetch(new URL(`/api/home/search/cards?q=${label}`, origin), { signal: AbortSignal.timeout(10_000) })
if (!fingerprint.ok || !(await fingerprint.json()).items?.some((item) => String(item.name).startsWith(label))) {
  throw new Error('Target does not expose this local fixture')
}

const routes = [
  { name: 'homeToMiro', from: '/home', to: '/miro', link: 'nav a[href="/miro"]', marker: '#main [data-miro-grid]', content: '#main [data-miro-grid] a[href^="/character/"]' },
  { name: 'miroToHome', from: '/miro', to: '/home', link: 'nav a[href="/home"]', marker: '#main #recommend-title', content: '#main a[href^="/character/"]' },
  { name: 'homeToSearch', from: '/home', to: '/home/search', link: '#main a[aria-label="캐릭터 검색"]', marker: '#main header h1', content: '#main a[href^="/character/"]' },
  { name: 'homeToCreate', from: '/home', to: '/create', link: 'nav a[href="/create"]', marker: '#main form', content: '#main form input[name="name"]' },
  { name: 'homeToArchive', from: '/home', to: '/archive', link: 'nav a[href="/archive"]', marker: '#main [data-session-row]', content: '#main [data-session-row] a[href^="/chat/"]' },
]
const modes = ['coldNoPrefetch', 'warmNoPrefetch', 'prefetchEnabled']
const selectedRoutes = args.routes ? args.routes.split(',') : routes.map((route) => route.name)
const selectedModes = args.modes ? args.modes.split(',') : modes
if (!selectedRoutes.length || new Set(selectedRoutes).size !== selectedRoutes.length || selectedRoutes.some((name) => !routes.some((route) => route.name === name))) {
  throw new Error(`Use --routes=<comma-separated names from ${routes.map((route) => route.name).join(',')}>`)
}
if (!selectedModes.length || new Set(selectedModes).size !== selectedModes.length || selectedModes.some((name) => !modes.includes(name))) {
  throw new Error(`Use --modes=<comma-separated names from ${modes.join(',')}>`)
}
const activeRoutes = routes.filter((route) => selectedRoutes.includes(route.name))

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
}

async function contextFor(browser, blockPrefetch) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await context.addCookies([{ name: 'miro_session', value: token, url: origin.origin }])
  let prefetchBlocked = 0
  if (blockPrefetch) await context.route('**/*', (route) => {
    const headers = route.request().headers()
    if (headers['next-router-prefetch'] || headers.purpose === 'prefetch') {
      prefetchBlocked++
      return route.abort()
    }
    return route.continue()
  })
  return { context, blocked: () => prefetchBlocked }
}

async function clickToContent(page, route, prefetchWaitMs) {
  await page.goto(new URL(route.from, origin).href, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.locator('#main a[href^="/character/"]').first().waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator(route.link).waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForTimeout(prefetchWaitMs || 200)
  await page.evaluate(({ link }) => {
    window.__perfNavigation = { start: performance.now(), clickMarked: false }
    sessionStorage.setItem('__perfClickWall', String(Date.now()))
    const source = document.querySelector(link)
    if (!source) throw new Error(`Missing source link: ${link}`)
    const onClick = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(link)) return
      window.__perfNavigation.start = performance.now()
      window.__perfNavigation.clickMarked = true
      sessionStorage.setItem('__perfClickWall', String(Date.now()))
      document.removeEventListener('click', onClick, true)
    }
    document.addEventListener('click', onClick, true)
  }, route)
  await page.locator(route.link).click()
  await page.waitForFunction(({ to, marker, content }) => location.pathname === to
    && Boolean(document.querySelector(marker)) && Boolean(document.querySelector(content)), route, { timeout: 20_000 })
  return page.evaluate(async () => {
    await new Promise(requestAnimationFrame)
    if (Number.isFinite(window.__perfNavigation?.start)) {
      return { ms: performance.now() - window.__perfNavigation.start, clickMarked: window.__perfNavigation.clickMarked }
    }
    const wall = Number(sessionStorage.getItem('__perfClickWall'))
    if (!Number.isFinite(wall)) throw new Error('Navigation timing mark was lost')
    return { ms: Date.now() - wall, clickMarked: false }
  })
}

const browser = await chromium.launch({ headless: true })
const results = {}
const startedAt = Date.now()
let stopReason = null
try {
  for (const mode of selectedModes) {
    const blockPrefetch = mode !== 'prefetchEnabled'
    const measurements = Object.fromEntries(activeRoutes.map((route) => [route.name, []]))
    const fallbackCounts = Object.fromEntries(activeRoutes.map((route) => [route.name, 0]))
    const errors = []
    let coldBlocked = 0
    const shared = mode === 'coldNoPrefetch' ? null : await contextFor(browser, blockPrefetch)
    const sharedPage = shared ? await shared.context.newPage() : null
    for (const route of activeRoutes) {
      if (stopReason) break
      if (sharedPage) {
        try { await clickToContent(sharedPage, route, mode === 'prefetchEnabled' ? 1_000 : 0) }
        catch (error) { stopReason = `Warmup ${mode}/${route.name}: ${error instanceof Error ? error.message : String(error)}`; break }
      }
      for (let index = 0; index < samplesPerRoute; index++) {
        const disk = statfsSync(process.cwd())
        if (Date.now() - startedAt > maxTotalSeconds * 1_000) stopReason = `Elapsed time exceeded ${maxTotalSeconds}s`
        if (disk.bavail * disk.bsize < 2 * 1024 ** 3) stopReason = 'Disk free below 2 GiB'
        if (stopReason) break
        process.stderr.write(`[browser] ${mode} ${route.name} ${index + 1}/${samplesPerRoute}\n`)
        const fixture = shared ?? await contextFor(browser, true)
        const page = sharedPage ?? await fixture.context.newPage()
        try {
          const measurement = await clickToContent(page, route, mode === 'prefetchEnabled' ? 1_000 : 0)
          measurements[route.name].push(measurement.ms)
          if (!measurement.clickMarked) fallbackCounts[route.name]++
        } catch (error) {
          errors.push({ route: route.name, index, message: error instanceof Error ? error.message : String(error) })
          process.stderr.write(`[browser] failed ${mode} ${route.name} ${index + 1}: ${error instanceof Error ? error.message : String(error)}\n`)
          if (errors.length >= 3) stopReason = 'Three browser navigation failures'
        } finally {
          if (!shared) {
            coldBlocked += fixture.blocked()
            await fixture.context.close()
          }
        }
        if (measurements[route.name].length >= 20 && percentile(measurements[route.name], 0.95) > 3_000) {
          stopReason = `${mode}/${route.name} p95 exceeded 3000ms after 20 samples`
        }
        if (stopReason) break
      }
    }
    results[mode] = {
      samplesPerRoute,
      routes: Object.fromEntries(Object.entries(measurements).map(([name, values]) => [name, {
        count: values.length, fallbackCount: fallbackCounts[name], p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), p99Ms: percentile(values, 0.99), valuesMs: values,
      }])),
      errors,
      prefetchBlocked: shared?.blocked() ?? coldBlocked,
    }
    await shared?.context.close()
    if (stopReason) break
  }
} finally {
  await browser.close()
}
process.stdout.write(`${JSON.stringify({ runId: id, characterCount, origin: origin.origin, selectedRoutes, selectedModes, measure: 'click mark to destination content plus next frame; fallback uses pre-click wall clock', stoppedEarly: Boolean(stopReason), stopReason, results }, null, 2)}\n`)
if (stopReason || Object.values(results).some((mode) => mode.errors.length)) process.exitCode = 1
