import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { testDatabaseUrl } from '../../../tooling/test-database'

/**
 * P0 baseline (docs/character-agency-plan.md §6, §8): the current core and the agency core run the same scripted
 * synthetic session through the real app entry points on a guarded local test DB, and the known current-core
 * failures are re-executed. Live mode reads only GEMINI_API_KEY and MIRO_MODEL_REGISTRY from the root .env;
 * its DATABASE_URL is never used.
 *
 *   TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/baseline.ts
 *   TEST_DATABASE_URL=postgres://localhost/miro_test pnpm exec tsx ai/evals/agency/baseline.ts --live --limit-usd 0.5
 *
 * Without --live every provider is the app's mock: this checks wiring and accounting, not cost or latency
 * (mock moderation makes no call at all).
 */
type Call = { requestId: string | null; task: string; promptVersion: string | null; provider: string; model: string; status: string
  ok: boolean; error: string | null; fallbackUsed: boolean; latencyMs: number; inputTokens: number | null; outputTokens: number | null; costUSD: number | null }
type Unit = { kind: string; wallMs: number; outcome: string; engine?: string; calls: Call[]; background?: Call[]; events?: Array<Record<string, unknown>> }
type Arm = { experiment: string; agencyMode: string; sessionStartMs: number; stopped: string | null; deferredErrors: string[]; units: Unit[] }

const flag = (name: string) => process.argv.includes(name)
const option = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const round = (value: number | null, digits = 0) => value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits))
/** Nearest-rank percentile. With the pilot's handful of units p95 is effectively the maximum. */
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)]! : null
}
const countBy = <T>(items: T[], key: (item: T) => string) =>
  items.reduce<Record<string, number>>((acc, item) => { acc[key(item)] = (acc[key(item)] ?? 0) + 1; return acc }, {})

function summarize(units: Unit[], succeeded: (unit: Unit) => boolean) {
  const calls = units.flatMap(u => u.calls)
  const cost = sum(calls.map(c => c.costUSD ?? 0))
  const wins = units.filter(succeeded).length
  const wall = units.map(u => u.wallMs)
  return { units: units.length, succeeded: wins, failureRate: units.length ? round((units.length - wins) / units.length, 3) : null,
    outcomes: countBy(units, u => u.outcome), engines: countBy(units, u => u.engine ?? 'none'),
    failureCauses: countBy(units.flatMap(u => (u.events ?? []).filter(e => e.event === 'turn.failed')), e => String(e.cause)),
    wallMs: { p50: round(percentile(wall, 50)), p95: round(percentile(wall, 95)), max: round(wall.length ? Math.max(...wall) : null) },
    callsPerUnit: round(units.length ? calls.length / units.length : null, 2), failedCalls: calls.filter(c => !c.ok).length,
    tokensPerUnit: { input: round(units.length ? sum(calls.map(c => c.inputTokens ?? 0)) / units.length : null), output: round(units.length ? sum(calls.map(c => c.outputTokens ?? 0)) / units.length : null) },
    costUSD: { total: round(cost, 6), perUnit: round(units.length ? cost / units.length : null, 6), perSuccess: round(wins ? cost / wins : null, 6),
      unsettledCalls: calls.filter(c => c.costUSD == null || c.status !== 'completed').length },
    providers: countBy(calls, c => c.provider) }
}

function stages(units: Unit[]) {
  const groups = new Map<string, Call[]>()
  for (const call of units.flatMap(u => u.calls)) {
    const key = `${call.task} ${call.promptVersion ?? '-'} @${call.model}`
    groups.set(key, [...(groups.get(key) ?? []), call])
  }
  return [...groups].map(([stage, calls]) => ({ stage, calls: calls.length, failed: calls.filter(c => !c.ok).length,
    errors: countBy(calls.filter(c => !c.ok), c => c.error ?? 'unknown'),
    latencyMs: { p50: percentile(calls.map(c => c.latencyMs), 50), p95: percentile(calls.map(c => c.latencyMs), 95) },
    meanTokens: { input: round(sum(calls.map(c => c.inputTokens ?? 0)) / calls.length), output: round(sum(calls.map(c => c.outputTokens ?? 0)) / calls.length) },
    costUSD: round(sum(calls.map(c => c.costUSD ?? 0)), 6) }))
}

