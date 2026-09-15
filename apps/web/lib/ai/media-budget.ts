import { randomUUID } from 'node:crypto'
import { AIBudgetDeniedError, type ModelDefinition, type ProviderInfo } from '@miro/providers'
import { productionBudgetGuard, recordAIUsage } from '@/lib/usage/ai-usage'
/** Flat media price ceilings are configured independently of user Usage Units. */
export async function budgetedImage<T>(opts: { kind: string; info: ProviderInfo; userId: string | null; sessionId: string; usageUnits: number }, work: () => Promise<T>): Promise<T> {
  const prices = JSON.parse(process.env.MIRO_MEDIA_COSTS || '{}') as Record<string, number>
  const ceiling = opts.info.mode === 'mock' ? 0 : prices[opts.kind]
  if (ceiling === undefined || !Number.isFinite(ceiling) || ceiling < 0) throw new AIBudgetDeniedError('unknown_price')
  const id = randomUUID(), traceId = randomUUID()
  const model: ModelDefinition = {id:opts.info.name,provider:opts.info.mode === 'mock' ? 'mock' : 'replicate',providerModelId:opts.info.name,
    tier:'standard',capabilities:['image_prompt'],enabled:true,version:process.env.MIRO_IMAGE_MODEL ?? 'configured-image',trainingAllowed:false,maxContextTokens:1,maxOutputTokens:1}
  const decision = await productionBudgetGuard.authorize({task:opts.kind,system:'',prompt:'',costCeilingUSD:ceiling},model,{userId:opts.userId,sessionId:opts.sessionId,requestId:id,traceId},id)
  if (!decision.allowed) throw new AIBudgetDeniedError(decision.reason)
  const start=Date.now()
  try {
    const result=await work()
    await recordAIUsage({attemptId:id,traceId,requestId:id,userId:opts.userId,sessionId:opts.sessionId,task:opts.kind,provider:model.provider,model:model.providerModelId,
      modelId:model.id,modelVersion:model.version,promptVersion:'visual:v1',inputTokens:null,outputTokens:null,estimatedCost:ceiling,actualCost:null,usageUnits:opts.usageUnits,latencyMs:Date.now()-start,ok:true,error:null})
    return result
  } catch {
    await recordAIUsage({attemptId:id,traceId,requestId:id,userId:opts.userId,sessionId:opts.sessionId,task:opts.kind,provider:model.provider,model:model.providerModelId,
      inputTokens:null,outputTokens:null,estimatedCost:null,actualCost:null,usageUnits:0,latencyMs:Date.now()-start,ok:false,error:'media_provider_error'})
    throw new Error('media provider unavailable')
  }
}
