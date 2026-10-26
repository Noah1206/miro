import { speechSpec } from './access'
import { SpeechError, speechKey, speechPolicy } from './policy'
import { speechStore, type SpeechJob } from './store'
import { speechBalance } from './credits'
import { speechAllowance, type SpeechAmount } from './credits-policy'
import { db, sql } from '@miro/db'
const headers = {'cache-control':'private, no-store','retry-after':'2'}
export function speechResponse(job: SpeechJob) {
  if (job.state==='done' && job.audio && job.content_type) return new Response(new Uint8Array(job.audio),{headers:{...headers,'content-type':job.content_type}})
  if (job.state==='failed'||job.state==='uncertain') return Response.json({error:'voice_generation_failed',jobId:job.id,state:job.state},{status:502,headers})
  return Response.json({jobId:job.id,state:job.state,pollAfterMs:1500},{status:202,headers})
}
export function speechFailure(error: unknown) {
  return Response.json({error:error instanceof SpeechError?error.code:'speech_unavailable'}, {status:error instanceof SpeechError?error.status:503,headers})
}
export async function submitSpeech(userId: string,sessionId: string,messageId: string,part: number,amount:SpeechAmount='standard',reuseOnly=false) {
  const policy=speechPolicy()
  const spec=await speechSpec(userId,sessionId,messageId,part,policy,amount)
  return speechResponse(await speechStore().enqueue(spec,policy,reuseOnly))
}
export async function readSpeech(userId: string,id: string) {
  const job=await speechStore().owned(id,userId)
  if (!job) throw new SpeechError('speech_not_found',404)
  // Recheck every poll/result. Hidden, deleted, edited or reassigned conversations cannot leak cached audio.
  const spec=await speechSpec(userId,job.session_id,job.message_id,job.part,speechPolicy(),job.payload.maxAudioSeconds===20?'extended':'standard')
  if(speechKey(spec)!==job.cache_key) throw new SpeechError('speech_not_found',404)
  return speechResponse(job)
}

export async function quoteSpeech(userId:string,sessionId:string,messageId:string,part:number,amount:SpeechAmount) {
  const spec=await speechSpec(userId,sessionId,messageId,part,speechPolicy(),amount)
  const [cached]=await db.execute<{state:string}>(sql`SELECT state FROM speech_synthesis_jobs WHERE cache_key=${speechKey(spec)} AND user_id=${userId}
    AND (state<>'done' OR created_at>=now()-interval '24 hours')`)
  const balance=await speechBalance(userId)
  const reusable=!!cached&&['done','queued','running'].includes(cached.state)
  const maximumSeconds=reusable?0:speechAllowance(amount).seconds
  return Response.json({...balance,maximumSeconds,cached:cached?.state==='done',existingState:cached?.state??null,
    canGenerate:balance.enabled && (!cached || ['done','queued','running'].includes(cached.state)) && balance.remainingSeconds>=maximumSeconds},
    {headers:{'cache-control':'private, no-store'}})
}
