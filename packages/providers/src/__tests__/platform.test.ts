import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ModelRegistry, routeModels, modelCost, AIOrchestrator, MockAIProvider, AIBudgetDeniedError,
  buildTrainingDataset, type TrainingCandidate, evaluateResponse, MiroSLMProvider, prompts } from '../index'
const model = (id: string, tier: 'small'|'standard'|'premium', capabilities = ['dialogue']) => ({id,provider:'mock',providerModelId:id,tier,capabilities,maxContextTokens:32000,enabled:true})
const registry = new ModelRegistry([model('small','small'),model('standard','standard'),model('premium','premium'),model('semantic','small',['semantic_event'])])
afterEach(()=>vi.unstubAllEnvs())
describe('model routing and governance',()=>{
  // 10/2: 등급은 작업이 정한다 — 프롬프트가 길거나 감정적이어도 대사는 강한(standard) 모델, 분류는 그 일을 맡은 싼 모델.
  it('routes by task, not by how long the prompt is',()=>{
    expect(routeModels(registry,'dialogue',100,'same').map(m=>m.id)).toEqual(['standard','small','premium'])
    expect(routeModels(registry,'dialogue',20000,'same')[0]!.id).toBe('standard')
    expect(routeModels(registry,'semantic_event',20000,'same').map(m=>m.id)).toEqual(['semantic'])
  })
  it('uses task capabilities and rejects contexts that do not fit',()=>{
    expect(()=>routeModels(registry,'memory_summary',100,'same')).toThrow('no capable model')
    expect(()=>routeModels(registry,'dialogue',40000,'same')).toThrow()
  })
  it('lets the dialogue model serve the strong tasks and keeps the backup last',()=>{
    const r=new ModelRegistry([{...model('backup','standard'),fallback:true},model('flash','standard'),model('lite','small',['semantic_event','memory_summary'])])
    for (const task of ['agency_plan','agency_verify','agency_compile','world_update'] as const) expect(routeModels(r,task,100,'u').map(m=>m.id)).toEqual(['flash','backup'])
    expect(routeModels(r,'memory_summary',100,'u').map(m=>m.id)).toEqual(['lite'])
  })
  it('drops task names that no longer exist instead of rejecting the whole registry',()=>{
    expect(new ModelRegistry([model('lite','small',['moderation','semantic_event'])]).get('lite').capabilities).toEqual(['semantic_event'])
  })
  it('never silently treats an unknown live model as free',()=>{
    const m = {...registry.get('small'),provider:'openai' as const}
    expect(modelCost(m,10,10)).toBeNull()
    expect(modelCost({...m,inputCost:1,outputCost:2},1000,1000)).toBe(.003)
  })
  it('requires rollout approval and supports immediate SLM rollback',()=>{
    const r=new ModelRegistry([model('old','small'),{...model('slm','small'),provider:'miro-slm'}])
    const args = ['dialogue',100,'u'] as const
    expect(routeModels(r,...args)[0]!.id).toBe('old')
    expect(routeModels(r,...args,{canaryModel:'slm',canaryPercent:100,approved:true})[0]!.id).toBe('slm')
    expect(routeModels(r,...args,{canaryModel:'slm',canaryPercent:100,approved:true,rollback:true})[0]!.id).toBe('old')
  })
  it('continuity keeps an exhausted conversation on the small model',()=>{
    expect(routeModels(registry,'dialogue',100,'u',{},true).map(m=>m.id)).toEqual(['small'])
  })
  it('blocks before a provider is invoked when budget is denied',async()=>{
    const generate=vi.fn(async()=>({text:'{}',provider:'mock',model:'mock',latencyMs:0,inputTokens:0,outputTokens:0}))
    const ai=new AIOrchestrator({chain:[{info:{name:'test',mode:'mock',notice:null},generate,healthCheck:async()=>true}],budgetGuard:{authorize:async()=>({allowed:false,reason:'global_cost'})}})
    await expect(ai.generateStructured({system:'',prompt:'',schema:z.object({})})).rejects.toBeInstanceOf(AIBudgetDeniedError)
    expect(generate).not.toHaveBeenCalled()
  })
  it('enforces timeout even if an adapter ignores cancellation',async()=>{
    const ai=new AIOrchestrator({chain:[{info:{name:'stuck',mode:'mock',notice:null},healthCheck:async()=>true,generate:()=>new Promise(()=>{})}],timeoutMs:10,maxRetries:0})
    await expect(ai.generateText({system:'',prompt:''})).rejects.toThrow('timeout')
  })
  it('shadow is separate from the returned answer and requires evaluation consent',async()=>{
    const shadow=new MockAIProvider(()=>({message:'shadow'})), spy=vi.spyOn(shadow,'generate')
    const opts={chain:[new MockAIProvider(()=>({message:'production'}))],shadow:{model:registry.get('small'),provider:shadow}}
    const first=new AIOrchestrator(opts)
    expect(await first.generateStructured({system:'',prompt:'',schema:z.object({message:z.string()})})).toEqual({message:'production'})
    expect(spy).not.toHaveBeenCalled()
    const second=new AIOrchestrator({...opts,context:{allowEvaluation:true}})
    expect(await second.generateStructured({system:'',prompt:'',schema:z.object({message:z.string()})})).toEqual({message:'production'})
    expect(second.shadowOutput).toEqual({message:'shadow'})
  })
  it('provides stable versioned prompt experiments',()=>{
    vi.stubEnv('MIRO_PROMPT_EXPERIMENTS',JSON.stringify({dialogue:{version:'v2',percent:100}}))
    expect(prompts.select('dialogue','u').version).toBe('v2')
    expect(()=>prompts.get('dialogue','absent')).toThrow()
  })
  it('SLM uses a separate OpenAI-compatible inference endpoint',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:'안녕'}}],usage:{prompt_tokens:2,completion_tokens:3}})))
    try {
      const p=new MiroSLMProvider('http://127.0.0.1:9000/v1','test','miro-dialogue-v1')
      const result=await p.generate({task:'dialogue',system:'s',prompt:'p'})
      expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:9000/v1/chat/completions')
      expect(result).toMatchObject({provider:'miro-slm',model:'miro-dialogue-v1',text:'안녕'})
    } finally {fetch.mockRestore()}
  })
})
describe('evaluation and training boundary',()=>{
  const c:TrainingCandidate={sourceId:'private-row',subjectId:'account-id',conversationGroup:'session-id',consentVersion:'v1',allowTraining:true,providerTrainingAllowed:true,privacyReviewed:true,qualityScore:5,promptVersion:'v1',modelVersion:'m1',messages:[{role:'user',content:'내 이메일은 user@example.com이야'},{role:'assistant',content:'알려 줘서 고마워.'}]}
  it('excludes unconsented, revoked, unreviewed and provider-prohibited data',async()=>{
    for (const override of [{allowTraining:false},{providerTrainingAllowed:false},{privacyReviewed:false},{qualityScore:2}]) expect((await buildTrainingDataset([{...c,...override}],async()=>true)).sft).toHaveLength(0)
    expect((await buildTrainingDataset([c],async()=>false)).sft).toHaveLength(0)
  })
  it('redacts identifiers, deduplicates, excludes account IDs and requires explicit preference',async()=>{
    const result=await buildTrainingDataset([c,c],async()=>true)
    expect(result.sft).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('user@example.com')
    expect(JSON.stringify(result)).not.toContain('account-id')
    expect(result.dpo).toHaveLength(0)
  })
  it('detects missing memory facts and internal state disclosure without inventing quality scores',()=>{
    const result=evaluateResponse({id:'memory',context:'',userInput:'',requiredFacts:['복숭아'],forbiddenBehavior:[],expectedStyle:'messenger',maxLength:200,referenceResponse:''},'질투 수치가 82야',10,null)
    expect(result.pass).toBe(false);expect(result.internalLeak).toBe(true);expect(result.humanReview.koreanNaturalness).toBeNull()
  })
})
