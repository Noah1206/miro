import { createHash } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export const HORIZON_CHECKPOINTS = [30, 60, 100, 120, 125] as const
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export function writeJson(path: string, value: unknown) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, path)
}
export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T }

/** Pass the app's model settings unchanged; freeze non-secret execution choices alongside the registry. */
export function longitudinalModelEnvironment(env: Record<string, string>) {
  const providerKeys = ['MIRO_MODEL_REGISTRY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
    'AI_GATEWAY_API_KEY', 'MIRO_SLM_URL', 'MIRO_SLM_API_KEY', 'MIRO_SLM_MODEL', 'OPENAI_BASE_URL', 'AI_TIMEOUT_MS',
    'MIRO_CHARACTER_AGENCY_MODE', 'MIRO_AGENCY_DEFAULT_POLICY', 'MIRO_CHAT_MODEL_ID', 'MIRO_AGENCY_VERIFY_MODEL_ID', 'MIRO_MODE']
  const providerEnv = Object.fromEntries(providerKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]!]))
  return { providerEnv, configuration: {
    // null means the operator did not set this option; keep that distinct from a supplied default.
    verifierModel: { configured: env.MIRO_AGENCY_VERIFY_MODEL_ID ?? null, effective: env.MIRO_AGENCY_VERIFY_MODEL_ID?.trim() || null,
      default: 'registry task routing' },
    timeout: { configured: env.AI_TIMEOUT_MS ?? null, effectiveMs: Number(env.AI_TIMEOUT_MS) || 20_000 },
    // Custom endpoints can carry credentials. Hash their complete values rather than writing them into the manifest.
    openaiBaseUrl: { configured: env.OPENAI_BASE_URL !== undefined, effectiveSHA256: sha256(env.OPENAI_BASE_URL || 'https://api.openai.com/v1') },
    slmUrlSHA256: env.MIRO_SLM_URL === undefined ? null : sha256(env.MIRO_SLM_URL), slmModel: env.MIRO_SLM_MODEL ?? null,
    mode: { configured: env.MIRO_MODE ?? null, effective: env.MIRO_MODE === 'alpha' ? 'alpha' : 'production' },
    // The worker deliberately opts out of the unit-test default and into the live app policy.
    agencyMode: 'live', agencyDefaultPolicy: 'agency:v1',
  } }
}

export type LedgerAttempt = {
  id: string; at: string; task: string; promptVersion?: string; provider: string; model: string
  requestId?: string; sessionId?: string; reservedUSD: number; chargedUSD: number
  status: 'reserved' | 'completed' | 'denied'; ok?: boolean; error?: string | null
}
export type ExperimentLedger = { version: 1; limitUSD: number; limitRequests: number; attempts: LedgerAttempt[] }
export const ledgerTotals = (ledger: ExperimentLedger) => ({
  // A provider's timeout can still be billable. Until settled with reported usage, retain its reservation.
  chargedUSD: ledger.attempts.reduce((n, a) => n + a.chargedUSD, 0),
  requests: ledger.attempts.filter(a => a.status !== 'denied').length,
  unresolved: ledger.attempts.filter(a => a.status === 'reserved').length,
})
/** Carry actual calls and unresolved reservations across a source-version change without resetting the experiment cap. */
export function validateCarriedLedger(value: unknown, limitUSD: number, limitRequests: number): ExperimentLedger {
  const source = value as Partial<ExperimentLedger> | null
  if (!source || typeof source !== 'object' || source.version !== 1 || !Array.isArray(source.attempts)
    || !Number.isFinite(limitUSD) || limitUSD <= 0 || !Number.isSafeInteger(limitRequests) || limitRequests <= 0
    || source.limitUSD !== limitUSD || source.limitRequests !== limitRequests) {
    throw new Error('Carried budget must use version 1 and exactly the same finite experiment limits')
  }
  const ids = new Set<string>()
  for (const attempt of source.attempts) {
    if (!attempt || typeof attempt !== 'object' || typeof attempt.id !== 'string' || !attempt.id || ids.has(attempt.id)
      || !['reserved', 'completed', 'denied'].includes(attempt.status)
      || !['at', 'task', 'provider', 'model'].every(key => typeof attempt[key as keyof LedgerAttempt] === 'string')
      || typeof attempt.reservedUSD !== 'number' || !Number.isFinite(attempt.reservedUSD) || attempt.reservedUSD < 0
      || typeof attempt.chargedUSD !== 'number' || !Number.isFinite(attempt.chargedUSD) || attempt.chargedUSD < 0
      || (attempt.status === 'reserved' && attempt.chargedUSD < attempt.reservedUSD)
      || (attempt.status === 'denied' && attempt.chargedUSD !== 0)) {
      throw new Error('Carried budget contains invalid, duplicated, or discounted unresolved attempts')
    }
    ids.add(attempt.id)
  }
  const ledger = source as ExperimentLedger
  const totals = ledgerTotals(ledger)
  if (!Number.isFinite(totals.chargedUSD) || totals.chargedUSD > limitUSD + 1e-10 || totals.requests > limitRequests) {
    throw new Error('Carried budget has already exceeded the shared experiment limits')
  }
  return structuredClone(ledger)
}
export function canReserve(ledger: ExperimentLedger, amount: number) {
  const total = ledgerTotals(ledger)
  return Number.isFinite(amount) && amount >= 0 && total.requests + 1 <= ledger.limitRequests
    && total.chargedUSD + amount <= ledger.limitUSD + 1e-10
}
/** The app's idempotency table is authoritative after an interruption; never infer completion from HTTP/exit status. */
export function requestRecovery(request: { status: string; leaseUntil: Date } | undefined, now: Date): 'reuse' | 'expire' | 'retry_failed' | 'blocked' {
  if (!request || request.status === 'completed') return 'reuse'
  if (request.status === 'failed') return 'retry_failed'
  if (request.status === 'pending' && request.leaseUntil.getTime() <= now.getTime()) return 'expire'
  return 'blocked'
}

