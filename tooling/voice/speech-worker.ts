/** Short-utterance synthesis only. Never imports or runs the voice training worker. */
import { resolveTts } from '../../packages/providers/src/tts'
import { speechPolicy, speechQueueEnabled } from '../../apps/web/lib/speech/policy'
import { speechStore } from '../../apps/web/lib/speech/store'
import { processSpeechJob } from '../../apps/web/lib/speech/worker'
import { feature } from '../../packages/config/src/features'
async function main() {
  if(!speechQueueEnabled()) throw new Error('Speech queue is disabled')
  const policy=speechPolicy()
  const ack=process.argv.indexOf('--acknowledge-stopped')
  if(ack!==-1){const id=process.argv[ack+1]??'';if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Provide a job UUID after verifying provider compute stopped');await speechStore().acknowledgeStopped(id);return}
  if(!feature('characterVoice'))throw new Error('Character voice is disabled')
  if(process.env.MIRO_SPEECH_ALLOW_PROVIDER!=='1') throw new Error('Provider execution requires MIRO_SPEECH_ALLOW_PROVIDER=1 and an approved budget')
  const provider=resolveTts();if(!provider)throw new Error('TTS provider is not configured')
  do {const worked=await processSpeechJob(policy,provider);if(process.argv.includes('--once'))return;if(!worked)await new Promise(resolve=>setTimeout(resolve,5000))}while(true)
}
main().catch(()=>{console.error('Speech worker stopped; configuration or database operation failed. No automatic restart.');process.exitCode=1})
