import { createHash,randomUUID } from 'node:crypto'
import { beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi } from 'vitest'
import { db,sql,users,characters,worlds,roleplaySessions,messages,officialVoices,rechargeGrants,usageLedger,usageWindows,eq } from '@miro/db'
import { speechBalance,purchaseSpeech } from '../speech/credits'
import { speechStore } from '../speech/store'
import { speechSpec } from '../speech/access'
import { speechPolicy,speechUserKey } from '../speech/policy'
import { processSpeechJob } from '../speech/worker'
import { testWav } from '../../../../tooling/test-wav'
import { quoteSpeech } from '../speech/http'
import { testDatabaseUrl } from '../../../../tooling/test-database'
const suite=process.env.DATABASE_URL?describe:describe.skip
const id={u:randomUUID(),v:randomUUID(),c:randomUUID(),w:randomUUID(),s:randomUUID(),m:randomUUID()}
const voice='credits-'+randomUUID().slice(0,10),reference=createHash('sha256').update(voice).digest('hex')
const blocks=[{type:'narrative',text:'빗소리가 들린다.'},{type:'dialogue',speaker:'테스트',text:'오늘은 어땠어?'},{type:'dialogue',speaker:'테스트',text:'나 여기 있어.'}]
suite('voice seconds and wallet integration',()=>{
 beforeAll(async()=>{
  testDatabaseUrl(process.env.DATABASE_URL)
  await db.insert(users).values([{id:id.u,email:`${id.u}@example.test`},{id:id.v,email:`${id.v}@example.test`}])
  await db.insert(characters).values({id:id.c,slug:'credit-'+id.c,name:'테스트',personality:'test only',voiceId:null})
  await db.insert(worlds).values({id:id.w,characterId:id.c})
  await db.insert(officialVoices).values({id:voice,label:'테스트',provider:'gpt-sovits',providerVoiceId:reference,status:'active',samples:[],rights:{test:true},approval:{test:true}})
  await db.update(characters).set({voiceId:voice}).where(eq(characters.id,id.c))
  await db.insert(roleplaySessions).values({id:id.s,userId:id.u,characterId:id.c,worldId:id.w,status:'active'})
  await db.insert(messages).values({id:id.m,sessionId:id.s,role:'character',content:'테스트',blocks,turnIndex:1})
 })
 beforeEach(async()=>{
  vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','1')
  for(const name of ['speech_credit_allocations','speech_credit_grants','speech_synthesis_jobs'])await db.execute(sql.raw(`DELETE FROM ${name} WHERE user_id='${id.u}'`))
  await db.execute(sql`DELETE FROM speech_synthesis_usage WHERE user_key=${speechUserKey(id.u)}`)
  await db.delete(usageLedger).where(eq(usageLedger.userId,id.u));await db.delete(usageWindows).where(eq(usageWindows.userId,id.u));await db.delete(rechargeGrants).where(eq(rechargeGrants.userId,id.u))
  await db.update(messages).set({blocks,hiddenAt:null}).where(eq(messages.id,id.m))
  vi.stubEnv('MIRO_SPEECH_CREDITS_ENABLED','1');vi.stubEnv('MIRO_TTS_QUEUE_ENABLED','1')
  vi.stubEnv('MIRO_SPEECH_TRIAL_SECONDS','15');vi.stubEnv('MIRO_SPEECH_TRIAL_USERS','10000')
  vi.stubEnv('MIRO_SPEECH_PRODUCTS',JSON.stringify([{id:'minute',seconds:60,units:150}]))
  vi.stubEnv('MIRO_SPEECH_MODEL_VERSION','credit-model-v1');vi.stubEnv('MIRO_SPEECH_REFERENCE_VERSION','credit-ref-v1')
  vi.stubEnv('MIRO_SPEECH_MAX_JOB_MICRO_USD','10');vi.stubEnv('MIRO_SPEECH_USER_DAILY_MICRO_USD','1000');vi.stubEnv('MIRO_SPEECH_GLOBAL_DAILY_MICRO_USD','10000')
 })
 afterEach(()=>vi.unstubAllEnvs())
 afterAll(async()=>{
  await db.execute(sql`DELETE FROM speech_synthesis_usage WHERE user_key=${speechUserKey(id.u)}`)
  await db.delete(roleplaySessions).where(eq(roleplaySessions.id,id.s));await db.delete(worlds).where(eq(worlds.id,id.w));await db.delete(characters).where(eq(characters.id,id.c))
  await db.delete(officialVoices).where(eq(officialVoices.id,voice))
  await db.delete(users).where(eq(users.id,id.u));await db.delete(users).where(eq(users.id,id.v))
 })
 const spec=(amount:'standard'|'extended'='standard',part=0)=>speechSpec(id.u,id.s,id.m,part,speechPolicy(),amount)
 it('grants a separate one-time trial under concurrent balance reads',async()=>{
  const all=await Promise.all(Array.from({length:10},()=>speechBalance(id.u)))
  expect(all.every(b=>b.remainingSeconds===15)).toBe(true)
  const [count]=await db.execute<{n:number}>(sql`SELECT count(*)::int n FROM speech_credit_grants WHERE user_id=${id.u}`);expect(count).toMatchObject({n:1})
 })
 it('does not issue trials or sell voice seconds while character voice is deferred',async()=>{
  vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','0')
  expect(await speechBalance(id.u)).toMatchObject({enabled:false,remainingSeconds:0,products:[]})
  await expect(purchaseSpeech(id.u,'minute',randomUUID())).rejects.toMatchObject({code:'voice_not_ready'})
  const [row]=await db.execute<{n:number}>(sql`SELECT count(*)::int n FROM speech_credit_grants WHERE user_id=${id.u}`)
  expect(row).toMatchObject({n:0})
 })
 it('purchases exactly once using paid wallet funds and never uses signup grants',async()=>{
  await db.insert(rechargeGrants).values({userId:id.u,amount:1000,source:'grant'})
  await expect(purchaseSpeech(id.u,'minute',randomUUID())).rejects.toThrow('usage limit reached')
  await db.insert(rechargeGrants).values({userId:id.u,amount:150,source:'purchase'})
  const requestId=randomUUID();await Promise.all(Array.from({length:8},()=>purchaseSpeech(id.u,'minute',requestId)))
  expect((await speechBalance(id.u)).remainingSeconds).toBe(75)
  const grants=await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId,id.u))
  expect(grants.find(g=>g.source==='grant')?.consumed).toBe(0);expect(grants.find(g=>g.source==='purchase')?.consumed).toBe(150)
 })
 it('reserves once, settles real WAV duration, and replays from cache without another debit',async()=>{
  await speechBalance(id.u);const store=speechStore(),s=await spec(),policy=speechPolicy()
  const jobs=await Promise.all(Array.from({length:10},()=>store.enqueue(s,policy)))
  expect(new Set(jobs.map(j=>j.id)).size).toBe(1);expect((await speechBalance(id.u)).remainingSeconds).toBe(5)
  const speak=vi.fn(async(_request:unknown)=>({audio:testWav(2.2),contentType:'audio/wav'}))
  await processSpeechJob(policy,{speak});expect(speak).toHaveBeenCalledOnce()
  expect(speak.mock.calls[0]?.[0]).not.toBeNull()
  expect((await speechBalance(id.u)).remainingSeconds).toBe(12)
  expect((await store.enqueue(s,policy)).state).toBe('done');expect((await speechBalance(id.u)).remainingSeconds).toBe(12)
  const quote=await(await quoteSpeech(id.u,id.s,id.m,0,'standard')).json();expect(quote).toMatchObject({cached:true,maximumSeconds:0,canGenerate:true})
 })
 it('rejects extended generation when seconds are insufficient and leaves no queued job',async()=>{
  await speechBalance(id.u);await expect(speechStore().enqueue(await spec('extended'),speechPolicy())).rejects.toMatchObject({code:'speech_balance_low'})
  const [row]=await db.execute<{n:number}>(sql`SELECT count(*)::int n FROM speech_synthesis_jobs WHERE user_id=${id.u}`);expect(row).toMatchObject({n:0})
 })
 it('does not silently charge when a free replay expires between quote and listen',async()=>{
  await speechBalance(id.u);const store=speechStore(),s=await spec(),policy=speechPolicy()
  const job=await store.enqueue(s,policy)
  await processSpeechJob(policy,{speak:async()=>({audio:testWav(1),contentType:'audio/wav'})})
  expect((await(await quoteSpeech(id.u,id.s,id.m,0,'standard')).json()).cached).toBe(true)
  await db.execute(sql`UPDATE speech_synthesis_jobs SET created_at=now()-interval '25 hours' WHERE id=${job.id}`)
  const quote=await(await quoteSpeech(id.u,id.s,id.m,0,'standard')).json()
  expect(quote).toMatchObject({cached:false,maximumSeconds:10})
  await expect(store.enqueue(s,policy,true)).rejects.toMatchObject({code:'speech_cache_expired'})
  expect((await speechBalance(id.u)).remainingSeconds).toBe(14)
 })
 it('refunds invalid returned audio while preserving the real compute reservation',async()=>{
  await speechBalance(id.u);await speechStore().enqueue(await spec(),speechPolicy())
  await processSpeechJob(speechPolicy(),{speak:async()=>({audio:new ArrayBuffer(44),contentType:'audio/wav'})})
  expect((await speechBalance(id.u)).remainingSeconds).toBe(15)
  const [usage]=await db.execute<{state:string;cost:string}>(sql`SELECT state,reservation_micro_usd::text cost FROM speech_synthesis_usage WHERE user_key=${speechUserKey(id.u)}`)
  expect(usage).toMatchObject({state:'finished',cost:'10'})
 })
 it('refunds uncertain outcomes, pauses new compute and rejects a late success',async()=>{
  await speechBalance(id.u);const store=speechStore(),policy=speechPolicy();await store.enqueue(await spec(),policy)
  const job=await store.claim(policy);expect(job).not.toBeNull();await store.fail(job!,true,'provider_outcome_unknown')
  expect((await speechBalance(id.u)).remainingSeconds).toBe(15)
  await expect(store.finish(job!,testWav(1),'audio/wav',1)).rejects.toMatchObject({code:'speech_lease_lost'})
  await expect(store.enqueue(await spec('standard',1),policy)).rejects.toMatchObject({code:'speech_provider_paused'})
 })
 it('returns queued reservations on cancellation and expired worker leases',async()=>{
  await speechBalance(id.u);const store=speechStore(),policy=speechPolicy();const job=await store.enqueue(await spec(),policy)
  await store.cancelQueued(job.id,id.v);expect((await speechBalance(id.u)).remainingSeconds).toBe(5)
  await store.cancelQueued(job.id,id.u);expect((await speechBalance(id.u)).remainingSeconds).toBe(15)
  const next=await store.enqueue(await spec(),policy);await store.claim(policy)
  await db.execute(sql`UPDATE speech_synthesis_usage SET lease_until=now()-interval '1 second' WHERE job_id=${next.id}`)
  expect(await store.claim(policy)).toBeNull();expect((await speechBalance(id.u)).remainingSeconds).toBe(15)
 })
 it('never synthesizes atmosphere, narrator or another speakers lines',async()=>{
  await db.update(messages).set({blocks:[{type:'narrative',text:'빗소리가 들린다.'},{type:'dialogue',speaker:'다른 사람',text:'다른 대사'}]}).where(eq(messages.id,id.m))
  await expect(spec()).rejects.toBeDefined()
 })
 it('keeps voice grants and allocations behind RLS without public API grants',async()=>{
  const rows=await db.execute<{rls:boolean;acl:string}>(sql`SELECT relrowsecurity rls,relacl::text acl FROM pg_class WHERE oid IN ('speech_credit_grants'::regclass,'speech_credit_allocations'::regclass)`)
  expect(rows).toHaveLength(2);for(const row of rows){expect(row.rls).toBe(true);expect(row.acl??'').not.toMatch(/(?:anon|authenticated)=/)}
 })
})
