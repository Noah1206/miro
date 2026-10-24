import type { TtsProvider } from '@miro/providers'
import { speechSpec } from './access'
import { speechKey, type SpeechPolicy, type SpeechSpec } from './policy'
import { speechStore } from './store'

/** A persistent job is claimed once. Unknown outcomes stop this provider queue until reconciled. */
export async function processSpeechJob(policy: SpeechPolicy,provider: TtsProvider,
  store= speechStore(), source: typeof speechSpec = speechSpec) {
  const job=await store.claim(policy)
  if(!job) return false
  let dispatched=false
  try {
    const current: SpeechSpec=await source(job.user_id,job.session_id,job.message_id,job.part,policy)
    if(speechKey(current)!==job.cache_key) {await store.fail(job,false,'source_changed');return true}
    dispatched=true
    const out=await provider.speak(current.payload,AbortSignal.timeout(policy.timeoutMs))
    // Authorization may change during synthesis. Do not publish stale or now-hidden speech.
    const after=await source(job.user_id,job.session_id,job.message_id,job.part,policy)
    if(speechKey(after)!==job.cache_key) {await store.fail(job,false,'source_changed');return true}
    await store.finish(job,out.audio,out.contentType)
  } catch {
    await store.fail(job,dispatched,dispatched?'provider_outcome_unknown':'source_unavailable')
  }
  return true
}
