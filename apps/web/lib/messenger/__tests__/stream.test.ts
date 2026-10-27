import { expect, it, vi } from 'vitest'
import { draftMessageText, readMessengerStream } from '../stream'
it('decodes only send:true text, holding incomplete escapes and hidden fields', () => {
  expect(draftMessageText('{"send":true,"text":"안녕')).toBe('안녕')
  expect(draftMessageText('{"send":true,"text":"안녕\\')).toBe('안녕')
  expect(draftMessageText('{"send":true,"text":"안녕\\uAC')).toBe('안녕')
  expect(draftMessageText('{"send":true,"text":"안녕\\uAC00\\n\\"응\\"","tone":"warm"}')).toBe('안녕가\n"응"')
  expect(draftMessageText('{"send":false,"text":"보내지 않을 말"}')).toBeNull()
  expect(draftMessageText('{"reasoning":"내부","text":"대사"}')).toBeNull()
  expect(draftMessageText('{"text":"먼저 와도 보내기 결정 전이면 보류"}')).toBeNull()
})
it('streams previews before saved messages and clears them on reset/done', async () => {
  let c!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn(), events = vi.fn(), encode = new TextEncoder()
  const reading = readMessengerStream(new Response(new ReadableStream({start(controller) {c = controller}, cancel})), events)
  c.enqueue(encode.encode('{"type":"draft","id":"d","text":"기다려"}\n'))
  await vi.waitFor(() => expect(events).toHaveBeenCalledWith({type:'draft',id:'d',text:'기다려'}))
  c.enqueue(encode.encode('{"type":"reset","id":"d"}\n{"type":"items","items":[]}\n{"type":"done"}\n'))
  await reading
  expect(events.mock.calls.map(([e]) => e.type)).toEqual(['draft','reset','items','done'])
  expect(cancel).toHaveBeenCalled()
})
it('does not treat a proxy disconnect as a completed delivery', async () => {
  await expect(readMessengerStream(new Response('{"type":"items","items":[]}\n'), () => {})).rejects.toThrow('incomplete')
})
