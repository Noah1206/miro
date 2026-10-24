import { speechSpec } from './access'
import { SpeechError, speechKey, speechPolicy } from './policy'
import { speechStore, type SpeechJob } from './store'
const headers = {'cache-control':'private, no-store','retry-after':'2'}
export function speechResponse(job: SpeechJob) {
  if (job.state==='done' && job.audio && job.content_type) return new Response(new Uint8Array(job.audio),{headers:{...headers,'content-type':job.content_type}})
  if (job.state==='failed'||job.state==='uncertain') return Response.json({error:'voice_generation_failed',jobId:job.id,state:job.state},{status:502,headers})
  return Response.json({jobId:job.id,state:job.state,pollAfterMs:1500},{status:202,headers})
}
export function speechFailure(error: unknown) {
  return Response.json({error:error instanceof SpeechError?error.code:'speech_unavailable'}, {status:error instanceof SpeechError?error.status:503,headers})
}
export async function submitSpeech(userId: string,sessionId: string,messageId: string,part: number) {
  const policy=speechPolicy()
  const spec=await speechSpec(userId,sessionId,messageId,part,policy)
  return speechResponse(await speechStore().enqueue(spec,policy))
}
export async function readSpeech(userId: string,id: string) {
  const job=await speechStore().owned(id,userId)
  if (!job) throw new SpeechError('speech_not_found',404)
  // Recheck every poll/result. Hidden, deleted, edited or reassigned conversations cannot leak cached audio.
  const spec=await speechSpec(userId,job.session_id,job.message_id,job.part,speechPolicy())
  if(speechKey(spec)!==job.cache_key) throw new SpeechError('speech_not_found',404)
  return speechResponse(job)
}
