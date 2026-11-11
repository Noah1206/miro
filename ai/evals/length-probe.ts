/**
 * 답 분량 실측(11/11) — 자율성 경로의 실제 대사 요청(지시문·프롬프트)을 고정 픽스처로 잡아 실제 모델에 변형별로 보낸다. DB·지갑 쓰기 없음.
 *   npx tsx --env-file=.env ai/evals/length-probe.ts --runs 4 --limit-usd 2 [--model claude-sonnet-5-5]
 */
import { createAgencyState, type CompiledCharacter } from '../../packages/domain/src/index'
import { providerFromEnv } from '../../packages/providers/src/index'
import { extractJson } from '../../packages/providers/src/ai/orchestrator'
import { runTurn } from '../../packages/engine/src/orchestrator'
import { AGENCY_PLANNER_VERSION } from '../../packages/engine/src/agency/planner'
import { SimulationProposal } from '../../packages/engine/src/proposal.schema'
import { snapshot, relationship } from '../../packages/engine/src/__tests__/fixtures'
import type { ReplyStyle } from '../../packages/engine/src/context'

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d)
const runs = Number(arg('--runs', '4')), limitUSD = Number(arg('--limit-usd', '2')), model = arg('--model', 'claude-sonnet-5-5')
const PRICE = { in: 3 / 1e6, out: 15 / 1e6 }   // ponytail: Sonnet 계열 표준 단가로 어림 — 정확한 단가는 운영 레지스트리
process.env.MIRO_MODE = 'alpha'

const now = '2026-11-11T12:00:00.000Z'
const statement = '퉁명스럽지만 챙겨 준다.'
const compiled: CompiledCharacter = { version: 1, sourceHash: 'probe', rules: [{ id: 'core', domain: 'value', statement, source: { field: 'personality', start: 0, end: statement.length }, origin: 'explicit', confidence: 1, priority: 1 }] }
const input = '바벨을 내려놓고 일어나 그를 똑바로 올려다본다. "처음 보는데, 무슨 일이세요?"'

async function capture(style: ReplyStyle) {
  let req: { system: string; prompt: string } | undefined
  const scene = snapshot({ experienceType: 'reality', mode: 'chat', turnCount: 4,
    recentMessages: [{ role: 'user', content: '저녁 헬스장, 벤치프레스를 하고 있다.' }, { role: 'character', content: '덩치 큰 남자가 팔짱을 끼고 벤치 옆에 선다. "그 자리, 내가 쓰던 건데."' }] })
  await runTurn({ snapshot: scene, userInput: input, maxOutputTokens: 4096, replyLength: style,
    agency: { mode: 'live', compiled, state: createAgencyState('r1', now), context: { sessionId: 's1', revisionId: 'r1', actor: 'c1',
      evidence: [{ id: 'input-1', sessionId: 's1', actor: 'user', kind: 'message', epistemic: 'reported', quote: input, occurredAt: now, knownTo: ['c1'] }],
      clock: { now, mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
      permissions: { contact: false, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait'] },
      world: { currentLocation: '헬스장', currentTime: '저녁', worldStatus: null }, relationship: relationship() } },
    llm: { info: { mode: 'mock', name: 'capture', notice: '' }, async generateStructured(r) {
      if (r.promptVersion === AGENCY_PLANNER_VERSION) return r.schema.parse({ appraisal: { interpretation: '상대가 묻는다.', evidenceIds: ['input-1'], ruleIds: ['core'], goalCongruence: 0, valueConflict: 0,
        responsibility: 'uncertain', affectDelta: { valence: 0, arousal: 0, stress: 0, energy: 0 }, expression: { openness: 30, directness: 60 }, beliefs: [], relationshipChanges: [] },
        candidates: [{ id: 'respond', action: 'respond', description: '평소 말투대로 자연스럽게 대답한다.', targetActor: 'c1', evidenceIds: ['input-1'], ruleIds: ['core'], goalIds: [],
          ruleFit: [{ ruleId: 'core', fit: 1 }], goalFit: [], preconditions: [], uncertainty: .1, cost: 0 }], newGoals: [], goalChanges: [] })
      if (r.task === 'dialogue') { req = { system: r.system, prompt: r.prompt }; throw new Error('captured') }
      throw new Error('unexpected ' + r.promptVersion)
    } } }).catch(() => {})
  if (!req) throw new Error('no dialogue request captured')
  return req
}

const FLOOR = '\n## 분량 점검(가장 중요)\n이번 응답의 blocks 는 14개 이상, 화면에 보이는 글(text 합계)은 1,000자 이상이어야 합니다. 이보다 짧으면 실패한 응답입니다. narrative 는 2~4문장, dialogue 는 1~3문장씩 채워 장면을 여러 박자로 진행합니다.'
const PER_BLOCK = '\n## 블록 길이(가장 중요)\nnarrative 블록은 하나에 120~200자(3~4문장), action 블록은 60~120자(2~3문장), dialogue 블록은 40~120자로 씁니다. 한 문장짜리 블록을 연달아 두지 않습니다.'
const MORE = '\n## 블록 수(가장 중요)\n이번 응답의 blocks 는 18~24개입니다.'
const only = process.argv.includes('--extra')
const variants: Array<[string, ReplyStyle, (s: string) => string]> = only ? [
  ['scene-현재(상한30)', 'scene', s => s],
  ['scene+블록길이(상한30)', 'scene', s => s + PER_BLOCK],
] : [
  ['scene-현재', 'scene', s => s],
  ['scene+분량점검', 'scene', s => s + FLOOR],
  ['short-현재', 'short', s => s],
]

async function main() {
let spent = 0
const llm = providerFromEnv('anthropic', model)
if (!llm) throw new Error('ANTHROPIC_API_KEY 없음')
for (const [name, style, edit] of variants) {
  const req = await capture(style)
  const lens: number[] = [], blocks: number[] = []
  for (let i = 0; i < runs; i++) {
    if (spent > limitUSD - 0.15) { console.log('예산 상한 근처 — 중단'); break }
    const r = await llm.generate({ task: 'dialogue', system: edit(req.system), prompt: `${req.prompt}\n\n사용자 입력: ${input}`, json: true, maxTokens: 4096, signal: AbortSignal.timeout(90_000) })
    spent += r.inputTokens * PRICE.in + r.outputTokens * PRICE.out
    const p = SimulationProposal.safeParse(extractJson(r.text, { closeUnclosed: true }))
    const b = p.success ? p.data.rp.blocks : []
    lens.push(b.reduce((n, x) => n + x.text.length, 0)); blocks.push(b.length)
  }
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length))
  console.log(JSON.stringify({ variant: name, chars: lens, avgChars: avg(lens), blocks, avgBlocks: avg(blocks), spentUSD: +spent.toFixed(3) }))
}
}
main().catch(e => { console.error(e); process.exit(1) })