/** Only the provider key and model registry leave the root .env. */
function liveProvider() {
  const env = parseEnv(readFileSync('.env', 'utf8'))
  if (!env.GEMINI_API_KEY || !env.MIRO_MODEL_REGISTRY) throw new Error('Live baseline needs GEMINI_API_KEY and MIRO_MODEL_REGISTRY in the root .env')
  const models = JSON.parse(env.MIRO_MODEL_REGISTRY) as Array<{ id: string; provider: string; providerModelId?: string; enabled?: boolean; capabilities: string[]; inputCost?: number; outputCost?: number }>
  const enabled = models.filter(m => m.enabled !== false)
  if (enabled.some(m => m.provider !== 'gemini' || m.inputCost === undefined || m.outputCost === undefined)) throw new Error('Live baseline needs priced Gemini models only')
  // The agency compiler, planner and verifier use the world_update task. Without a capable model they cannot run at all.
  const servesWorldUpdate = enabled.some(m => m.capabilities.includes('world_update'))
  const dialogue = enabled.find(m => m.capabilities.includes('dialogue'))
  if (!dialogue) throw new Error('Registry has no dialogue model')
  if (!servesWorldUpdate) dialogue.capabilities = [...dialogue.capabilities, 'world_update']
  return { key: env.GEMINI_API_KEY, registry: models, servesWorldUpdate, override: servesWorldUpdate ? null : `${dialogue.id} += world_update` }
}

