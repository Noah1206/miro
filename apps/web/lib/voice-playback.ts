export type VoicePlaybackStatus = 'idle' | 'preparing' | 'playing' | 'error'

export async function playVoiceSelection(sessionId:string,messageId:string,part:number,amount:'standard'|'extended',
  audio:HTMLAudioElement,signal:AbortSignal,status:(state:VoicePlaybackStatus)=>void,reuseOnly=false) {
  check(signal);status('preparing')
  const result=await waitForSpeech(await fetch('/api/tts',{method:'POST',signal,headers:{'content-type':'application/json'},
    body:JSON.stringify({sessionId,messageId,part,amount,confirmed:true,reuseOnly})}),signal)
  if(result.status!==200||!result.headers.get('content-type')?.startsWith('audio/'))throw new Error('voice_generation_failed')
  const blob=await result.blob();check(signal);status('playing')
  await play(blob,audio,signal);status('idle')
}

function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Voice cancelled', 'AbortError') }

export function voicePause(ms: number, signal: AbortSignal): Promise<void> {
  check(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Voice cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function play(blob: Blob, audio: HTMLAudioElement, signal: AbortSignal) {
  check(signal)
  const url = URL.createObjectURL(blob)
  try {
    audio.src = url
    await new Promise<void>((resolve, reject) => {
      const clean = () => { audio.removeEventListener('ended', ended); audio.removeEventListener('error', error); signal.removeEventListener('abort', abort) }
      const ended = () => { clean(); resolve() }
      const error = () => { clean(); reject(new Error('voice_playback_failed')) }
      const abort = () => { audio.pause(); clean(); reject(new DOMException('Voice cancelled', 'AbortError')) }
      audio.addEventListener('ended', ended, { once: true }); audio.addEventListener('error', error, { once: true })
      signal.addEventListener('abort', abort, { once: true })
      audio.play().catch(error)
    })
  } finally { URL.revokeObjectURL(url) }
}

/** Poll one durable job. Never resubmit synthesis when a request times out or loses connection. */
async function waitForSpeech(initial: Response, signal: AbortSignal) {
  let response=initial, jobId: string|null=null
  const deadline=Date.now()+240_000
  try {
    for(let polls=0;response.status===202;polls++) {
      check(signal)
      const state=await response.json() as {jobId?:unknown;state?:unknown;pollAfterMs?:unknown}
      if(typeof state.jobId!=='string'||!/^[0-9a-f-]{36}$/i.test(state.jobId)||jobId&&jobId!==state.jobId
        ||!['queued','running'].includes(String(state.state)))throw new Error('invalid_voice_job')
      jobId=state.jobId
      if(polls>=160||Date.now()>deadline)throw new Error('voice_wait_timeout')
      const ms=typeof state.pollAfterMs==='number'&&Number.isFinite(state.pollAfterMs)?Math.min(5000,Math.max(1000,state.pollAfterMs)):1500
      await voicePause(ms,signal)
      response=await fetch(`/api/tts/jobs/${jobId}`,{signal,cache:'no-store'})
    }
    return response
  } finally {
    if(signal.aborted&&jobId)void fetch(`/api/tts/jobs/${jobId}`,{method:'DELETE',keepalive:true}).catch(()=>{})
  }
}

/** Committed utterances only. Fetch/finish each part before starting the next; no automatic retry. */
export async function playVoiceMessage(sessionId: string, messageId: string, audio: HTMLAudioElement,
  signal: AbortSignal, status: (state: VoicePlaybackStatus) => void) {
  check(signal)
  const request = (extra: object) => fetch('/api/tts', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, messageId, ...extra }) })
  status('preparing')
  const response = await request({ plan: true })
  if (response.status === 204) { status('idle'); return }
  if (!response.ok) throw new Error('voice_unavailable')
  const plan = await response.json() as { segments?: Array<{ part: number; pauseAfterMs: number }> }
  if (!Array.isArray(plan.segments) || plan.segments.length > 12) throw new Error('invalid_voice_plan')
  const seen = new Set<number>()
  for (const segment of plan.segments) {
    check(signal)
    if (!Number.isInteger(segment.part) || segment.part < 0 || segment.part > 11 || seen.has(segment.part)) throw new Error('invalid_voice_part')
    seen.add(segment.part)
    status('preparing')
    const result = await waitForSpeech(await request({ part: segment.part }),signal)
    if (result.status !== 200 || !result.headers.get('content-type')?.startsWith('audio/')) throw new Error('voice_generation_failed')
    const blob = await result.blob(); check(signal)
    status('playing')
    await play(blob, audio, signal)
    const pause = Number.isFinite(segment.pauseAfterMs) ? Math.max(0, Math.min(1500, segment.pauseAfterMs)) : 0
    if (pause) await voicePause(pause, signal)
  }
  status('idle')
}
