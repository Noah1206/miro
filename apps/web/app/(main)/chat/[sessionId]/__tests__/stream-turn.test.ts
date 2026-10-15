import { afterEach, expect, it, vi } from 'vitest'
import { streamTurn } from '../stream-turn'

afterEach(() => vi.restoreAllMocks())
it('completes and unlocks the composer as soon as the saved result arrives, even if transport stays open', async () => {
  const encoder = new TextEncoder()
  const cancel = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({
    start(c) { c.enqueue(encoder.encode(JSON.stringify({ type: 'done', state: { succeeded: true, error: null, notice: null, limit: null } }) + '\n')) }, cancel,
  })))
  const result = await Promise.race([streamTurn(new FormData(), vi.fn()), new Promise(resolve => setTimeout(() => resolve('stuck'), 100))])
  expect(result).toMatchObject({ succeeded: true })
})
it('preserves retry semantics if the transport ends without a saved result', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"type":"reset"}\n'))
  await expect(streamTurn(new FormData(), vi.fn())).rejects.toThrow('stream_incomplete')
})
it('keeps a playback identity while blocks arrive and replaces it when a generation restarts', async () => {
  const first = [{type:'narrative',text:'문이 열린다.'}]
  const second = [...first,{type:'dialogue',text:'기다렸어.',speaker:'하람'}]
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response([
    {type:'blocks',blocks:first}, {type:'blocks',blocks:second}, {type:'reset'},
    {type:'blocks',blocks:[{type:'dialogue',text:'들어와.',speaker:'하람'}]},
    {type:'done',state:{succeeded:true,error:null,notice:null,limit:null}},
  ].map(event=>JSON.stringify(event)+'\n').join('')))
  const form = new FormData(); form.set('requestId','request-1'); form.set('input','왔어.')
  const onLive = vi.fn()
  await streamTurn(form,onLive)
  expect(onLive.mock.calls.map(([live])=>live.playbackId)).toEqual(['request-1:0','request-1:0','request-1:0','request-1:1','request-1:1'])
  expect(onLive.mock.calls[2]?.[0].blocks).toEqual(second)
})
