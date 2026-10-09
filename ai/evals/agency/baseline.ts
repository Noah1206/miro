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
 * failures are re-executed. Live mode reads only GEMINI_API_KEY / ANTHROPIC_API_KEY, MIRO_MODEL_REGISTRY and (if present, for the GPT backup) OPENAI_API_KEY from the root .env;
 * its DATABASE_URL is never used.
 *
 *   TEST_DATABASE_URL=postgres://localhost/miro_agency_test pnpm exec tsx ai/evals/agency/baseline.ts
 *   TEST_DATABASE_URL=postgres://localhost/miro_agency_test pnpm exec tsx ai/evals/agency/baseline.ts --live --limit-usd 0.5 --characters thomas,yujin
 *
 * Without --live every provider is the app's mock: this checks wiring and accounting, not cost or latency.
 */
type Call = { requestId: string | null; task: string; promptVersion: string | null; provider: string; model: string; status: string
  ok: boolean; error: string | null; fallbackUsed: boolean; latencyMs: number; inputTokens: number | null; outputTokens: number | null; costUSD: number | null }
type Unit = { kind: string; wallMs: number; outcome: string; engine?: string; calls: Call[]; background?: Call[]; events?: Array<Record<string, unknown>>
  blocks?: Array<{ type: string; text: string }> | null }
type Ledger = { trigger: string; engine: string; field: string; rule: string; status: string; before: unknown; after: unknown; decisionId: string | null }
type Arm = { experiment: string; agencyMode: string; sessionStartMs: number; stopped: string | null; deferredErrors: string[]; units: Unit[]
  ledger?: Ledger[]; memoryJobs?: Array<{ kind: string; status: string; attempts: number; errorCode: string | null; latencyMs: number | null }> }

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

/** 공급자 장애(과부하·503·시간 초과·한도)로 실패한 턴 — 엔진 품질과 따로 센다(2026-10-02 3.8-flash 장애 때 결과가 장애로 채워졌다). */
const providerFailed = (unit: Unit) => unit.outcome !== 'ok' && (unit.events ?? []).some(e => e.event === 'turn.failed'
  && /ai unavailable after \d+ attempts: (?:provider_|timeout)/.test(String(e.cause)))
