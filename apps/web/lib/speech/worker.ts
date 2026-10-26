import type { TtsProvider } from '@miro/providers'
import { speechSpec } from './access'
import { speechKey, type SpeechPolicy, type SpeechSpec } from './policy'
import { speechStore } from './store'
import { speechAudioSeconds } from './credits-policy'
import { feature } from '@miro/config'

/** A persistent job is claimed once. Unknown outcomes stop this provider queue until reconciled. */
export async function processSpeechJob(policy: SpeechPolicy,provider: TtsProvider,
  store= speechStore(), source: typeof speechSpec = speechSpec) {
  if(!feature('characterVoice'))return false
  const job=await store.claim(policy)
  if(!job) return false
  let dispatched=false,received=false
  try {
    const amount=job.payload.maxAudioSeconds===20?'extended':'standard'
    const current: SpeechSpec=await source(job.user_id,job.session_id,job.message_id,job.part,policy,amount)
    if(speechKey(current)!==job.cache_key) {await store.fail(job,false,'source_changed');return true}
    dispatched=true
    const out=await provider.speak(current.payload,AbortSignal.timeout(policy.timeoutMs))
    received=true
    // Authorization may change during synthesis. Do not publish stale or now-hidden speech.
    const after=await source(job.user_id,job.session_id,job.message_id,job.part,policy,amount)
    if(speechKey(after)!==job.cache_key) {await store.fail(job,false,'source_changed');return true}
    const duration=job.payload.maxAudioSeconds?speechAudioSeconds(out.audio):undefined
    if(duration!==undefined && duration>=job.payload.maxAudioSeconds!-.05) { await store.fail(job,false,'speech_duration_exceeded');return true }
    await store.finish(job,out.audio,out.contentType,duration)
  } catch {
    await store.fail(job,dispatched&&!received,received?'invalid_speech_result':dispatched?'provider_outcome_unknown':'source_unavailable')
  }
  return true
}