async function main() {
  const database = testDatabaseUrl(process.env.TEST_DATABASE_URL)
  if (!database) throw new Error('Set TEST_DATABASE_URL to a guarded local test database.')
  const live = flag('--live')
  const limitUSD = live ? Number(option('--limit-usd')) : 0
  if (live && !(limitUSD > 0 && limitUSD <= 5)) throw new Error('--live needs --limit-usd in (0, 5]')
  const experiment = option('--experiment') ?? `p0-${new Date().toISOString().slice(0, 10)}-${live ? 'live' : 'mock'}`
  if (!/^[a-z0-9-]{3,60}$/.test(experiment)) throw new Error('Experiment id: lowercase letters, digits and dashes')
  const provider = live ? liveProvider() : null
  const directory = await mkdtemp(join(tmpdir(), 'miro-agency-baseline-'))
  // Production's /api/health switches on 2026-09-24. Pinned so a later flag change cannot silently move the baseline.
  const features = { IMAGE_GENERATION: '0', VOICE_CALL: '0', VIDEO_CALL: '0', LIVE_SCENE: '0', RELATIONSHIP_ENGINE: '1', MEMORY_ENGINE: '1',
    EVENT_ENGINE: '1', REALITY_MESSAGE: '1', INLINE_REALITY: '0', LLM_SEMANTIC_ANALYSIS: '0', MEMORY_SUMMARIES: '1', MEMORY_EXTRACTION: '1' }
  const blank = { AI_PROVIDER: '', AI_FALLBACK_PROVIDER: '', MIRO_MODEL_REGISTRY: '', GEMINI_API_KEY: '', MIRO_SHADOW_MODEL: '', MIRO_CANARY_MODEL: '', VERCEL_ENV: '' }
  const common = { ...process.env, ...blank, TEST_DATABASE_URL: database, MIRO_AGENCY_MEASURE_EXPERIMENT: experiment, MIRO_MODE: '',
    ...Object.fromEntries(Object.entries(features).map(([name, on]) => [`MIRO_FEATURE_${name}`, on])),
    // Durable experiment cap: the experiment user's monthly cost counter plus the day's global cost in the test DB.
    AI_DAILY_BUDGET: String(limitUSD), MIRO_BUDGET_POLICY: JSON.stringify({ user_monthly: { cost: limitUSD, requests: 100_000 } }),
    AI_DAILY_REQUEST_LIMIT: '100000', AI_USER_DAILY_LIMIT: '100000', MIRO_REQUESTS_PER_MINUTE: '120',
    ...(provider ? { MIRO_MODEL_REGISTRY: JSON.stringify(provider.registry), GEMINI_API_KEY: provider.key } : {}) }
  const vitest = (file: string, env: Record<string, string | undefined>) => spawnSync('pnpm',
    ['exec', 'vitest', 'run', '--config', 'ai/evals/agency/vitest.config.ts', file], { stdio: 'inherit', env: { ...common, ...env } }).status

  const failuresPath = join(directory, 'failures.json')
  const failuresStatus = vitest('apps/web/lib/agency/baseline-failures.eval.ts', { ...blank, MIRO_CHARACTER_AGENCY_MODE: 'off', MIRO_AGENCY_FAILURES_OUT: failuresPath })
  const arms: Record<string, Arm | null> = {}
  const selected = (option('--arms') ?? 'legacy,agency').split(',')
  for (const [arm, mode] of ([['legacy', 'off'], ['agency', 'live']] as const).filter(([arm]) => selected.includes(arm))) {
    const out = join(directory, `${arm}.json`)
    const status = vitest('apps/web/lib/agency/baseline-measure.eval.ts', { MIRO_CHARACTER_AGENCY_MODE: mode, MIRO_CHARACTER_AGENCY_SESSIONS: mode === 'off' ? '' : '*', MIRO_AGENCY_MEASURE_OUT: out })
    arms[arm] = status === 0 && existsSync(out) ? JSON.parse(await readFile(out, 'utf8')) : null
    if (arms[arm]?.stopped) break
  }

  const warnings: string[] = []
  const summary = Object.fromEntries(Object.entries(arms).map(([arm, data]) => {
    if (!data) { warnings.push(`${arm}: arm did not complete`); return [arm, null] }
    if (data.stopped) warnings.push(`${arm}: stopped by ${data.stopped}`)
    if (data.deferredErrors.length) warnings.push(`${arm}: ${data.deferredErrors.length} deferred task errors`)
    const of = (kind: string) => data.units.filter(u => u.kind === kind)
    const turns = of('turn')
    if (arm === 'agency' && turns.some(t => t.engine !== 'agency')) warnings.push('agency: some turns did not run the agency engine')
    if (live && data.units.some(u => u.calls.some(c => c.provider === 'mock'))) warnings.push(`${arm}: a mock provider answered in live mode`)
    return [arm, { sessionStartMs: round(data.sessionStartMs), turn: summarize(turns, u => u.outcome === 'ok'),
      compile: of('compile').length ? summarize(of('compile'), u => u.outcome === 'ready') : null,
      proactive: summarize(of('proactive'), u => u.outcome === 'sent'), stages: stages(data.units),
      backgroundCalls: turns.flatMap(t => t.background ?? []).length }]
  }))
  const failures = failuresStatus === 0 && existsSync(failuresPath) ? JSON.parse(await readFile(failuresPath, 'utf8')) : null
  if (!failures) warnings.push('failure reproductions did not complete')

  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const report = { mode: live ? 'live-pilot' : 'mock-wiring', experiment, createdAt: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD'), uncommittedChanges: git('status', '--porcelain').length > 0,
    database: new URL(database).pathname.slice(1), limitUSD: live ? limitUSD : null, features,
    registry: provider?.registry.map(({ id, providerModelId, capabilities, inputCost, outputCost }) => ({ id, providerModelId, capabilities, inputCost, outputCost })) ?? null,
    registryOverride: provider?.override ?? null, liveRegistryServesWorldUpdate: provider?.servesWorldUpdate ?? null,
    complete: warnings.length === 0, warnings, summary, failures, arms,
    notMeasured: ['persona fidelity and human preference (no judge or reviewers)', 'active instance per day (needs real traffic)',
      'production network and DB latency (local test DB)', ...(live ? [] : ['cost and moderation calls (mock skips moderation)'])] }
  const output = option('--out') ?? join(directory, 'report.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')

  for (const [arm, s] of Object.entries(summary)) {
    if (!s) continue
    console.table(Object.fromEntries(Object.entries({ turn: s.turn, compile: s.compile, proactive: s.proactive }).filter(([, v]) => v).map(([kind, v]) => [`${arm}/${kind}`, {
      n: v!.units, ok: v!.succeeded, 'wall p50': v!.wallMs.p50, 'wall p95': v!.wallMs.p95, 'calls/unit': v!.callsPerUnit,
      'USD/unit': v!.costUSD.perUnit, 'USD/success': v!.costUSD.perSuccess }])))
  }
  if (failures) console.table(failures.map((f: { id: string; reproduced: boolean }) => ({ case: f.id, reproduced: f.reproduced })))
  console.log(`${report.mode}: ${report.complete ? 'complete' : 'INCOMPLETE — ' + warnings.join('; ')}\n${output}`)
  if (!report.complete) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'agency_baseline_failed'); process.exitCode = 1 })
