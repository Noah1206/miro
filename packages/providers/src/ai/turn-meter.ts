import { modelCost, type ModelDefinition } from './model-registry'
import type { GenerationRequest, AIUsageRecord } from './types'

/** A byte upper bound also covers structured-output/tool schemas sent by adapters. */
export function generationInputCeiling(request: GenerationRequest): number {
  return Buffer.byteLength(request.system + request.prompt, 'utf8')
    + (request.responseSchema ? Buffer.byteLength(JSON.stringify(request.responseSchema), 'utf8') : 0) + 512
}

/** One shared envelope covers dialogue, analyses, retries and fallbacks before settlement. */
export class TurnMeter {
  private reserved = 0
  private settled = 0
  customerCostUSD = 0
  missingSuccessfulUsage = false
  closed = false
  constructor(readonly limitUSD: number, readonly maxInputTokens: number, readonly maxOutputTokens: number) {
    if (!Number.isFinite(limitUSD) || limitUSD < 0 || !Number.isSafeInteger(maxInputTokens) || maxInputTokens <= 0
      || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error('invalid turn envelope')
  }
  reserve(request: GenerationRequest, model: ModelDefinition): { estimate: number; release(): void; settle(record: AIUsageRecord): void } | null {
    const input = generationInputCeiling(request)
    const estimate = modelCost(model, input, request.maxTokens ?? model.maxOutputTokens)
    if (this.closed || input > this.maxInputTokens || estimate === null || estimate < 0 || !Number.isFinite(estimate)
      || this.reserved + this.settled + estimate > this.limitUSD + 1e-10) return null
    this.reserved += estimate
    let done = false
    const release = () => { if (!done) { done = true; this.reserved -= estimate } }
    return { estimate, release, settle: record => {
      if (done) return
      release()
      const cost = record.estimatedCost
      const known = cost !== null && cost !== undefined && Number.isFinite(cost) && cost >= 0
      // Missing usage on failures remains in the service budget, but is never billed as measured customer usage.
      this.settled += known ? cost : estimate
      if (known) this.customerCostUSD += cost
      else if (record.ok) this.missingSuccessfulUsage = true
    } }
  }
}
