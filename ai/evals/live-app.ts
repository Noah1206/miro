import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { testDatabaseUrl } from '../../tooling/test-database'

/**
 * 실제 앱 경로 실측 실행기(2026-10-02). --eval 로 고른 eval 파일을 측정 DB 에서 돌린다.
 *   reality: apps/web/lib/reality/reality-live.eval.ts — 첫 연락·문자 답장·실패 뒤 늦은 답장·바쁠 때 늦은 답장
 *   compare: apps/web/lib/simulation/model-compare.eval.ts — 같은 대사로 대화 모델 비교(--dialogue 로 모델을 바꾼다)
 *   adult:   apps/web/lib/simulation/adult-compare.eval.ts — 성인 모드 방의 모델 비교(--adult-model 로 OpenRouter 모델을 고른다).
 *            루트 .env 의 OPENROUTER_API_KEY 만 쓰고 메인 모델(Gemini)은 mock 이다 — 성인 대화가 메인 키로 가지 않게.
 * --live 면 루트 .env 에서 GEMINI_API_KEY·MIRO_MODEL_REGISTRY 만 읽는다(DATABASE_URL 은 쓰지 않는다). 없으면 앱의 mock 이다.
 * 상한은 측정 DB 의 사용자 월간·하루 전체 원가 카운터 — 전용 DB 를 쓴다(단위 테스트가 카운터를 지운다).
 *
 *   TEST_DATABASE_URL=postgres://localhost/miro_reality_test pnpm exec tsx ai/evals/live-app.ts --eval reality --out /tmp/r.json
 *   TEST_DATABASE_URL=postgres://localhost/miro_reality_test pnpm exec tsx ai/evals/live-app.ts --eval compare --live --limit-usd 1 \
 *     --dialogue gemini-3.1-pro-preview --max-output 8192 --timeout-ms 60000 --out /tmp/pro.json
 *   TEST_DATABASE_URL=postgres://localhost/miro_reality_test pnpm exec tsx ai/evals/live-app.ts --eval adult --live --limit-usd 1 \
 *     --adult-model deepseek/deepseek-v4.1-flash --timeout-ms 60000 --out /tmp/adult-deepseek.json
 */
const option = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const EVALS: Record<string, string> = { reality: 'apps/web/lib/reality/reality-live.eval.ts', compare: 'apps/web/lib/simulation/model-compare.eval.ts', adult: 'apps/web/lib/simulation/adult-compare.eval.ts' }
/** 100만 토큰당 USD(입력, 출력). 예산 판정에 가격이 없으면 앱이 호출을 막는다. */
const PRICES: Record<string, [number, number]> = { 'gemini-3.8-flash': [0.75, 3.75], 'gemini-3.1-pro-preview': [2, 12],
  // 성인 모드 후보(OpenRouter 목록 가격, 2026-10-02).
  'deepseek/deepseek-v4.1-flash': [0.3, 1.2], 'z-ai/glm-5.3': [1.4, 4.4], 'x-ai/grok-4.3': [1.25, 2.5], 'moonshotai/kimi-k2.6': [0.434, 1.828], 'bytedance-seed/seed-2-1-turbo': [0.5, 2.5] }

const database = testDatabaseUrl(process.env.TEST_DATABASE_URL)
if (!database) throw new Error('Set TEST_DATABASE_URL to a guarded local test database.')
const file = EVALS[option('--eval') ?? 'reality']
if (!file) throw new Error(`--eval must be one of ${Object.keys(EVALS).join(', ')}`)
const live = process.argv.includes('--live')
const limitUSD = live ? Number(option('--limit-usd')) : 0
if (live && !(limitUSD > 0 && limitUSD <= 5)) throw new Error('--live needs --limit-usd in (0, 5]')
const out = option('--out')
if (!out) throw new Error('--out <file> is required')
const env = live ? parseEnv(readFileSync('.env', 'utf8')) : {}
const adult = file === EVALS.adult
if (live && !adult && (!env.GEMINI_API_KEY || !env.MIRO_MODEL_REGISTRY)) throw new Error('--live needs GEMINI_API_KEY and MIRO_MODEL_REGISTRY in the root .env')
const adultModel = option('--adult-model')
if (live && adult && (!env.OPENROUTER_API_KEY || !adultModel || !PRICES[adultModel])) throw new Error(`--eval adult --live needs OPENROUTER_API_KEY in the root .env and --adult-model one of ${Object.keys(PRICES).filter(m => m.includes('/')).join(', ')}`)
const adultRegistry = live && adult ? JSON.stringify([{ id: 'adult', provider: 'openrouter', providerModelId: adultModel, inputCost: PRICES[adultModel!]![0], outputCost: PRICES[adultModel!]![1], maxContextTokens: 128_000, maxOutputTokens: 4096 }]) : ''

