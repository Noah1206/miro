import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const h = vi.hoisted(() => ({ row: null as any, user: { id: 'owner-only' } as any, queries: [] as any[], selectCalls: 0, ready: true, speak: vi.fn() }))
vi.mock('@miro/db', async () => {
  const schema = await import('../../../../packages/db/src/schema/index')
  return { ...schema, sql: (await import('drizzle-orm')).sql, db: { select: vi.fn(() => {
    h.selectCalls++
    let table: unknown
    const q: any = { from: (t: unknown) => { table = t; return q }, innerJoin: (_t: unknown, sql: unknown) => { h.queries.push(sql); return q },
      leftJoin: () => q, where: (sql: unknown) => { h.queries.push(sql); return q },
      limit: async () => table === schema.userSettings ? [{ language: 'ko' }] : h.row ? [h.row] : [] }
    return q
  }) } }
})
vi.mock('@/lib/auth', () => ({ currentUser: async () => h.user }))
vi.mock('@miro/providers', () => ({ resolveTts: () => h.ready ? { speak: h.speak } : null }))
import { POST } from '../../app/api/tts/route'
const sessionId = '12345678-1234-1234-1234-123456789012', messageId = '12345678-1234-1234-1234-123456789013'
const req = (extra: object = {}) => new Request('http://localhost/api/tts', { method: 'POST', body: JSON.stringify({ sessionId, messageId, ...extra }) })
beforeEach(() => {
  vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','1')
  vi.stubEnv('MIRO_TTS_QUEUE_ENABLED','0')
  h.user = { id: 'owner-only' }; h.queries = []; h.selectCalls = 0; h.ready = true
  h.speak.mockReset().mockResolvedValue({ audio: new ArrayBuffer(2), contentType: 'audio/wav' })
  h.row = { role: 'character', name: '토마스', voice: 'male-a', voiceStatus: 'active', content: 'whole text', blocks: [
    { type: 'narrative', text: '서술은 읽지 않는다.' },
    { type: 'dialogue', speaker: '토마스', text: '여기 있어.', delivery: { emotion: 'hurt', tone: 'whisper', pace: 'slow', intensity: 'soft', pauseAfterMs: 450 } },
    { type: 'dialogue', speaker: '토마스', text: '반가워.', delivery: { emotion: 'happy', tone: 'playful', pauseAfterMs: 100 } },
  ] }
})
afterEach(()=>vi.unstubAllEnvs())
describe('authenticated committed dialogue to TTS', () => {
  it('blocks even legacy synchronous requests before database or provider work when voice is deferred',async()=>{
    vi.stubEnv('MIRO_FEATURE_CHARACTER_VOICE','0')
    expect((await POST(req({part:0}))).status).toBe(404)
    expect(h.selectCalls).toBe(0)
    expect(h.speak).not.toHaveBeenCalled()
  })
  it('returns only a playback plan, without paid synthesis', async () => {
    const res = await POST(req({ plan: true }))
    expect(await res.json()).toEqual({ segments: [{ part: 0, pauseAfterMs: 450 }, { part: 1, pauseAfterMs: 100 }] })
    expect(h.speak).not.toHaveBeenCalled()
    const dialect = new PgDialect()
    const params = h.queries.flatMap(sql => dialect.sqlToQuery(sql).params)
    expect(params).toContain('owner-only'); expect(params).toContain(messageId); expect(params).toContain(sessionId)
  })
  it('uses the selected stored utterance and directions, ignoring forged client text, voice and delivery', async () => {
    const res = await POST(req({ part: 0, text: 'forged', voice: 'other', delivery: { emotion: 'angry' } }))
    expect(res.status).toBe(200)
    expect(h.speak).toHaveBeenCalledOnce()
    expect(h.speak.mock.calls[0]![0]).toEqual({ text: '여기 있어.', voice: 'male-a', language: 'ko', style: 'whisper',
      delivery: { emotion: 'hurt', tone: 'whisper', pace: 'slow', intensity: 'soft', pauseAfterMs: 450 } })
    expect(h.speak.mock.calls[0]![1]).toBeInstanceOf(AbortSignal)
  })
  it('preserves the second utterance instead of giving the entire response the first emotion', async () => {
    await POST(req({ part: 1 }))
    expect(h.speak.mock.calls[0]![0]).toMatchObject({ text: '반가워.', style: 'normal', delivery: { emotion: 'happy', tone: 'playful', pauseAfterMs: 100 } })
  })
  it('rejects unauthenticated, missing, non-character and out-of-range requests without synthesis', async () => {
    h.user = null; expect((await POST(req())).status).toBe(401); expect(h.selectCalls).toBe(0)
    vi.stubEnv('MIRO_TTS_QUEUE_ENABLED','0')
  h.user = { id: 'owner-only' }; h.row = null; expect((await POST(req())).status).toBe(404)
    h.row = { role: 'user' }; expect((await POST(req())).status).toBe(403)
    expect((await POST(req({ part: -1 }))).status).toBe(400)
    expect(h.speak).not.toHaveBeenCalled()
  })
  it('does not synthesize narration-only messages and reports backend failures without voice substitution', async () => {
    const saved = h.row
    h.row = { ...saved, blocks: [{ type: 'thought', text: '속마음' }] }
    expect((await POST(req({ plan: true }))).status).toBe(204)
    h.row = saved; h.ready = false; expect((await POST(req({ plan: true }))).status).toBe(503)
    h.ready = true; h.speak.mockRejectedValue(new Error('private provider body'))
    const res = await POST(req({ part: 0 })); expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'voice_generation_failed' })
  })
})
