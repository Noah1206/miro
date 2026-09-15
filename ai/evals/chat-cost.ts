import { readFile } from 'node:fs/promises'
import { AIOrchestrator, registryFromEnv, type AIUsageRecord } from '../../packages/providers/src/index'
import { runTurn } from '../../packages/engine/src/index'
import { snapshot } from '../../packages/engine/src/__tests__/fixtures'
import { validationBudget } from '../../tooling/validation-budget'
import { POLICY } from '../../packages/config/src/index'

/**
 * MIRO / ECHO 한 턴이 실제로 얼마인지 잰다 — 6단계 "무료 대화 제공 비용" 판단 근거.
 *
 * 합성 시나리오만 쓰고 운영 DB 를 건드리지 않는다. 예산은 validationBudget 이 강제하며
 * 상한을 넘으면 호출 자체가 거절된다. 대화가 길어질수록 맥락이 커지므로 여러 턴을 이어 잰다.
 *
 *   pnpm ai:cost            # 기본 6턴
 *   TURNS=10 pnpm ai:cost
 */
const INPUTS = [
  '오늘 하루 어땠어? 나는 좀 힘들었어.',
  '사실 회사에서 실수를 했거든. 계속 마음에 걸려.',
  '너는 그런 적 없어? 실수하고 자책한 적.',
  '고마워. 얘기하니까 좀 낫다.',
  '다음 주에 발표가 있는데 또 긴장돼.',
  '네가 옆에 있으면 좋겠다.',
  '오늘은 일찍 자야겠어. 잘 자.',
  '아 참, 아까 말한 그 책 제목이 뭐였지?',
]

/** Gemini 무료 등급은 분당 한도가 낮다 — 측정이 429 로 끊기지 않게 턴 사이를 띄운다. */
const PACE_MS = Number(process.env.PACE_MS ?? 12_000)

async function main() {
  process.loadEnvFile('.env')
  if (!process.env.MIRO_MODEL_REGISTRY) process.env.MIRO_MODEL_REGISTRY = await readFile('ai/config/gemini-mvp.json', 'utf8')
  const turns = Math.min(INPUTS.length, Math.max(1, Number(process.env.TURNS ?? 6)))
  const budget = await validationBudget(`/tmp/miro-chat-cost-${new Date().toISOString().slice(0, 10)}.json`, Number(process.env.LIMIT_USD ?? 0.5))

  try {
    const { registry, resolveModel } = registryFromEnv(() => { throw new Error('No mock in a cost measurement') })
    const model = registry.models.find(m => m.enabled && m.capabilities.includes('dialogue'))
    if (!model) throw new Error('No dialogue model configured')
    const provider = resolveModel(model)
    const records: AIUsageRecord[] = []

    const rows: Record<string, unknown>[] = []
    for (const [label, tier] of [['MIRO', POLICY.chatTier.miro], ['ECHO', POLICY.chatTier.echo]] as const) {
      const before = records.length
      const recent: { role: 'user' | 'character'; content: string }[] = []

      for (let i = 0; i < turns; i++) {
        if (records.length > before || i > 0) await new Promise(r => setTimeout(r, PACE_MS))
        const llm = new AIOrchestrator({ chain: [provider], registry, resolveModel,
          budgetGuard: budget.guard, onUsage: r => { records.push(r) },
          context: { dialogueModelId: model.id, usageUnits: 0 } })
        const result = await runTurn({
          llm, auxiliaryLLM: llm, snapshot: snapshot({ recentMessages: [...recent] }),
          userInput: INPUTS[i]!, maxOutputTokens: tier.maxOutputTokens,
          contextScale: tier.contextScale, auxiliary: tier.auxiliary,
        })
        recent.push({ role: 'user', content: INPUTS[i]! })
        recent.push({ role: 'character', content: result.transition.blocks.map(b => ('text' in b ? b.text : '')).join(' ') })
      }

      const mine = records.slice(before)
      const cost = mine.reduce((n, r) => n + (r.estimatedCost ?? 0), 0)
      rows.push({
        등급: label, 턴: turns, 호출: mine.length,
        입력토큰: mine.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
        출력토큰: mine.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
        총원가USD: Number(cost.toFixed(6)),
        턴당USD: Number((cost / turns).toFixed(6)),
        실패: mine.filter(r => !r.ok).length,
      })
    }

    console.table(rows)
    const failed = rows.reduce((n, r) => n + (r['실패'] as number), 0)
    if (failed > 0) {
      // 실패한 호출은 토큰을 거의 쓰지 않아 평균을 끌어내린다 — 숫자를 그대로 믿으면 안 된다.
      console.log(`\n⚠ 호출 ${failed}건이 실패했습니다 (대부분 속도 제한).`)
      console.log('  실패가 평균을 낮추므로 아래 추정치는 과소평가입니다.')
      console.log('  PACE_MS 를 늘리거나 한도가 넉넉한 키로 다시 재세요.\n')
    }
    const miro = rows[0]!['턴당USD'] as number
    const echo = rows[1]!['턴당USD'] as number
    console.log('=== 무료 대화(MIRO) 제공 비용' + (failed ? ' — 참고용, 재측정 필요' : '') + ' ===')
    for (const n of [100, 300, 1000]) console.log(`  사용자 1명 · 월 ${n}턴 → $${(miro * n).toFixed(2)}`)
    console.log(`  MAU 1,000명 · 월 300턴 → $${(miro * 300 * 1000).toFixed(0)}`)
    console.log(`\nECHO 는 MIRO 의 ${(echo / miro).toFixed(2)}배` + (echo < miro ? ' — 1 미만이면 측정이 깨진 것이다 (ECHO 가 더 싸을 수 없다)' : ''))
    console.log('예산:', JSON.stringify(budget.status()))
  } finally { await budget.close() }
}

main().catch(e => { console.error(e); process.exit(1) })
