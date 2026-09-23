import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { db, users, usageWindows, usageLedger, aiUsage, aiBudgetCounters, messages, aiEvaluationSamples } from '@miro/db'
import { ModelRegistry, prompts } from '@miro/providers'
import { usagePolicy } from '@miro/config'
import { reserve, rollback, commit, usageStatus } from '@/lib/usage/guard'
import { productionBudgetGuard, recordAIUsage, budgetPolicy } from '@/lib/usage/ai-usage'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { beginRequest, reconcileStaleAIReservations } from '../gateway'
import { memoryRetriever } from '../memory'
import { budgetedImage } from '../media-budget'
import { captureEvaluation } from '../evaluation'
const describeDb=process.env.DATABASE_URL?describe:describe.skip
const made:string[]=[]
async function user() {const [u]=await db.insert(users).values({email:`ai-${randomUUID()}@example.test`}).returning();made.push(u!.id);return u!.id}
afterEach(()=>vi.unstubAllEnvs())
afterAll(async()=>{if(process.env.DATABASE_URL)for(const id of made)await db.delete(users).where(eq(users.id,id))})
describeDb('production AI accounting',()=>{
  it('accepts the blank optional JSON values supplied in the environment example',()=>{
    for(const name of ['MIRO_USAGE_POLICY','MIRO_BUDGET_POLICY','MIRO_PROMPT_EXPERIMENTS']) vi.stubEnv(name,'')
    expect(usagePolicy().monthly.free).toBe(200)
    expect(budgetPolicy().global).toBeDefined()
    expect(prompts.select('dialogue','test').version).toBe('v1')
  })
  it('only one concurrent reservation passes a global request ceiling',async()=>{
    const id=await user(), other=await user(), key=`model-test-${randomUUID()}`
    vi.stubEnv('MIRO_BUDGET_POLICY',JSON.stringify({global:{cost:0,requests:100000},[`model:${key}`]:{requests:1}}))
    const model=new ModelRegistry([{id:key,provider:'mock',providerModelId:'mock',tier:'small',capabilities:['dialogue'],maxContextTokens:32000}]).get(key)
    const req={task:'dialogue',system:'s',prompt:'p'}
    const decisions=await Promise.all(Array.from({length:5},(_,index)=>productionBudgetGuard.authorize(req,model,
      {userId:index % 2 ? other : id,sessionId:randomUUID(),traceId:randomUUID(),requestId:randomUUID()},randomUUID())))
    expect(decisions.filter(d=>d.allowed)).toHaveLength(1)
    const attempts=await db.select().from(aiUsage).where(eq(aiUsage.modelId,key));expect(attempts).toHaveLength(1)
  })
  it('unknown prices are denied and an explicit zero budget blocks paid calls',async()=>{
    const model=new ModelRegistry([{id:'paid',provider:'openai',providerModelId:'test',tier:'small',capabilities:['dialogue'],maxContextTokens:32000}]).get('paid')
    const req={task:'dialogue',system:'s',prompt:'p'}
    expect(await productionBudgetGuard.authorize(req,model,{},randomUUID())).toMatchObject({allowed:false,reason:'unknown_price'})
    vi.stubEnv('AI_DAILY_BUDGET','0')
    expect(await productionBudgetGuard.authorize(req,{...model,inputCost:1,outputCost:2},{},randomUUID())).toMatchObject({allowed:false,reason:'global_cost'})
  })
  it('applies the same pre-call budget to images, including zero-cost mocks',async()=>{
    const id=await user(),work=vi.fn(async()=>({url:'/test.svg'})),name=`media-${randomUUID()}`
    vi.stubEnv('MIRO_MEDIA_COSTS','')
    const opts={kind:'photo',info:{name,mode:'live' as const,notice:null},userId:id,sessionId:randomUUID(),usageUnits:10}
    await expect(budgetedImage(opts,work)).rejects.toThrow('unknown_price')
    expect(work).not.toHaveBeenCalled()
    vi.stubEnv('MIRO_MEDIA_COSTS','{"photo":0.01}');vi.stubEnv('AI_DAILY_BUDGET','0')
    await expect(budgetedImage(opts,work)).rejects.toThrow('global_cost')
    expect(work).not.toHaveBeenCalled()
    await expect(budgetedImage({...opts,info:{...opts.info,mode:'mock'}},work)).resolves.toEqual({url:'/test.svg'})
    const [log]=await db.select().from(aiUsage).where(eq(aiUsage.modelId,name))
    expect(log).toMatchObject({ok:true,usageUnits:10,estimatedCost:'0.00000000',actualCost:null})
  })
  it('evaluation collection requires current independent consent and removes known identifiers',async()=>{
    const id=await user(),{sessionId}=await createRoleplaySession(id,'thomas')
    const {requestId}=await beginRequest(id,sessionId,'안녕')
    vi.stubEnv('MIRO_EVAL_SAMPLE_PERCENT','100')
    const data={input:'안녕 Alice alice@example.test',response:'어서 와.',context:'첫 만남',promptVersion:'dialogue:v1',modelId:'mock'}
    await captureEvaluation(id,requestId,data)
    expect(await db.select().from(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,id))).toHaveLength(0)
    await db.update(users).set({allowEvaluation:true,allowTraining:false,displayName:'Alice',email:'alice@example.test',aiConsentVersion:'test-v1'}).where(eq(users.id,id))
    await captureEvaluation(id,requestId,data)
    const samples=await db.select().from(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,id))
    expect(samples).toHaveLength(1);expect(JSON.stringify(samples[0]!.content)).not.toMatch(/Alice|alice@example/)
    await db.delete(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,id))
    await db.update(users).set({allowEvaluation:false}).where(eq(users.id,id))
    await captureEvaluation(id,requestId,data)
    expect(await db.select().from(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId,id))).toHaveLength(0)
  })
  it('settlement is idempotent and failed unknown usage keeps reserved cost',async()=>{
    const id=await user(), key=`paid-${randomUUID()}`, attemptId=randomUUID()
    vi.stubEnv('AI_DAILY_BUDGET','100')
    const model=new ModelRegistry([{id:key,provider:'openai',providerModelId:'test',tier:'small',capabilities:['dialogue'],maxContextTokens:32000,inputCost:1,outputCost:2}]).get(key)
    expect((await productionBudgetGuard.authorize({task:'dialogue',system:'s',prompt:'p'},model,{userId:id},attemptId)).allowed).toBe(true)
    const record={attemptId,userId:id,sessionId:null,task:'dialogue',provider:'openai',model:'test',latencyMs:100,ok:false,error:'timeout',inputTokens:null,outputTokens:null,estimatedCost:null}
    await recordAIUsage(record);await recordAIUsage(record)
    const rows=await db.select().from(aiUsage).where(eq(aiUsage.attemptId,attemptId));expect(rows).toHaveLength(1)
    const [counter]=await db.select().from(aiBudgetCounters).where(sql`${aiBudgetCounters.key} like ${`%:model:${key}`}`)
    expect(Number(counter!.cost)).toBeGreaterThan(0);expect(rows[0]!.estimatedCost).toBeNull()
  })
  it('closes a crash-left reservation without refunding unknown provider cost',async()=>{
    const id=await user(),attemptId=randomUUID()
    await db.insert(aiUsage).values({attemptId,userId:id,task:'dialogue',provider:'openai',model:'test',status:'reserved',reservedCost:'0.02000000',budgetKeys:[],ok:false,latencyMs:0,
      createdAt:new Date(Date.now()-2*60*60_000)})
    await reconcileStaleAIReservations()
    const [row]=await db.select().from(aiUsage).where(eq(aiUsage.attemptId,attemptId))
    expect(row).toMatchObject({status:'completed',estimatedCost:'0.02000000',actualCost:null,error:'interrupted_unknown_usage',ok:false})
    await recordAIUsage({attemptId,userId:id,sessionId:null,task:'dialogue',provider:'openai',model:'test',latencyMs:1,ok:false,error:'late',inputTokens:null,outputTokens:null,estimatedCost:null})
    expect((await db.select().from(aiUsage).where(eq(aiUsage.attemptId,attemptId)))[0]).toMatchObject({error:'interrupted_unknown_usage',estimatedCost:'0.02000000'})
  })
  it('refund/retry and simultaneous commit never double debit',async()=>{
    const id=await user(),opts={userId:id,kind:'photo' as const,idempotencyKey:randomUUID()}
    const first=await reserve(opts);await Promise.all([rollback(first.reservationId),rollback(first.reservationId)])
    const retry=await reserve(opts);expect(retry.reused).toBe(false)
    await Promise.all([commit(retry.reservationId),commit(retry.reservationId)])
    await rollback(retry.reservationId)
    expect((await usageStatus(id)).consumed).toBe(10)
  })
  it('reserves only low-cost text continuity and rejects images on the same exhausted pool',async()=>{
    const id=await user();vi.stubEnv('MIRO_USAGE_POLICY',JSON.stringify({monthly:{free:1},continuity:{enabled:true,reserve:2,maxOutputTokens:128}}))
    await reserve({userId:id,kind:'textRP',idempotencyKey:randomUUID()})
    const r=await reserve({userId:id,kind:'textRP',idempotencyKey:randomUUID()});expect(r.continuity).toBe(true)
    await expect(reserve({userId:id,kind:'photo',idempotencyKey:randomUUID()})).rejects.toThrow('usage limit')
    expect((await usageStatus(id)).usedPercent).toBe(100)
  })
  it('replays an identical conversation request without another state update or charge',async()=>{
    vi.stubEnv('AI_PROVIDER','mock');vi.stubEnv('AI_FALLBACK_PROVIDER','');vi.stubEnv('MIRO_MODEL_REGISTRY','');vi.stubEnv('MIRO_MODE','production')
    const id=await user(),{sessionId}=await createRoleplaySession(id,'thomas'),requestId=randomUUID()
    const request={userId:id,sessionId,requestId,input:'안녕'}
    const first=await runConversationTurn(request);expect(first.ok).toBe(true)
    const second=await runConversationTurn(request);expect(second).toEqual(first)
    const logs=await db.select().from(messages).where(eq(messages.sessionId,sessionId));expect(logs).toHaveLength(2)
    // MIRO basic chat is unmetered: the replay is deduped by the request record, not by a ledger row.
    const ledger=await db.select().from(usageLedger).where(eq(usageLedger.userId,id));expect(ledger).toHaveLength(0)
    const conflict=await runConversationTurn({...request,input:'다른 입력'});expect(conflict.ok).toBe(false)
  })
  it('rejects cross-user access and a second in-flight request for a session',async()=>{
    const id=await user(),other=await user(),{sessionId}=await createRoleplaySession(id,'thomas')
    await expect(beginRequest(other,sessionId,'안녕')).rejects.toThrow()
    await beginRequest(id,sessionId,'안녕')
    await expect(beginRequest(id,sessionId,'안녕')).rejects.toThrow('busy')
    expect(await memoryRetriever.retrieve({userId:other,sessionId,query:'비밀',limit:10})).toEqual([])
  })
})
