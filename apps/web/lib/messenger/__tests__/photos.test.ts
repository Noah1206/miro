import { afterEach, describe, expect, it, vi } from 'vitest'
import { photoMessageText } from '../photo-context'
import { chooseMessengerPhoto, messengerPhotosReady } from '../photos'
import type { LLMProvider } from '@miro/providers'
import { portraitReference } from '@/lib/storage/messenger-images'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('Messenger photo boundaries', () => {
  const input = () => ({
    plan: { context: { actor: 'character', sessionId: 'session', evidence: [
      { id: 'wish', actor: 'user', kind: 'message', epistemic: 'reported', knownTo: ['character'], occurredAt: '2026-10-14T12:00:00Z', quote: '내일 카페 가봐.' },
      { id: 'old', actor: 'character', kind: 'event', epistemic: 'observed', knownTo: ['character'], occurredAt: '2026-10-12T12:00:00Z', quote: '카페를 방문했다.' },
    ] }, decision: { candidate: { description: '지금 공방의 풍경을 공유한다.' } }, state: { affect: {}, expression: {} } },
    runtime: { revision: { authored: { fields: { personality: '사진을 드물게 보낸다.' } }, compiled: { rules: [{ id: 'privacy' }] } } },
    snapshot: { world: { currentLocation: '공방' }, relationship: { trust: 40 } },
    now: new Date('2026-10-14T12:01:00Z'), hasPortrait: false, photoProbability: 20,
  } as unknown as Parameters<typeof chooseMessengerPhoto>[1])
  function chooser(over: Record<string, unknown>, grounded = true) {
    const calls: string[] = []
    const llm: LLMProvider = { info: { mode: 'mock', name: 'fixture', notice: null }, async generateStructured(req) {
      calls.push(req.prompt)
      return req.schema.parse(req.promptVersion === 'messenger-photo-grounding:v1' ? { grounded, reason: 'review' } : {
        sendPhoto: true, reason: '공유', subject: 'environment', description: '공방 풍경', sourceId: 'current_environment', ruleIds: ['privacy'], evidenceIds: [], ...over,
      })
    } }
    return { llm, calls }
  }
  it('can decline a photo without any image generation or second model call', async () => {
    const { llm, calls } = chooser({ sendPhoto: false, subject: null, sourceId: null, description: null })
    expect(await chooseMessengerPhoto(llm, input())).toBeNull(); expect(calls).toHaveLength(1)
  })
  it('does not turn a user wish or old life event into a current photo source', async () => {
    const { llm, calls } = chooser({ sourceId: 'wish', subject: 'life_event' })
    expect(await chooseMessengerPhoto(llm, input())).toBeNull()
    expect(JSON.parse(calls[0]!).sources.map((s: { id: string }) => s.id)).toEqual(['current_environment'])
  })
  it('cannot send a selfie without an available portrait reference', async () => {
    const { llm } = chooser({ sourceId: 'current_self', subject: 'selfie' })
    expect(await chooseMessengerPhoto(llm, input())).toBeNull()
  })
  it('rejects unknown cited rules and an ungrounded description', async () => {
    expect(await chooseMessengerPhoto(chooser({ ruleIds: ['invented'] }).llm, input())).toBeNull()
    expect(await chooseMessengerPhoto(chooser({}, false).llm, input())).toBeNull()
  })
  it('allows a grounded current photo while retaining personality, relationship and affect in the decision input', async () => {
    const { llm, calls } = chooser({})
    expect(await chooseMessengerPhoto(llm, input())).toMatchObject({ subject: 'environment' })
    expect(JSON.parse(calls[0]!)).toMatchObject({ authored: { fields: { personality: '사진을 드물게 보낸다.' } }, relationship: { trust: 40 }, affect: {} })
  })
  it('keeps the shared caption and depiction in memory without exposing storage URLs or claiming a completed event', () => {
    const text = photoMessageText({ kind: 'photo', content: '/api/messenger-images/secret-id', blocks: [
      { type: 'reality', caption: '네가 말한 풍경이야.', photoDescription: '공방 창밖 풍경' },
    ] })
    expect(text).toContain('네가 말한 풍경이야.'); expect(text).toContain('공방 창밖 풍경')
    expect(text).toContain('does not independently prove'); expect(text).not.toContain('secret-id')
  })
  it('does not expose URL text for old photos without metadata', () => {
    expect(photoMessageText({ kind: 'photo', content: 'https://example.test/private' })).toBe('[Shared photo]')
  })
  it('leaves ordinary dialogue intact', () => { expect(photoMessageText({ kind: 'messenger', content: '안녕' })).toBe('안녕') })
  it('requires a configured price ceiling as well as real credentials', () => {
    vi.stubEnv('GEMINI_API_KEY', 'fixture'); vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture'); vi.stubEnv('MIRO_FEATURE_MESSENGER_PHOTOS', '1')
    vi.stubEnv('MIRO_MEDIA_COSTS', '{}'); expect(messengerPhotosReady()).toBe(false)
    vi.stubEnv('MIRO_MEDIA_COSTS', '{"messenger_photo":0.12}'); expect(messengerPhotosReady()).toBe(true)
    vi.stubEnv('MIRO_MEDIA_COSTS', '{"messenger_photo":-1}'); expect(messengerPhotosReady()).toBe(false)
    vi.stubEnv('MIRO_MEDIA_COSTS', 'invalid'); expect(messengerPhotosReady()).toBe(false)
  })
  it('never fetches a model supplied URL, other host, redirect source, or private object as portrait', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    for (const url of ['http://127.0.0.1/image', 'https://attacker.test/face', 'https://fixture.supabase.co/storage/v1/object/private/photos/face'])
      expect(await portraitReference(url)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
