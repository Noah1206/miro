// Recompute (never commit) the failed 2nd turn of the synthetic QA room with production settings,
// recording each dialogue draft and each review verdict. No TurnMeter, so all attempts reach review.
import { randomUUID } from 'node:crypto'
import { writeFileSync, appendFileSync } from 'node:fs'
import { characterAgencyMode } from '@miro/config'
import { resolveTurnPolicy, runTurn } from '@miro/engine'
import { loadSession } from '@/lib/simulation/snapshot'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { resolveChatModel } from '@/lib/ai/chat-models'
import { prepareAgencyTurn } from '@/lib/agency/turn-context'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
installAIUsageSink()

const OUT = '/Users/johyeon-ung/Desktop/Miro/output/conv-check/repro.ndjson'
const MAX_CALLS = Number(process.env.REPRO_MAX_CALLS ?? 12)
const [sessionId, userId, input] = [process.env.REPRO_SESSION!, process.env.REPRO_USER!, process.env.REPRO_INPUT!]
writeFileSync(OUT, '')
const loaded = await loadSession(sessionId, userId)
if (!loaded) throw new Error('session not found')
const model = await resolveChatModel(userId, 'miro', false)
let calls = 0
const provider = resolveRpLLM(loaded.characterName, { userId, sessionId, requestId: randomUUID(), workload: 'interactive', usageUnits: 0 })
const llm = new Proxy(provider, { get(target, key) {
  if (key === 'generateStructured') return async (request: Parameters<typeof provider.generateStructured>[0]) => {
    if (++calls > MAX_CALLS) throw new Error('repro call cap')
    const started = Date.now()
    try {
      const result = await target.generateStructured(request)
      appendFileSync(OUT, JSON.stringify({ n: calls, task: request.task, promptVersion: request.promptVersion, ms: Date.now() - started, model: (target as { lastModelId?: string }).lastModelId, result,
        ...(request.task === 'agency_verify' ? { prompt: request.prompt.slice(0, 6000) } : {}) }) + '\n')
      return result
    } catch (error) {
      appendFileSync(OUT, JSON.stringify({ n: calls, task: request.task, promptVersion: request.promptVersion, error: String((error as Error).message).slice(0, 200) }) + '\n')
      throw error
    }
  }
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? value.bind(target) : value
} })
const prepared = await prepareAgencyTurn(sessionId, userId, loaded.snapshot, llm, { id: randomUUID(), text: input }, new Date(), loaded.policyVersion)
const policy = resolveTurnPolicy({ experience: loaded.experienceType, tier: model!.tierName, channel: 'scene', memory: 'inline',
  agencyMode: characterAgencyMode(sessionId, prepared.policyVersion ?? loaded.policyVersion), agencyReady: prepared.agency?.mode === 'live', continuity: false })
try {
  const result = await runTurn({ llm, snapshot: prepared.snapshot, userInput: input, agency: prepared.agency, policy })
  appendFileSync(OUT, JSON.stringify({ final: 'accepted', blocks: result.transition.blocks }) + '\n')
} catch (error) {
  appendFileSync(OUT, JSON.stringify({ final: 'failed', error: String((error as Error).message).slice(0, 300) }) + '\n')
}
console.log(JSON.stringify({ calls }))
process.exit(0)
