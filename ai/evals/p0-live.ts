import { readFile, writeFile } from 'node:fs/promises'
import { AIOrchestrator, registryFromEnv, type AIUsageRecord } from '../../packages/providers/src/index'
import { runTurn, renderBlocks } from '../../packages/engine/src/index'
import { snapshot } from '../../packages/engine/src/__tests__/fixtures'
import { analyzeMemory } from '../../packages/engine/src/task-router'
import { validationBudget } from '../../tooling/validation-budget'

/** Synthetic scenarios only. Does not import the application DB or operating budget. */
async function main() {
  process.loadEnvFile('.env')
  process.env.MIRO_MODEL_REGISTRY = await readFile('ai/config/gemini-mvp.json', 'utf8')
  const budget = await validationBudget('/tmp/miro-gemini-validation-20260915.json', 1)
  const records: AIUsageRecord[] = [], checks: Array<{ name: string; pass: boolean; detail?: unknown }> = []
  try {
    const { registry, resolveModel } = registryFromEnv(() => { throw new Error('No mock in live validation') })
    const model = registry.get('gemini-flash-lite')
    const provider = resolveModel(model)
    const outputs: Array<{ task: string; text: string; inputTokens: number | null; outputTokens: number | null }> = []
    const ai = new AIOrchestrator({ chain: [{ info: provider.info, healthCheck: () => provider.healthCheck(),
      generate: async req => {
        const result = await provider.generate(req)
        outputs.push({ task: req.task, text: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens })
        // These are synthetic test outputs, never real user conversations or credentials.
        await writeFile('/tmp/miro-p0-live-synthetic.json', JSON.stringify(outputs, null, 2))
        return result
      } }], explicitModel: model, maxRetries: 0,
      timeoutMs: 20000, budgetGuard: budget.guard, onUsage: async r => {
        records.push(r)
        await writeFile('/tmp/miro-p0-live-attempts.json', JSON.stringify(records, null, 2))
      } })
    const s = snapshot({ turnCount: 2 })
    const turn = await runTurn({ llm: ai, snapshot: s, userInput: '이 오래된 책을 함께 살펴봐 주실래요?' })
    checks.push({ name: 'structured_character_turn', pass: turn.providerMode === 'live' && turn.transition.blocks.length > 0,
      detail: renderBlocks(turn.transition.blocks) })
    const previous = { id: '11111111-1111-4111-8111-111111111111', sessionId: 's1', characterId: 'c1',
      type: 'short_term_summary' as const, content: '사용자는 루나라는 고양이와 산다.', importance: .9, persistence: .9,
      confidence: 1, createdAt: new Date(), sourceMessageId: null }
    const summary = await analyzeMemory(ai, 'memory_summary', '토요일 오후에 이 책을 다시 보러 올게요.', { ...s, memories: [previous] })
    checks.push({ name: 'incremental_summary', pass: summary.memories.some(m => m.content.includes('루나') && m.content.includes('토요일')), detail: summary })
    const knownCost = records.reduce((n, r) => n + (r.estimatedCost ?? 0), 0)
    const report = { createdAt: new Date().toISOString(), model: model.providerModelId, ...budget.status(),
      providerReportedCostEstimateUSD: knownCost, costIsInvoice: false,
      unknownCostAttempts: records.filter(r => r.estimatedCost === null).length,
      checks, attempts: records.map(({ task, ok, inputTokens, outputTokens, estimatedCost, error }) => ({ task, ok, inputTokens, outputTokens, estimatedCost, error })) }
    await writeFile('/tmp/miro-p0-live-report.json', JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ checks: checks.map(({name, pass}) => ({name, pass})), reservedUSD: budget.status().reservedUSD, estimatedUSD: knownCost }))
    if (checks.some(c => !c.pass)) process.exitCode = 1
  } finally { await budget.close() }
}
main().catch(e => { console.error(JSON.stringify({ error: e?.constructor?.name, reason: ['AIUnavailableError', 'UnsafeContentError', 'AIBudgetDeniedError', 'ZodError'].includes(e?.constructor?.name) ? e.message : 'validation_setup_or_io', records: 'reservations retained' })); process.exitCode = 1 })
