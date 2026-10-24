import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { playVoiceMessage, voicePause } from '../voice-playback'
class FakeAudio extends EventTarget {
  src = ''
  paused = false
  play = vi.fn(async () => { setTimeout(() => this.dispatchEvent(new Event('ended')), 10) })
  pause = vi.fn(() => { this.paused = true })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const wav = () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/wav' } })
it('plays utterances in order with the declared pause and sends only owner message identifiers', async () => {
  const requests: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body)
    return body.plan ? Response.json({ segments: [{ part: 0, pauseAfterMs: 400 }, { part: 1, pauseAfterMs: 0 }] }) : wav()
  }))
  const audio = new FakeAudio(), status = vi.fn()
  const work = playVoiceMessage('session', 'message', audio as unknown as HTMLAudioElement, new AbortController().signal, status)
  await vi.advanceTimersByTimeAsync(20)
  expect(requests).toHaveLength(2)
  expect(audio.play).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(410)
  await work
  expect(requests).toEqual([{ sessionId: 'session', messageId: 'message', plan: true },
    { sessionId: 'session', messageId: 'message', part: 0 }, { sessionId: 'session', messageId: 'message', part: 1 }])
  expect(audio.play).toHaveBeenCalledTimes(2)
  expect(status).toHaveBeenLastCalledWith('idle')
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
it('stops at mode-off during a pause without generating the next part', async () => {
  const fetcher = vi.fn(async (_url, options) => JSON.parse(options.body).plan
    ? Response.json({ segments: [{ part: 0, pauseAfterMs: 800 }, { part: 1, pauseAfterMs: 0 }] }) : wav())
  vi.stubGlobal('fetch', fetcher)
  const controller = new AbortController()
  const work = playVoiceMessage('s', 'm', new FakeAudio() as unknown as HTMLAudioElement, controller.signal, () => {})
  const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' })
  await vi.advanceTimersByTimeAsync(20)
  controller.abort(); await rejected
  await vi.advanceTimersByTimeAsync(2000)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('cancels active playback, releases its URL and never substitutes a browser voice', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => JSON.parse(options.body).plan
    ? Response.json({ segments: [{ part: 0, pauseAfterMs: 0 }] }) : wav()))
  const audio = new FakeAudio(); audio.play = vi.fn(async () => {})
  const controller = new AbortController()
  const work = playVoiceMessage('s', 'm', audio as unknown as HTMLAudioElement, controller.signal, () => {})
  const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' })
  await vi.advanceTimersByTimeAsync(1); controller.abort(); await rejected
  expect(audio.pause).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
})
it('does not automatically retry provider failures', async () => {
  const fetcher = vi.fn(async (_url, options) => JSON.parse(options.body).plan
    ? Response.json({ segments: [{ part: 0, pauseAfterMs: 0 }] }) : new Response(null, { status: 502 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(playVoiceMessage('s', 'm', new FakeAudio() as unknown as HTMLAudioElement, new AbortController().signal, () => {})).rejects.toThrow('voice_generation_failed')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('rejects duplicate part numbers and aborts an already-cancelled pause immediately', async () => {
  const c = new AbortController(); c.abort()
  expect(() => voicePause(50, c.signal)).toThrow()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ segments: [{ part: -1, pauseAfterMs: 0 }] })))
  await expect(playVoiceMessage('s', 'm', new FakeAudio() as unknown as HTMLAudioElement, new AbortController().signal, () => {})).rejects.toThrow('invalid_voice_part')
})
it('waits for one durable job using GET only and then plays its result', async () => {
  const id='12345678-1234-1234-1234-123456789014', calls: Array<{url:string;method:string}>=[]
  let polls=0
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    calls.push({url:String(url),method:options?.method??'GET'})
    if(String(url).includes('/jobs/'))return ++polls===1?Response.json({jobId:id,state:'running',pollAfterMs:1000},{status:202}):wav()
    return JSON.parse(options.body).plan?Response.json({segments:[{part:0,pauseAfterMs:0}]}):Response.json({jobId:id,state:'queued',pollAfterMs:1000},{status:202})
  }))
  const audio=new FakeAudio()
  const work=playVoiceMessage('s','m',audio as unknown as HTMLAudioElement,new AbortController().signal,()=>{})
  await vi.advanceTimersByTimeAsync(2050);await work
  expect(calls.map(c=>c.method)).toEqual(['POST','POST','GET','GET'])
  expect(audio.play).toHaveBeenCalledOnce()
})
it('mode-off stops polling and best-effort cancels only the queued server job',async()=>{
  const id='12345678-1234-1234-1234-123456789014'
  const fetcher=vi.fn(async(url,options)=>String(url).includes('/jobs/')?new Response(null,{status:204}):JSON.parse(options.body).plan?Response.json({segments:[{part:0,pauseAfterMs:0}]}):Response.json({jobId:id,state:'queued',pollAfterMs:1500},{status:202}))
  vi.stubGlobal('fetch',fetcher)
  const c=new AbortController(),audio=new FakeAudio()
  const work=playVoiceMessage('s','m',audio as unknown as HTMLAudioElement,c.signal,()=>{})
  const rejected=expect(work).rejects.toMatchObject({name:'AbortError'})
  await vi.advanceTimersByTimeAsync(5);c.abort();await rejected;await vi.advanceTimersByTimeAsync(5000)
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(fetcher.mock.calls[2]).toEqual([`/api/tts/jobs/${id}`,{method:'DELETE',keepalive:true}])
  expect(audio.play).not.toHaveBeenCalled()
})
it('does not resubmit a job when polling fails',async()=>{
  const id='12345678-1234-1234-1234-123456789014'
  const fetcher=vi.fn(async(url,options)=>String(url).includes('/jobs/')?new Response(null,{status:502}):JSON.parse(options.body).plan?Response.json({segments:[{part:0,pauseAfterMs:0}]}):Response.json({jobId:id,state:'queued',pollAfterMs:1000},{status:202}))
  vi.stubGlobal('fetch',fetcher)
  const work=playVoiceMessage('s','m',new FakeAudio() as unknown as HTMLAudioElement,new AbortController().signal,()=>{})
  const rejected=expect(work).rejects.toThrow('voice_generation_failed');await vi.advanceTimersByTimeAsync(1010);await rejected
  expect(fetcher).toHaveBeenCalledTimes(3)
})
