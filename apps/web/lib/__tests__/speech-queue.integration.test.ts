import { createHash, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, users, characters, worlds, roleplaySessions, messages, officialVoices, eq, sql } from '@miro/db'
import { SimulationProposal } from '../../../../packages/engine/src/proposal.schema'
import { testDatabaseUrl } from '../../../../tooling/test-database'
const h=vi.hoisted(()=>({user:null as {id:string}|null,speak:vi.fn()}))
vi.mock('@/lib/auth',()=>({currentUser:async()=>h.user}))
vi.mock('@miro/providers',async original=>({...await original<typeof import('@miro/providers')>(),resolveTts:()=>({speak:h.speak})}))
import { POST } from '../../app/api/tts/route'
import { GET, DELETE } from '../../app/api/tts/jobs/[jobId]/route'
import { speechSpec } from '../speech/access'
import { speechStore } from '../speech/store'
import { processSpeechJob } from '../speech/worker'
import { speechPolicy, speechUserKey, type SpeechPolicy } from '../speech/policy'
const suite=process.env.DATABASE_URL?describe:describe.skip
const ids={owner:randomUUID(),other:randomUUID(),character:randomUUID(),world:randomUUID(),session:randomUUID(),otherSession:randomUUID(),message:randomUUID(),otherMessage:randomUUID()}
const voice='speech-test-'+randomUUID().slice(0,12)
const reference=createHash('sha256').update(voice).digest('hex')
const blocks=SimulationProposal.parse({rp:{blocks:[{type:'narrative',text:'그는 다가와 목소리를 낮춘다.'},
 {type:'dialogue',speaker:'테스트남성',text:'괜찮아. 나 여기 있어.',delivery:{emotion:'hurt',tone:'whisper',pace:'slow',intensity:'soft',pauseAfterMs:400}},
 {type:'dialogue',speaker:'테스트남성',text:'오늘도 반가워.',delivery:{emotion:'happy',tone:'playful',pace:'normal',intensity:'normal',pauseAfterMs:0}}]}}).rp.blocks