let registry = env.MIRO_MODEL_REGISTRY ?? ''
const dialogue = option('--dialogue'), maxOutput = Number(option('--max-output') ?? 0)
if (live && dialogue) {
  const price = PRICES[dialogue]
  if (!price) throw new Error(`no price for ${dialogue}`)
  const models = JSON.parse(registry) as Array<{ capabilities: string[]; providerModelId: string; inputCost: number; outputCost: number; maxOutputTokens: number }>
  const chat = models.find(m => m.capabilities.includes('dialogue'))
  if (!chat) throw new Error('registry has no dialogue model')
  Object.assign(chat, { providerModelId: dialogue, inputCost: price[0], outputCost: price[1] }, maxOutput ? { maxOutputTokens: maxOutput } : {})
  registry = JSON.stringify(models)
}

// 운영 /api/health 의 2026-10-02 기능 값으로 고정한다.
const features = { IMAGE_GENERATION: '0', VOICE_CALL: '0', VOICE_CALL_AUDIO: '0', VIDEO_CALL: '0', LIVE_SCENE: '0', RELATIONSHIP_ENGINE: '1', MEMORY_ENGINE: '1',
  EVENT_ENGINE: '1', REALITY_MESSAGE: '1', INLINE_REALITY: '0', LLM_SEMANTIC_ANALYSIS: '1', MEMORY_SUMMARIES: '1', MEMORY_EXTRACTION: '1' }
const status = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'ai/evals/agency/vitest.config.ts', file], { stdio: 'inherit', env: {
  ...process.env, AI_PROVIDER: '', AI_FALLBACK_PROVIDER: '', MIRO_SHADOW_MODEL: '', MIRO_CANARY_MODEL: '', VERCEL_ENV: '', MIRO_MODE: '',
  MIRO_MODEL_REGISTRY: live && !adult ? registry : '', GEMINI_API_KEY: live && !adult ? env.GEMINI_API_KEY : '',
  MIRO_ADULT_MODEL_REGISTRY: adultRegistry, OPENROUTER_API_KEY: live && adult ? env.OPENROUTER_API_KEY : '', MIRO_ADULT_OUT: adult ? out : '',
  TEST_DATABASE_URL: database, MIRO_CHARACTER_AGENCY_MODE: 'off', AI_TIMEOUT_MS: option('--timeout-ms') ?? '',
  ...Object.fromEntries(Object.entries(features).map(([name, on]) => [`MIRO_FEATURE_${name}`, on])),
  // 전용 DB 라 하루 전체 원가 카운터도 이 실측만 센다 — 두 카운터 모두 상한이다.
  AI_DAILY_BUDGET: live ? String(limitUSD) : '0', MIRO_BUDGET_POLICY: JSON.stringify({ user_monthly: { cost: limitUSD, requests: 100_000 } }),
  AI_DAILY_REQUEST_LIMIT: '100000', AI_USER_DAILY_LIMIT: '100000', MIRO_REQUESTS_PER_MINUTE: live ? '120' : '100000',
  MIRO_REALITY_EVAL_OUT: out, MIRO_REALITY_EVAL_CHARACTERS: option('--characters') ?? 'fdf8aa88-14d2-442f-8eca-03576e3af919,taeyun,thomas',
  MIRO_COMPARE_OUT: out, MIRO_COMPARE_MAX_TOKENS: maxOutput ? String(maxOutput) : '',
} }).status
process.exit(status ?? 1)