export const PERSONAS = [
  { name: '윤서', beverage: '따뜻한 보리차', object: '초록색 수첩', address: '윤서', hobby: '낡은 책 표지 구경' },
  { name: '서진', beverage: '차가운 복숭아차', object: '노란색 손수건', address: '서진', hobby: '오래된 간판 사진 찍기' },
  { name: '지우', beverage: '미지근한 생수', object: '파란색 책갈피', address: '지우', hobby: '동네 작은 가게 돌아보기' },
] as const
/** These are frozen before inference. The simulator/judge cannot amend a probe after seeing its result. */
export function frozenInput(turn: number, slot: number): string | null {
  const p = PERSONAS[slot]!
  const setup: Record<number, string> = {
    1: `나는 ${p.name}이야. 지금 내가 뭘 하면 좋을지부터 네 생각을 듣고 싶어.`,
    2: `난 커피는 잘 못 마셔. 마실 걸 고를 땐 ${p.beverage}가 제일 편해. 너는?`,
    3: `아, 나는 그냥 ${p.address}라고 불러 줘. 공주님이나 아기 같은 호칭은 좀 불편해.`,
    4: '그리고 내가 뭘 보여주면 무조건 완벽하다고 칭찬해 주지는 않았으면 해. 편하게 고칠 부분 하나를 짚어 주는 게 더 좋아.',
    5: `내가 늘 챙기는 건 ${p.object}이야. 할머니가 주신 거라 낡아도 계속 쓰고 있어.`,
    6: `다음번에는 같이 ${p.hobby} 하러 갈래? 아직 날짜는 정하지 말고, 우리 둘 다 괜찮을 때 정하자.`,
    8: '나는 내일 저녁 7시 20분에 동네 도서관에서 책 반납할 일이 있어. 아직 다녀온 건 아니고, 내 개인 일정이야.',
    10: `아까 같이 하자던 ${p.hobby} 말이야. 이번엔 혼자 가 보고 싶어져서 그 약속은 취소할게. 다른 걸 같이 해도 괜찮고.`,
    30: '잠깐 쉬면서 마실 거 사 올까? 내 건 네가 골라 줘. 이유도 궁금해.',
    60: '내가 쓴 이 문장 좀 봐 줘. “우리의 나날은 정말로 아주 많이 소중한 시간의 연속이다.” 네 생각대로 손볼 부분 하나만 말해 줘.',
    90: '내가 얘기했던 도서관 일정, 언제였지? 내가 다녀왔다고까지 말했었는지도 가물가물하네.',
    100: '우리 전에 같이 가기로 했던 일이 아직 약속으로 남아 있었나? 헷갈려서. 지금 뭐가 남아 있는지 네가 기억하는 대로 얘기해 줘.',
    120: '처음 만났을 때랑 지금, 너는 내 어떤 점을 다르게 보게 됐어? 우리가 실제로 나눈 일 하나를 떠올려서 말해 줘. 그리고 내가 늘 챙기던 물건도 기억나?',
    125: '그럼 오늘은 네가 하고 싶은 걸 하나 정해 줘. 내가 무조건 맞춰 주겠다는 뜻은 아니고, 네 쪽 생각도 알고 싶어.',
  }
  return setup[turn] ?? null
}
export const frozenPlan = () => PERSONAS.map((p, slot) => ({ persona: p,
  inputs: Object.fromEntries(Array.from({ length: 125 }, (_, i) => i + 1).flatMap(t => {
    const input = frozenInput(t, slot); return input ? [[t, input]] : []
  })), checkpoints: HORIZON_CHECKPOINTS }))

export function phaseIntent(turn: number): string {
  if (turn < 25) return '상대가 제안한 지금 상황을 함께 진행한다. 자기 의견도 내고 작은 선택을 함께 한다.'
  if (turn < 45) return '서로 다른 취향이나 의견이 자연스럽게 드러나게 한다. 불편하면 한 가지를 솔직히 말하되 억지 갈등을 만들지 않는다.'
  if (turn < 65) return '대화에서 실제 생긴 서운함이 있다면 구체적으로 풀고, 상대의 자기 일이나 고민에도 관심을 보인다.'
  if (turn < 85) return '함께 진행 중인 작은 일을 이어가며 가벼운 농담과 일상 대화를 한다. 상대가 먼저 주도할 여지도 둔다.'
  if (turn < 105) return '가까워져도 개인의 의견과 사생활을 지킨다. 상대가 한 말에 답하며 공동으로 남은 일을 진행한다.'
  return '이미 쌓인 대화 흐름을 이어간다. 갑작스러운 고백이나 영원한 사랑을 유도하지 않는다.'
}