const request=(part=0,sessionId=ids.session,messageId=ids.message)=>new Request('http://localhost/api/tts',{method:'POST',body:JSON.stringify({sessionId,messageId,part})})
const params=(jobId:string)=>({params:Promise.resolve({jobId})})
let policy:SpeechPolicy
suite('durable speech: validated dialogue → DB → API → worker → private audio',()=>{
 beforeAll(async()=>{
  testDatabaseUrl(process.env.DATABASE_URL)
  await db.insert(users).values([{id:ids.owner,displayName:'speech-test-owner'},{id:ids.other,displayName:'speech-test-other'}])
  await db.insert(officialVoices).values({id:voice,label:'test only',provider:'gpt-sovits',providerVoiceId:reference,status:'active',samples:[],rights:{test:true},approval:{test:true}})
  await db.insert(characters).values({id:ids.character,ownerId:ids.owner,name:'테스트남성',personality:'test only',voiceId:voice})
  await db.insert(worlds).values({id:ids.world,characterId:ids.character})
  await db.insert(roleplaySessions).values([{id:ids.session,userId:ids.owner,characterId:ids.character,worldId:ids.world},{id:ids.otherSession,userId:ids.other,characterId:ids.character,worldId:ids.world}])
  await db.insert(messages).values([{id:ids.message,sessionId:ids.session,role:'character',content:'generated fixture',blocks,turnIndex:1},{id:ids.otherMessage,sessionId:ids.otherSession,role:'character',content:'generated fixture',blocks,turnIndex:1}])
 })
 beforeEach(async()=>{
  vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','1')
  await db.execute(sql`DELETE FROM speech_synthesis_jobs WHERE user_id IN (${ids.owner},${ids.other})`)
  await db.execute(sql`DELETE FROM speech_synthesis_usage WHERE user_key IN (${speechUserKey(ids.owner)},${speechUserKey(ids.other)})`)
  await db.update(messages).set({hiddenAt:null,blocks}).where(eq(messages.id,ids.message))
  h.user={id:ids.owner};h.speak.mockReset().mockResolvedValue({audio:new Uint8Array([1,2,3]).buffer,contentType:'audio/wav'})
  vi.stubEnv('MIRO_TTS_QUEUE_ENABLED','1');vi.stubEnv('MIRO_SPEECH_MODEL_VERSION','model-test-v1');vi.stubEnv('MIRO_SPEECH_REFERENCE_VERSION','refs-test-v1')
  vi.stubEnv('MIRO_SPEECH_MAX_JOB_MICRO_USD','10');vi.stubEnv('MIRO_SPEECH_USER_DAILY_MICRO_USD','100');vi.stubEnv('MIRO_SPEECH_GLOBAL_DAILY_MICRO_USD','200')
  policy=speechPolicy()
 })
 afterEach(()=>vi.unstubAllEnvs())
 afterAll(async()=>{
  await db.execute(sql`DELETE FROM speech_synthesis_usage WHERE user_key IN (${speechUserKey(ids.owner)},${speechUserKey(ids.other)})`)
  await db.delete(roleplaySessions).where(eq(roleplaySessions.characterId,ids.character))
  await db.delete(characters).where(eq(characters.id,ids.character))
  await db.delete(officialVoices).where(eq(officialVoices.id,voice))
  await db.delete(users).where(eq(users.id,ids.owner));await db.delete(users).where(eq(users.id,ids.other))
 })
 it('deduplicates concurrent submits, keeps per-utterance delivery, and reuses the completed result',async()=>{
  const responses=await Promise.all(Array.from({length:12},()=>POST(request())))
  expect(responses.every(r=>r.status===202)).toBe(true)
  const jobs=await Promise.all(responses.map(r=>r.json()));expect(new Set(jobs.map(j=>j.jobId)).size).toBe(1)
  const jobId=jobs[0].jobId
  expect(h.speak).not.toHaveBeenCalled()
  expect(await processSpeechJob(policy,{speak:h.speak})).toBe(true)
  expect(h.speak).toHaveBeenCalledOnce();expect(h.speak.mock.calls[0]![0]).toMatchObject({voice:reference,text:'괜찮아. 나 여기 있어.',delivery:{tone:'whisper',pace:'slow',pauseAfterMs:400}})
  const audio=await GET(new Request('http://localhost'),params(jobId));expect(audio.status).toBe(200);expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([1,2,3])
  expect((await POST(request())).status).toBe(200);expect(h.speak).toHaveBeenCalledOnce()
  h.user={id:ids.other};expect((await GET(new Request('http://localhost'),params(jobId))).status).toBe(404)
  h.user=null;expect((await GET(new Request('http://localhost'),params(jobId))).status).toBe(401)
 })
 it('allows only one global claim across independent worker/store instances',async()=>{
  await POST(request(0));await POST(request(1))
  const claimed=await Promise.all(Array.from({length:10},()=>speechStore().claim(policy)))
  expect(claimed.filter(Boolean)).toHaveLength(1)
 })
 it('hides the voice API and stops dispatch while retaining queued cancellation when voice is deferred',async()=>{
  const queued=await(await POST(request())).json()
  vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','0')
  expect((await POST(request())).status).toBe(404)
  expect(await processSpeechJob(policy,{speak:h.speak})).toBe(false)
  expect((await speechStore().owned(queued.jobId,ids.owner))?.state).toBe('queued')
  expect((await GET(new Request('http://localhost'),params(queued.jobId))).status).toBe(404)
  expect((await DELETE(new Request('http://localhost'),params(queued.jobId))).status).toBe(204)
  expect(await speechStore().owned(queued.jobId,ids.owner)).toBeNull()
  expect(h.speak).not.toHaveBeenCalled()
 })
 it('quarantines interrupted paid work without automatic resubmission or freeing its reservation',async()=>{
  const first=await (await POST(request())).json();const job=await speechStore().claim(policy);expect(job).not.toBeNull()
  await db.execute(sql`UPDATE speech_synthesis_jobs SET lease_until=now()-interval '1 second' WHERE id=${first.jobId}`)
  await db.execute(sql`UPDATE speech_synthesis_usage SET lease_until=now()-interval '1 second' WHERE job_id=${first.jobId}`)
  expect(await speechStore().claim(policy)).toBeNull()
  expect((await POST(request())).status).toBe(502)
  expect((await POST(request(1))).status).toBe(503)
  const [row]=await db.execute<{state:string;amount:string}>(sql`SELECT state,reservation_micro_usd::text amount FROM speech_synthesis_jobs WHERE id=${first.jobId}`)
  expect(row).toMatchObject({state:'uncertain',amount:'10'});expect(h.speak).not.toHaveBeenCalled()
  await speechStore().acknowledgeStopped(first.jobId)
  expect((await POST(request())).status).toBe(502)
 })
 it('rechecks message visibility before dispatch and every cached-audio read',async()=>{
  const pending=await (await POST(request())).json()
  await db.update(messages).set({hiddenAt:new Date()}).where(eq(messages.id,ids.message))
  await processSpeechJob(policy,{speak:h.speak});expect(h.speak).not.toHaveBeenCalled()
  expect((await GET(new Request('http://localhost'),params(pending.jobId))).status).toBe(404)
  await db.update(messages).set({hiddenAt:null}).where(eq(messages.id,ids.message))
  const second=await (await POST(request(1))).json();await processSpeechJob(policy,{speak:h.speak})
  await db.update(messages).set({hiddenAt:new Date()}).where(eq(messages.id,ids.message))
  expect((await GET(new Request('http://localhost'),params(second.jobId))).status).toBe(404)
 })
 it('reserves rolling daily limits atomically across different owners',async()=>{
  const store=speechStore();const owner=await speechSpec(ids.owner,ids.session,ids.message,0,policy),other=await speechSpec(ids.other,ids.otherSession,ids.otherMessage,0,policy)
  const limited={...policy,globalDailyMicroUsd:10}
  const results=await Promise.allSettled([store.enqueue(owner,limited),store.enqueue(other,limited)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1)
 })
 it('cancels undispatched work only; another owner cannot cancel it and running work is retained',async()=>{
  const job=await (await POST(request())).json()
  h.user={id:ids.other};await DELETE(new Request('http://localhost'),params(job.jobId));expect(await speechStore().owned(job.jobId,ids.owner)).not.toBeNull()
  h.user={id:ids.owner};await DELETE(new Request('http://localhost'),params(job.jobId));expect(await speechStore().owned(job.jobId,ids.owner)).toBeNull()
  const next=await (await POST(request())).json();await speechStore().claim(policy)
  await DELETE(new Request('http://localhost'),params(next.jobId));expect((await speechStore().owned(next.jobId,ids.owner))?.state).toBe('running')
 })
 it('fails closed on missing budget configuration and rejects ambiguous provider failures without retry',async()=>{
  vi.stubEnv('MIRO_SPEECH_MAX_JOB_MICRO_USD','');expect((await POST(request())).status).toBe(503)
  vi.stubEnv('MIRO_SPEECH_MAX_JOB_MICRO_USD','10');await POST(request())
  h.speak.mockRejectedValue(new Error('unknown network outcome'));await processSpeechJob(policy,{speak:h.speak});await processSpeechJob(policy,{speak:h.speak})
  expect(h.speak).toHaveBeenCalledOnce()
 })
 it('preserves cost and the dispatch lock after deleting the audio job',async()=>{
  const store=speechStore(),spec=await speechSpec(ids.owner,ids.session,ids.message,0,policy)
  const job=await store.enqueue(spec,policy);await store.claim(policy)
  await db.execute(sql`DELETE FROM speech_synthesis_jobs WHERE id=${job.id}`)
  const next=await speechSpec(ids.owner,ids.session,ids.message,1,policy)
  await expect(store.enqueue(next,{...policy,globalDailyMicroUsd:10})).rejects.toMatchObject({code:'speech_daily_limit'})
  await store.enqueue(next,policy);expect(await store.claim(policy)).toBeNull()
  await db.execute(sql`UPDATE speech_synthesis_usage SET lease_until=now()-interval '1 second' WHERE job_id=${job.id}`)
  expect(await store.claim(policy)).toBeNull()
  await expect(store.enqueue(spec,policy)).rejects.toMatchObject({code:'speech_provider_paused'})
  await store.acknowledgeStopped(job.id);expect(await store.claim(policy)).not.toBeNull()
 })
 it('keeps both new tables behind RLS with no public Data API grants',async()=>{
  const rows=await db.execute<{rls:boolean;grants:string}>(sql`SELECT relrowsecurity AS rls,relacl::text AS grants FROM pg_class WHERE oid IN ('speech_synthesis_jobs'::regclass,'speech_synthesis_usage'::regclass)`)
  expect(rows).toHaveLength(2)
  for(const row of rows){expect(row.rls).toBe(true);expect(row.grants??'').not.toMatch(/(?:anon|authenticated)=/)}
 })
})
