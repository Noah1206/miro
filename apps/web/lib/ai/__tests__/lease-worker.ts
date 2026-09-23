import { AIOrchestrator, type AIProvider } from '@miro/providers'
import { z } from 'zod'
import { databaseAILeaseGuard } from '../gateway'

let finish: (() => void) | undefined
const controller = new AbortController()
process.on('message', message => {
  if (message === 'release') finish?.()
  if (message === 'cancel') controller.abort()
})

const provider: AIProvider = {
  info: { mode: 'live', name: process.env.LEASE_TEST_PROVIDER!, notice: null },
  healthCheck: async () => true,
  generate: async request => {
    process.send?.({ type: 'started' })
    await new Promise<void>(resolve => { finish = resolve })
    return { text: request.json ? '{"message":"ok"}' : 'ok', provider: process.env.LEASE_TEST_PROVIDER!, model: 'fake', inputTokens: 1, outputTokens: 1, latencyMs: 1 }
  },
}

const ai = new AIOrchestrator({
  chain: [provider], leaseGuard: databaseAILeaseGuard, maxRetries: 0,
  timeoutMs: Number(process.env.LEASE_TEST_TIMEOUT ?? 5000),
  maxLeaseHoldMs: Number(process.env.LEASE_TEST_MAX_HOLD ?? 300_000),
  context: { userId: process.env.LEASE_TEST_USER!, sessionId: process.env.LEASE_TEST_SESSION! },
  budgetGuard: { authorize: async (_request, _model, _context, attemptId) => ({ allowed: true, reservationId: attemptId, maxUsageUnits: 0 }) },
})

void (async () => {
  try {
    const value = process.env.LEASE_TEST_CANCEL === '1'
      ? await ai.execute({ task: 'dialogue', schema: z.object({ message: z.string() }), system: '', prompt: 'fake', signal: controller.signal })
      : await ai.generateText({ system: '', prompt: 'fake' })
    process.send?.({ type: 'result', value })
  } catch (error) {
    process.send?.({ type: 'result', attempts: error instanceof Error && 'attempts' in error ? error.attempts : null,
      last: error instanceof Error && 'last' in error ? error.last : String(error) })
  }
})()
