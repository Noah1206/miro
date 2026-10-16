import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { testDatabaseUrl } from '../../../tooling/test-database'
import { frozenPlan, longitudinalModelEnvironment, readJson, sha256, validateCarriedLedger, writeJson } from './longitudinal-support'

const option = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
async function main() {
  if (!process.argv.includes('--live')) throw new Error('This harness only counts real provider calls. Pass --live explicitly.')
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()) {
    throw new Error('Run from a clean committed checkout. Uncommitted source changes cannot be mixed across experiment chunks.')
  }
  const database = testDatabaseUrl(process.env.TEST_DATABASE_URL)
  if (!database) throw new Error('A dedicated local TEST_DATABASE_URL is required; do not reuse the unit-test DB.')
  const out = resolve(option('--out') ?? ''), canon = resolve(option('--canon') ?? '')
  if (!option('--out') || !option('--canon')) throw new Error('--out <private directory> and --canon <published canon JSON> are required')
  const limitUSD = Number(option('--limit-usd')), limitRequests = Number(option('--limit-requests'))
  if (!(limitUSD > 0 && Number.isFinite(limitUSD)) || !(Number.isSafeInteger(limitRequests) && limitRequests > 0)) throw new Error('Explicit finite --limit-usd and --limit-requests are required')
  const turns = Number(option('--turns') ?? '125'), chunk = Number(option('--chunk-turns') ?? '6')
  if (!Number.isSafeInteger(turns) || turns < 120 || !Number.isSafeInteger(chunk) || chunk < 1) throw new Error('At least 120 target turns and a positive chunk size are required')
  const characters = (option('--characters') ?? 'official-cha-dogyeom,official-gu-manseok,official-seo-ian').split(',')
  if (characters.length !== 3 || new Set(characters).size !== 3) throw new Error('Select exactly three different published characters')
  const env: Record<string, string> = option('--env-json')
    ? JSON.parse(readFileSync(option('--env-json')!, 'utf8')) : parseEnv(readFileSync(option('--env-file') ?? '.env', 'utf8'))
  const modelEnvironment = longitudinalModelEnvironment(env)
  const registry = JSON.parse(env.MIRO_MODEL_REGISTRY ?? 'null') as Array<Record<string, unknown>> | null
  if (!registry?.length || registry.some(m => m.enabled !== false && (m.provider === 'mock' || typeof m.inputCost !== 'number' || typeof m.outputCost !== 'number'))) throw new Error('A fully priced live production registry is required')
  const keyByProvider: Record<string, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', 'miro-slm': 'MIRO_SLM_URL', gateway: 'AI_GATEWAY_API_KEY' }
  for (const model of registry.filter(m => m.enabled !== false && m.fallback !== true)) {
    if (!env[keyByProvider[String(model.provider)] ?? '']) throw new Error(`Missing credentials for configured provider ${model.provider}`)
  }
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const lockPath = `${out}/writer.lock`
  if (existsSync(lockPath)) {
    const previous = readJson<{ pid: number; childPid?: number; workerPid?: number }>(lockPath)
    let alive = false
    for (const pid of [previous.pid, previous.childPid, previous.workerPid].filter((pid): pid is number => typeof pid === 'number')) {
      try { process.kill(pid, 0); alive = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
    if (alive) throw new Error('Another experiment writer is still active')
    unlinkSync(lockPath)
  }
  const lock = openSync(lockPath, 'wx', 0o600)
  writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); closeSync(lock)
  try {
    const carrySource = option('--carry-budget') ? realpathSync(resolve(option('--carry-budget')!)) : undefined
    if (process.argv.includes('--carry-budget') && !carrySource) throw new Error('--carry-budget requires a previous budget.json path')
    const budgetPath = `${out}/budget.json`
    if (carrySource && carrySource === (existsSync(budgetPath) ? realpathSync(budgetPath) : resolve(budgetPath))) {
      throw new Error('Carried budget must come from a different experiment directory')
    }
    // Read once: the copied attempts and immutable hash must refer to the exact same previous ledger.
    const carryRaw = carrySource ? readFileSync(carrySource, 'utf8') : undefined
    const carried = carryRaw === undefined ? undefined : validateCarriedLedger(JSON.parse(carryRaw), limitUSD, limitRequests)
    const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const configuration = { version: 1, source, database: `${new URL(database).hostname}${new URL(database).pathname}`, limitUSD, limitRequests,
      ...(carrySource ? { carryBudget: { source: carrySource, sha256: sha256(carryRaw!) } } : {}),
      turns, characters, canonHash: sha256(readFileSync(canon, 'utf8')), registryHash: sha256(JSON.stringify(registry)),
      planHash: sha256(JSON.stringify(frozenPlan())), chatModel: option('--chat-model') ?? 'miro',
      chatModelId: env.MIRO_CHAT_MODEL_ID ?? null,
      modelExecution: modelEnvironment.configuration,
      // The app auto-adds/removes fallback models based on credential presence. Freeze presence, never secret values.
      credentialPresence: Object.fromEntries(['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
        'AI_GATEWAY_API_KEY', 'MIRO_SLM_URL', 'MIRO_SLM_API_KEY'].map(key => [key, !!env[key]])),
      features: Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('MIRO_FEATURE_')).sort(([a], [b]) => a.localeCompare(b))) }
    const manifestPath = `${out}/manifest.json`
    if (existsSync(manifestPath)) {
      const old = readJson<{ configuration: unknown }>(manifestPath)
      if (JSON.stringify(old.configuration) !== JSON.stringify(configuration)) throw new Error('Immutable experiment settings differ. Do not reset counters or change providers/budgets on resume.')
      if (!existsSync(budgetPath)) throw new Error('Experiment budget is missing. Recover the existing ledger; never recreate it on resume.')
    } else {
      if (existsSync(budgetPath)) throw new Error('A budget already exists without its manifest. Recover the manifest; never overwrite accumulated costs.')
      // Write the budget first. A crash can leave a recoverable orphan, never a manifest with silently reset costs.
      writeJson(budgetPath, carried ?? { version: 1, limitUSD, limitRequests, attempts: [] })
      writeJson(manifestPath, { startedAt: new Date().toISOString(), configuration, source,
        modelRegistry: registry, localDatabase: true, deploymentNetworkMeasured: false, syntheticUser: true, humanReview: false })
      writeJson(`${out}/frozen-plan.json`, frozenPlan())
    }
    // Explicit allowlist: production DB URLs, auth tokens, push credentials and user data never enter the worker.
    const providerEnv = modelEnvironment.providerEnv
    const featureEnv = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('MIRO_FEATURE_')))
    const child = spawn('pnpm', ['exec', 'vitest', 'run', '--config', 'ai/evals/agency/vitest.config.ts', 'apps/web/lib/agency/longitudinal-live.eval.ts'], {
      stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...providerEnv, ...featureEnv,
        TEST_DATABASE_URL: database, DATABASE_URL: database, NODE_ENV: 'production', AI_PROVIDER: '', AI_FALLBACK_PROVIDER: '',
        MIRO_LONG_EVAL_OUT: out, MIRO_LONG_EVAL_CANON: canon, MIRO_LONG_EVAL_CHUNK: String(chunk), MIRO_LONG_EVAL_ALLOW_FAILED_RETRY: process.argv.includes('--retry-failed') ? '1' : '',
        MIRO_LONG_EVAL_LAUNCHER_PID: String(process.pid),
        MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: 'agency:v1',
        // App counters remain active too. Whole-experiment limits below them never roll over at midnight/month-end.
        AI_DAILY_BUDGET: String(limitUSD), AI_DAILY_REQUEST_LIMIT: String(limitRequests), AI_USER_DAILY_LIMIT: String(limitRequests),
        MIRO_BUDGET_POLICY: JSON.stringify({ user_monthly: { cost: limitUSD, requests: limitRequests } }), MIRO_REQUESTS_PER_MINUTE: '120',
      },
    })
    // Preserve the launcher child before its test worker initializes, so interruption cannot open a second writer.
    writeJson(lockPath, { ...readJson<Record<string, unknown>>(lockPath), childPid: child.pid })
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    process.exitCode = status ?? 1
  } finally { unlinkSync(lockPath) }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'longitudinal_run_failed'); process.exitCode = 1 })