function summarize(units: Unit[], succeeded: (unit: Unit) => boolean) {
  const calls = units.flatMap(u => u.calls)
  const cost = sum(calls.map(c => c.costUSD ?? 0))
  const wins = units.filter(succeeded).length
  const wall = units.map(u => u.wallMs)
  const provider = units.filter(providerFailed).length
  return { units: units.length, succeeded: wins, failureRate: units.length ? round((units.length - wins) / units.length, 3) : null,
    providerFailures: provider, successRateExcludingProvider: units.length - provider ? round(wins / (units.length - provider), 3) : null,
    outcomes: countBy(units, u => u.outcome), engines: countBy(units, u => u.engine ?? 'none'),
    failureCauses: countBy(units.flatMap(u => (u.events ?? []).filter(e => e.event === 'turn.failed')), e => String(e.cause)),
    // Character chat format (2026-09-24): every reply carries scene narration and an inner voice.
    format: { replies: units.filter(u => u.blocks).length, withScene: units.filter(u => u.blocks?.some(b => b.type === 'action' || b.type === 'narrative')).length,
      withThought: units.filter(u => u.blocks?.some(b => b.type === 'thought')).length },
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

/** Only the provider key and model registry leave the root .env. 자율성 계획·검사·컴파일은 대사 모델이 맡는다(STRONG_TASKS). */
function liveProvider() {
  const env = parseEnv(readFileSync('.env', 'utf8'))
  if (!env.MIRO_MODEL_REGISTRY) throw new Error('Live baseline needs MIRO_MODEL_REGISTRY in the root .env')
  const models = JSON.parse(env.MIRO_MODEL_REGISTRY) as Array<{ id: string; provider: string; providerModelId?: string; enabled?: boolean; capabilities: string[]; inputCost?: number; outputCost?: number }>
  const enabled = models.filter(m => m.enabled !== false)
  // 10/9 Gemini 결제 계정 정지로 Claude 가 주 공급자 — 둘 다 잰다. 키는 표에 쓰인 공급자 것만 넘긴다.
  if (enabled.some(m => !['gemini', 'anthropic'].includes(m.provider) || m.inputCost === undefined || m.outputCost === undefined)) throw new Error('Live baseline needs priced Gemini or Claude models only')
  if (enabled.some(m => m.provider === 'gemini') && !env.GEMINI_API_KEY) throw new Error('Registry uses Gemini but GEMINI_API_KEY is missing')
  if (enabled.some(m => m.provider === 'anthropic') && !env.ANTHROPIC_API_KEY) throw new Error('Registry uses Claude but ANTHROPIC_API_KEY is missing')
  if (!enabled.some(m => m.capabilities.includes('dialogue'))) throw new Error('Registry has no dialogue model')
  // 예비(GPT-5.4 mini)는 키가 있을 때만 붙는다 — 운영과 같은 조건으로 잰다.
  return { key: env.GEMINI_API_KEY ?? '', anthropicKey: env.ANTHROPIC_API_KEY ?? '', registry: models, backupKey: env.OPENAI_API_KEY ?? '' }
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
  // Production's /api/health switches on 2026-09-29 (LLM 의미 분류가 9/24 결정으로 켜졌다). Pinned so a later flag change cannot silently move the baseline.
  const features = { IMAGE_GENERATION: '0', VOICE_CALL: '1', VIDEO_CALL: '0', LIVE_SCENE: '0', RELATIONSHIP_ENGINE: '1', MEMORY_ENGINE: '1',
    EVENT_ENGINE: '1', REALITY_MESSAGE: '1', INLINE_REALITY: '0', LLM_SEMANTIC_ANALYSIS: '1', MEMORY_SUMMARIES: '1', MEMORY_EXTRACTION: '1' }
  const blank = { AI_PROVIDER: '', AI_FALLBACK_PROVIDER: '', MIRO_MODEL_REGISTRY: '', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', MIRO_SHADOW_MODEL: '', MIRO_CANARY_MODEL: '', VERCEL_ENV: '' }
  const common = { ...process.env, ...blank, TEST_DATABASE_URL: database, MIRO_AGENCY_MEASURE_EXPERIMENT: experiment, MIRO_MODE: '',
    ...Object.fromEntries(Object.entries(features).map(([name, on]) => [`MIRO_FEATURE_${name}`, on])),
    // Durable experiment cap: the experiment user's monthly cost counter. The day's global counter is shared by every
    // experiment in this database, so it must not be the cap (it would stop a new experiment on an old one's spend).
    AI_DAILY_BUDGET: live ? '100' : '0', MIRO_BUDGET_POLICY: JSON.stringify({ user_monthly: { cost: limitUSD, requests: 100_000 } }),
    AI_DAILY_REQUEST_LIMIT: '100000', AI_USER_DAILY_LIMIT: '100000',
    // mock 턴은 수 ms 라 분당 요청 한도(사용자당)에 걸린다. 실모델 턴은 수 초라 120 으로 충분하다.
    MIRO_REQUESTS_PER_MINUTE: live ? '120' : '100000',
    ...(provider ? { MIRO_MODEL_REGISTRY: JSON.stringify(provider.registry), GEMINI_API_KEY: provider.key, ANTHROPIC_API_KEY: provider.anthropicKey, OPENAI_API_KEY: provider.backupKey } : {}) }
  const vitest = (file: string, env: Record<string, string | undefined>) => spawnSync('pnpm',
    ['exec', 'vitest', 'run', '--config', 'ai/evals/agency/vitest.config.ts', file], { stdio: 'inherit', env: { ...common, ...env } }).status

  const failuresPath = join(directory, 'failures.json')
  const failuresStatus = vitest('apps/web/lib/agency/baseline-failures.eval.ts', { ...blank, MIRO_CHARACTER_AGENCY_MODE: 'off', MIRO_AGENCY_FAILURES_OUT: failuresPath })
  const arms: Record<string, Arm | null> = {}
  const warnings: string[] = []
  const selected = (option('--arms') ?? 'legacy,agency').split(',')
  const repeat = Math.max(1, Math.min(3, Number(option('--repeat') ?? 1)))
  const characters = (option('--characters') ?? 'thomas').split(',')
  // --repeat 2: 같은 캐릭터를 새 세션으로 한 번 더(§5 "× 2회"). 비교가 공정하도록 두 경로를 캐릭터·회차마다 번갈아 돈다 —
  // 예산이 먼저 떨어져도 한쪽 경로만 통째로 빠지지 않게.
  const plan = Array.from({ length: repeat }, (_, round) => characters.map(character => ({ character, round }))).flat()
  const armRuns: Record<string, Arm[]> = { legacy: [], agency: [] }
  let budgetStopped = false
  for (const { character, round } of plan) {
   if (budgetStopped) break
   for (const [arm, mode] of ([['legacy', 'off'], ['agency', 'live']] as const).filter(([arm]) => selected.includes(arm))) {
    const runs = armRuns[arm]!
    {
      const out = join(directory, `${arm}-${character}-${round}.json`)
      const status = vitest('apps/web/lib/agency/baseline-measure.eval.ts', { MIRO_CHARACTER_AGENCY_MODE: mode, MIRO_CHARACTER_AGENCY_SESSIONS: mode === 'off' ? '' : '*',
        // --chat-model pro: ECHO 등급(긴 장면·맥락 2배·보조 분석 매 턴)으로 턴을 돈다. 측정 사용자는 pro 요금제가 된다.
        MIRO_AGENCY_MEASURE_CHAT_MODEL: option('--chat-model') ?? 'miro',
        MIRO_AGENCY_MEASURE_CHARACTER: character, MIRO_AGENCY_MEASURE_OUT: out, MIRO_AGENCY_MEASURE_SCRIPT: option('--script') ?? '' })
      const data: Arm | null = status === 0 && existsSync(out) ? JSON.parse(await readFile(out, 'utf8')) : null
      if (!data) { warnings.push(`${arm}/${character}#${round}: did not complete`); continue }
      runs.push({ ...data, units: data.units.map(unit => ({ ...unit, character, round })) })
      if (data.stopped === 'budget') budgetStopped = true
    }
   }
  }
  for (const [arm, runs] of Object.entries(armRuns)) if (selected.includes(arm)) {
    arms[arm] = runs.length ? { ...runs[0]!, sessionStartMs: sum(runs.map(r => r.sessionStartMs)) / runs.length,
      stopped: runs.find(r => r.stopped)?.stopped ?? null, deferredErrors: runs.flatMap(r => r.deferredErrors), units: runs.flatMap(r => r.units),
      ledger: runs.flatMap(r => r.ledger ?? []), memoryJobs: runs.flatMap(r => r.memoryJobs ?? []) } : null
  }

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
  // §5 게이트(자동으로 셀 수 있는 것만). 사람 평가·인물 일관성은 여기서 재지 않는다.
  const turnsOf = (arm: string) => arms[arm]?.units.filter(u => u.kind === 'turn') ?? []
  const ok = (u: Unit) => u.outcome === 'ok'
  const p95 = (arm: string) => percentile(turnsOf(arm).map(u => u.wallMs), 95)
  const costPerSuccess = (arm: string) => { const t = turnsOf(arm); const c = sum(t.flatMap(u => [...u.calls, ...(u.background ?? [])]).map(c => c.costUSD ?? 0)); const w = t.filter(ok).length; return w ? c / w : null }
  const agencyLedger = arms.agency?.ledger ?? []
  const gates = arms.agency && arms.legacy ? {
    successRate: { value: round(turnsOf('agency').filter(ok).length / Math.max(1, turnsOf('agency').length), 3), target: '>= 0.98', baseline: round(turnsOf('legacy').filter(ok).length / Math.max(1, turnsOf('legacy').length), 3),
      excludingProvider: { agency: round(turnsOf('agency').filter(ok).length / Math.max(1, turnsOf('agency').filter(u => !providerFailed(u)).length), 3),
        legacy: round(turnsOf('legacy').filter(ok).length / Math.max(1, turnsOf('legacy').filter(u => !providerFailed(u)).length), 3) } },
    p95Ratio: { value: round((p95('agency') ?? 0) / Math.max(1, p95('legacy') ?? 1), 2), target: '<= 1.25', agencyMs: round(p95('agency')), legacyMs: round(p95('legacy')) },
    costPerSuccessRatio: { value: round((costPerSuccess('agency') ?? 0) / Math.max(1e-9, costPerSuccess('legacy') ?? 1e-9), 2), target: '<= 2', agencyUSD: round(costPerSuccess('agency'), 5), legacyUSD: round(costPerSuccess('legacy'), 5) },
    // 권한 없는 세계 변경: 자율성 경로에서 장소가 '적용' 된 행. 이동은 held 여야 한다.
    unauthorizedWorldChange: agencyLedger.filter(r => r.field === 'world.currentLocation' && r.status === 'applied').length,
    heldMoves: agencyLedger.filter(r => r.rule === 'move_intent_held').length,
    strippedMutations: agencyLedger.filter(r => r.rule === 'unapproved_mutation').length,
    // 같은 트리거에서 같은 필드가 두 번 '적용' 되면 중복 효과다(거부·보류 행은 코드가 같아도 여러 번일 수 있다).
    duplicateEffects: (() => { const applied = agencyLedger.filter(r => r.status === 'applied'); return applied.length - new Set(applied.map(r => `${r.trigger}:${r.field}`)).size })(),
    // 취소 뒤 발송: 약속이 취소된 뒤의 선연락 발송 수(사람이 내용을 확인할 후보).
    sentAfterCancel: (arms.agency?.units ?? []).filter(u => u.kind === 'proactive' && u.outcome === 'sent').length,
    verifierRejections: countBy((arms.agency?.units ?? []).flatMap(u => ((u as { realization?: Array<{ ok: boolean; issues: string[] }> }).realization ?? []).filter(r => !r.ok).flatMap(r => r.issues.map(i => i.split(' ').at(-1)!.split(':')[0]!))), x => x),
    memoryJobP95Ms: { agency: percentile((arms.agency?.memoryJobs ?? []).flatMap(j => j.latencyMs == null ? [] : [j.latencyMs]), 95), legacy: percentile((arms.legacy?.memoryJobs ?? []).flatMap(j => j.latencyMs == null ? [] : [j.latencyMs]), 95), target: '<= 10000' },
  } : null
  const failures = failuresStatus === 0 && existsSync(failuresPath) ? JSON.parse(await readFile(failuresPath, 'utf8')) : null
  if (!failures) warnings.push('failure reproductions did not complete')

  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const report = { mode: live ? 'live-pilot' : 'mock-wiring', experiment, createdAt: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD'), uncommittedChanges: git('status', '--porcelain').length > 0,
    database: new URL(database).pathname.slice(1), limitUSD: live ? limitUSD : null, features, characters, repeat, script: option('--script') ?? 'p0', chatModel: option('--chat-model') ?? 'miro',
    registry: provider?.registry.map(({ id, providerModelId, capabilities, inputCost, outputCost }) => ({ id, providerModelId, capabilities, inputCost, outputCost })) ?? null,
    complete: warnings.length === 0, warnings, gates, summary, failures, arms,
    notMeasured: ['persona fidelity and human preference (no judge or reviewers)', 'active instance per day (needs real traffic)',
      'production network and DB latency (local test DB)', ...(live ? [] : ['cost'])] }
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
  if (gates) console.log(JSON.stringify(gates, null, 1))
  console.log(`${report.mode}: ${report.complete ? 'complete' : 'INCOMPLETE — ' + warnings.join('; ')}\n${output}`)
  if (!report.complete) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'agency_baseline_failed'); process.exitCode = 1 })
