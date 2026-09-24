import { afterAll, describe, expect, it, vi } from 'vitest'
import { and, asc, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, callSessions, messages, relationships, roleplaySessions, users, worldStates } from '@miro/db'
import { cloneAsReality, dropRealityClones } from '@/lib/reality/__tests__/fixtures'

const auth = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@/lib/auth', () => ({ currentUser: async () => (auth.userId ? { id: auth.userId } : null) }))
const { startOutgoingCall, endCall } = await import('../service')
const { POST } = await import('@/app/api/calls/[callId]/turns/route')

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

// 실시간 음성 통화에서 나눈 말도 채팅 턴처럼 대화 기록·관계에 남는다.
describeDb('spoken call turns are remembered', () => {
  const made: string[] = []
  async function call() {
    const [u] = await db.insert(users).values({ email: `vt-${randomBytes(5).toString('hex')}@miro.dev`, plan: 'pro' }).returning()
    made.push(u!.id)
    const c = await cloneAsReality('taeyun')
    const [s] = await db.insert(roleplaySessions).values({ userId: u!.id, characterId: c.id, worldId: c.worldId }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '서울', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id })
    const callId = await startOutgoingCall(u!.id, s!.id, 'voice')
    return { userId: u!.id, sessionId: s!.id, callId }
  }
  const send = (callId: string, body: unknown) => POST(new Request(`https://miro.test/api/calls/${callId}/turns`, {
    method: 'POST', headers: { origin: 'https://miro.test', host: 'miro.test', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ callId }) })
  const lines = (sessionId: string) => db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt))
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)); await dropRealityClones() })

  it('stores both sides of a spoken turn, marked as this call, and the relationship moves like a chat turn', async () => {
    const { userId, sessionId, callId } = await call()
    auth.userId = userId
    const [before] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    const res = await send(callId, { user: '오늘 있었던 일을 차근차근 말해 줄게요', character: '그래, 듣고 있어.' })
    expect(await res.json()).toEqual({ outcome: 'stored' })
    const rows = await lines(sessionId)
    expect(rows.map(m => [m.role, m.content])).toEqual([['user', '오늘 있었던 일을 차근차근 말해 줄게요'], ['character', expect.stringContaining('그래, 듣고 있어.')]])
    expect((rows[1]!.blocks as Array<{ type: string; text?: string }>).some(b => b.type === 'call_line' && b.text === callId)).toBe(true)
    const [after] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    expect(after!.version).toBe(before!.version + 1)
    expect((await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)))[0]!.turnCount).toBe(1)
  })

  it('a line the character said before the user spoke is kept without a made-up user line', async () => {
    const { userId, sessionId, callId } = await call()
    auth.userId = userId
    await send(callId, { user: '', character: '여보세요?' })
    expect((await lines(sessionId)).map(m => m.role)).toEqual(['character'])
  })

  it("accepts the last turn just after hanging up, but not long after, and never another user's call", async () => {
    const { userId, sessionId, callId } = await call()
    auth.userId = userId
    await endCall(userId, callId)
    expect((await (await send(callId, { user: '잘 자요', character: '응, 너도.' })).json()).outcome).toBe('stored')
    await db.update(callSessions).set({ endedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(callSessions.id, callId))
    expect((await send(callId, { user: '또', character: '응.' })).status).toBe(409)
    const other = await call()
    auth.userId = other.userId
    expect((await send(callId, { user: '남의 통화', character: '응.' })).status).toBe(404)
    expect((await lines(sessionId)).filter(m => m.role === 'user').map(m => m.content)).toEqual(['잘 자요'])
  })
})
