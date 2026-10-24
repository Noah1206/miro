import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
function worker(online = true) {
  const handlers: Record<string, (event: any) => void> = {}
  const offline = new Response('offline screen')
  const response = new Response('private chat HTML')
  const cache = { add: vi.fn(async () => {}), match: vi.fn(async () => offline) }
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['miro-offline-old', 'miro-offline-v1', 'unrelated-cache']), delete: vi.fn(async () => true) }
  const fetch = vi.fn(async () => { if (!online) throw new TypeError('offline'); return response })
  const claim = vi.fn(async () => {})
  runInNewContext(source, { URL, Response, fetch, caches, self: { location: { origin: 'https://miroapp.app' }, clients: { claim }, addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler } } })
  return { handlers, offline, response, cache, caches, fetch, claim }
}

describe('PWA offline worker privacy boundary', () => {
  it('preloads only the public offline screen and removes only its own obsolete caches', async () => {
    const w = worker()
    let pending: Promise<unknown> | undefined
    w.handlers.install!({ waitUntil: (promise: Promise<unknown>) => { pending = promise } }); await pending
    expect(w.cache.add).toHaveBeenCalledOnce()
    expect(w.cache.add).toHaveBeenCalledWith('/offline.html')
    w.handlers.activate!({ waitUntil: (promise: Promise<unknown>) => { pending = promise } }); await pending
    expect(w.caches.delete).toHaveBeenCalledOnce()
    expect(w.caches.delete).toHaveBeenCalledWith('miro-offline-old')
    expect(w.claim).toHaveBeenCalledOnce()
  })
  it('returns live private navigations without placing them in any cache', async () => {
    const w = worker()
    let pending: Promise<Response> | undefined
    w.handlers.fetch!({ request: { method: 'GET', mode: 'navigate', url: 'https://miroapp.app/chat/private' }, respondWith: (promise: Promise<Response>) => { pending = promise } })
    expect(await pending).toBe(w.response)
    expect(w.caches.open).not.toHaveBeenCalled()
  })
  it('uses the generic offline screen only after a navigation fails', async () => {
    const w = worker(false)
    let pending: Promise<Response> | undefined
    w.handlers.fetch!({ request: { method: 'GET', mode: 'navigate', url: 'https://miroapp.app/chat/private' }, respondWith: (promise: Promise<Response>) => { pending = promise } })
    expect(await pending).toBe(w.offline)
    expect(w.cache.match).toHaveBeenCalledOnce()
    expect(w.cache.match).toHaveBeenCalledWith('/offline.html')
  })
  it('leaves API calls, audio, POST requests and other origins untouched', () => {
    const w = worker(false)
    const respondWith = vi.fn()
    for (const request of [
      { method: 'POST', mode: 'cors', url: 'https://miroapp.app/api/turn' },
      { method: 'GET', mode: 'cors', url: 'https://miroapp.app/api/tts' },
      { method: 'GET', mode: 'no-cors', url: 'https://miroapp.app/audio.wav' },
      { method: 'GET', mode: 'navigate', url: 'https://another.example/' },
    ]) w.handlers.fetch!({ request, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
    expect(w.fetch).not.toHaveBeenCalled()
  })
})
