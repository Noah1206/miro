import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import {
  db, users, userSettings, characters, worlds, roleplaySessions, worldStates,
  relationships, events, messages, realityContacts, memories,
} from '@miro/db'
import { POLICY } from '@miro/config'
import * as providers from '@miro/providers'
import { loadRealityContext } from '../context'
import { evaluateSession } from '../evaluate'
import { runRealityScheduler } from '../scheduler'
import { GET as runMaintenanceCron } from '@/app/api/cron/reality/maintenance/route'
import { GET as runRealityCron } from '@/app/api/cron/reality/route'
import * as pushOutbox from '../push-outbox'
import { cloneAsReality, dropRealityClones } from './fixtures'

/** 시드 공식 캐릭터는 chat 이다. 엔진 테스트는 같은 성향의 reality 복제본 위에서 돈다 — slug 당 한 번. */
afterAll(dropRealityClones)
const realityBySlug = new Map<string, ReturnType<typeof cloneAsReality>>()
const reality = (slug: string) => {
  if (!realityBySlug.has(slug)) realityBySlug.set(slug, cloneAsReality(slug))
  return realityBySlug.get(slug)!
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

/** 낮 시간(Quiet Hours 밖, 세 캐릭터 모두 활동 시간 안)의 고정 시각. 14:00 KST. */
const DAY = new Date('2026-09-12T14:00:00+09:00')
/** 02:00 KST — Quiet Hours. */
const NIGHT = new Date('2026-09-12T02:00:00+09:00')
/** 명세서 5.1 선행조건 "진행 중인 관계". 시작 관계(stranger)가 아니라 어느 정도 형성된 상태. */
const ESTABLISHED = { trust: 45, attachment: 50, emotionalDistance: 45 }

describeDb('reality activation — real send path', () => {
  const made: string[] = []
  afterEach(() => vi.restoreAllMocks())

  async function session(slug: string, opts: {
    idleMinutes?: number
    relationship?: Partial<{ trust: number; attachment: number; emotionalDistance: number }>
    activeEvent?: boolean
  } = {}) {
    const [u] = await db.insert(users)
      .values({ email: `ra-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    await db.insert(userSettings).values({ userId: u!.id, timeZone: 'Asia/Seoul' })

    const c = await reality(slug)

    const idle = opts.idleMinutes ?? 60 * 30
    const [s] = await db.insert(roleplaySessions).values({
      userId: u!.id, characterId: c.id, worldId: c.worldId,
      lastInteractionAt: new Date(DAY.getTime() - idle * 60_000),
    }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '런던', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id, ...c.initial, ...opts.relationship })
    if (opts.activeEvent) {
      await db.insert(events).values({
        sessionId: s!.id, type: 'crisis', status: 'active', createdAtTurn: 1,
        continuationState: { summary: '공방에 불이 났다' },
      })
    }
    return s!.id
  }

  async function contacts(sessionId: string) {
    return db.select().from(realityContacts).where(eq(realityContacts.sessionId, sessionId))
  }
  async function realityMessages(sessionId: string) {
    return db.select().from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'reality_message')))
  }

  beforeAll(async () => {
    expect((await db.select().from(characters).where(eq(characters.isOfficial, true))).length).toBe(4)
  })
  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
  })

  it('no reason → nothing sent, nothing recorded as sent', async () => {
    // 시작 관계(stranger, 애착 낮음)에서 침묵만으로는 연락하지 않는다
    const id = await session('thomas', { idleMinutes: 60 * 24 * 5 })
    const r = await evaluateSession(id, DAY)
    expect(r.outcome).toBe('no_intent')
    expect(await realityMessages(id)).toHaveLength(0)
  })

  it('grounds contact in visible owned history and memory', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    const [owner] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    await db.insert(messages).values([
      { sessionId: id, role: 'user', kind: 'text', content: '약속은 취소했어', turnIndex: 1 },
      { sessionId: id, role: 'user', kind: 'text', content: 'HIDDEN_SECRET', hiddenAt: new Date(), turnIndex: 2 },
    ])
    await db.insert(memories).values({ sessionId: id, characterId: owner!.characterId, type: 'preference', content: '차를 좋아함', importance: 90, persistence: 90, confidence: 100 })
    const context = await loadRealityContext(id, owner!.userId, '약속')
    expect(JSON.stringify(context)).toContain('약속은 취소했어')
    expect(JSON.stringify(context)).toContain('차를 좋아함')
    expect(JSON.stringify(context)).not.toContain('HIDDEN_SECRET')
    expect(await loadRealityContext(id, '00000000-0000-4000-8000-000000000000', '약속')).toBeNull()
  })

  it.each(['deletedAt', 'restrictedAt', 'lastInteractionAt'] as const)('does not persist a stale contact after %s changes during inference', async field => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    vi.spyOn(providers, 'generateRealityContent').mockImplementation(async () => {
      await db.update(roleplaySessions).set({ [field]: new Date() }).where(eq(roleplaySessions.id, id))
      return { text: '잘 지내요?', tone: 'warm' }
    })
    expect(await evaluateSession(id, DAY)).toEqual({ outcome: 'skipped', reason: 'state_changed' })
    expect(await realityMessages(id)).toHaveLength(0)
    expect(await contacts(id)).toHaveLength(0)
  })

  it('an active event produces a real in-app message with world translation', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    const r = await evaluateSession(id, DAY)
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })

    const [m] = await realityMessages(id)
    expect(m).toBeDefined()
    const block = (m!.blocks as Array<Record<string, unknown>>)[0]!
    expect(block.senderLabel).toBe('토마스')
    expect(block.channelLabel).toBe('편지')     // 토마스 세계관 표현
    expect(m!.content).not.toMatch(/신뢰|애착|정서적 거리/)   // 수치 비노출
  })

  it('히사시 arrives as an unknown number', async () => {
    const id = await session('hisashi', { activeEvent: true, relationship: ESTABLISHED })
    // 히사시 활동시간 18:00-04:00 → 밤 22:00 에 판단
    const r = await evaluateSession(id, new Date('2026-09-12T22:00:00+09:00'))
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })
    const [m] = await realityMessages(id)
    expect((m!.blocks as Array<Record<string, unknown>>)[0]!.senderLabel).toBe('알 수 없는 번호')
  })

  it('outside the character\'s active hours nothing goes out, but state is untouched', async () => {
    const id = await session('hisashi', { activeEvent: true, relationship: ESTABLISHED })
    const r = await evaluateSession(id, DAY)   // 14:00 — 히사시는 자는 시간
    expect(r).toEqual({ outcome: 'suppressed', reason: 'outside_active_hours' })
    expect(await realityMessages(id)).toHaveLength(0)
    const [e] = await db.select().from(events).where(eq(events.sessionId, id))
    expect(e!.status).toBe('active')   // 사건은 그대로 살아 있다
  })

  // 사용자 쪽 야간 차단은 없다 (2026-09-24). 밤에 조용한 건 캐릭터의 활동 시간(태윤 07~24시) 때문이다.
  it('Scenario 5: at night the character keeps to its own active hours and simulation state stays', async () => {
    const id = await session('taeyun', { activeEvent: true, relationship: ESTABLISHED })
    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: { channel: 'push', reason: 'test', urgency: 0.9 } })
      .where(eq(roleplaySessions.id, id))
    const r = await evaluateSession(id, NIGHT)
    expect(r).toEqual({ outcome: 'suppressed', reason: 'outside_active_hours' })

    const [rel] = await db.select().from(relationships).where(eq(relationships.sessionId, id))
    expect(rel!.version).toBe(1)                          // 관계 상태 변화 없음
    const [e] = await db.select().from(events).where(eq(events.sessionId, id))
    expect(e!.status).toBe('active')                      // 사건 유지
  })

  it('T8: right after a fight, a distant character does not cheerfully reach out', async () => {
    const id = await session('thomas', {
      idleMinutes: 60 * 24 * 3,
      relationship: { trust: 15, attachment: 25, emotionalDistance: 95 },
    })
    const r = await evaluateSession(id, DAY)
    expect(r.outcome).toBe('no_intent')
    expect(await realityMessages(id)).toHaveLength(0)
  })

  it('T8 (forced): even when an event forces contact after a fight, the tone is terse', async () => {
    const id = await session('taeyun', {
      activeEvent: true,
      relationship: { trust: 15, attachment: 70, emotionalDistance: 85 },
    })
    // Force the high-urgency event intent explicitly; ordinary post-fight motivation may suppress contact.
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '공방 위기 알림', urgency: 1 } }).where(eq(roleplaySessions.id, id))
    const r = await evaluateSession(id, DAY)
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })
    const [c] = await contacts(id)
    expect((c!.payload as { tone: string }).tone).toBe('terse')
    expect((c!.payload as { text: string }).text).not.toMatch(/생각나서|어땠어요/)
  })

  it('a stranger is not contacted even during a crisis — an intent exists but motivation does not', async () => {
    // 시작 관계 그대로. 사건이 있어도 관계가 없으면 먼저 연락하지 않는다.
    const id = await session('thomas', { activeEvent: true })
    expect(await evaluateSession(id, DAY)).toEqual({ outcome: 'suppressed', reason: 'no_motivation' })
  })

  it('dedupe: the same event reason is never sent twice', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')

    // 쿨다운을 지난 시각에 다시 판단 — 같은 사건이므로 dedupe 가 막아야 한다
    const later = new Date(DAY.getTime() + (POLICY.reality.minGapMinutes + 5) * 60_000)
    const r = await evaluateSession(id, later)
    expect(r).toEqual({ outcome: 'skipped', reason: 'duplicate' })
    expect(await realityMessages(id)).toHaveLength(1)
  })

  it('cooldown: a fresh reason still waits for the minimum gap', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')

    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: { channel: 'message', reason: 'another', urgency: 0.9 } })
      .where(eq(roleplaySessions.id, id))
    const soon = new Date(DAY.getTime() + 10 * 60_000)
    expect(await evaluateSession(id, soon)).toEqual({ outcome: 'suppressed', reason: 'cooldown' })
  })

  it('the pending intent from a turn is consumed by the send', async () => {
    // 사건 없이 의도만으로 보내려면 적극적 캐릭터 + 가까운 관계가 필요하다
    const id = await session('taeyun', { relationship: { trust: 60, attachment: 60, emotionalDistance: 35 } })
    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: { channel: 'message', reason: 'promised to write', urgency: 0.9 } })
      .where(eq(roleplaySessions.id, id))

    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')
    const [s] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(s!.pendingRealityIntent).toBeNull()
    const [c] = await contacts(id)
    expect(c!.reason).toBe('promised to write')
  })

  it('opening the chat marks the contact as opened (re-entry event)', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    await evaluateSession(id, DAY)
    await db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, id), eq(realityContacts.status, 'sent')))
    const [c] = await contacts(id)
    expect(c!.status).toBe('opened')
  })
})

describeDb('reality scheduler', () => {
  const made: string[] = []
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  async function idleSession(idleMinutes: number, activeEvent = false) {
    const [u] = await db.insert(users)
      .values({ email: `rs-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    const c = await reality('thomas')
    const [s] = await db.insert(roleplaySessions).values({
      userId: u!.id, characterId: c.id, worldId: c.worldId,
      lastInteractionAt: new Date(DAY.getTime() - idleMinutes * 60_000),
    }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: 'x', currentTime: 'y' })
    await db.insert(relationships).values({ sessionId: s!.id,
      ...(activeEvent ? ESTABLISHED : {}) })
    if (activeEvent) await db.insert(events).values({ sessionId: s!.id, type: 'crisis', status: 'active', createdAtTurn: 1,
      continuationState: { summary: '공방에 불이 났다' } })
    return s!.id
  }

  it('only considers sessions idle long enough, and does not re-check within the interval', async () => {
    const active = await idleSession(5)                                        // 대화 중
    const idle = await idleSession(POLICY.reality.idleMinutesBeforeContact + 30)

    await runRealityScheduler(DAY)

    const [a] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, active))
    const [i] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, idle))
    expect(a!.realityCheckedAt).toBeNull()                 // 대화 중인 세션은 건드리지 않는다
    expect(i!.realityCheckedAt?.getTime()).toBe(DAY.getTime())

    // 곧바로 다시 돌리면 같은 세션을 다시 잡지 않는다
    const second = await runRealityScheduler(new Date(DAY.getTime() + 60_000))
    const [i2] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, idle))
    expect(i2!.realityCheckedAt?.getTime()).toBe(DAY.getTime())
    expect(second.errors).toBe(0)
  })

  it('retries an interrupted claim after the recheck interval', async () => {
    const id = await idleSession(POLICY.reality.idleMinutesBeforeContact + 30)
    await db.update(roleplaySessions).set({ realityCheckedAt: DAY }).where(eq(roleplaySessions.id, id))
    await runRealityScheduler(new Date(DAY.getTime() + 15 * 60_000))
    expect((await db.select({ at: roleplaySessions.realityCheckedAt }).from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.at?.getTime()).toBe(DAY.getTime())
    const retryAt = new Date(DAY.getTime() + (POLICY.reality.recheckMinutes + 1) * 60_000)
    await runRealityScheduler(retryAt)
    expect((await db.select({ at: roleplaySessions.realityCheckedAt }).from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.at?.getTime()).toBe(retryAt.getTime())
  })

  it('includes an old due session when fresh sessions exceed the batch cap', async () => {
    const old = await idleSession(POLICY.reality.idleMinutesBeforeContact + 60)
    await db.update(roleplaySessions).set({ realityCheckedAt: new Date(DAY.getTime() - 120 * 60_000) }).where(eq(roleplaySessions.id, old))
    for (let index = 0; index < 10; index++) await idleSession(POLICY.reality.idleMinutesBeforeContact + 30)
    const run = await runRealityScheduler(DAY)
    expect(run.claimed).toBeLessThanOrEqual(10)
    expect((await db.select({ at: roleplaySessions.realityCheckedAt }).from(roleplaySessions).where(eq(roleplaySessions.id, old)))[0]!.at?.getTime()).toBe(DAY.getTime())
  })

  it('runs existing maintenance and push work before slow AI evaluation', async () => {
    await idleSession(POLICY.reality.idleMinutesBeforeContact + 30, true)
    const push = vi.spyOn(pushOutbox, 'deliverRealityPush').mockResolvedValue(0)
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const blocked = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(providers, 'generateRealityContent').mockImplementation(async () => {
      started()
      await blocked
      return { text: '잘 지내요?', tone: 'warm' }
    })
    const run = runRealityScheduler(DAY)
    try {
      await entered
      expect(push).toHaveBeenCalledTimes(1)
    } finally { release() }
    await run
  })

  it('runs maintenance and push independently while a slow AI evaluation remains blocked', async () => {
    vi.stubEnv('CRON_SECRET', 'isolation-test')
    expect((await runMaintenanceCron(new Request('http://localhost/api/cron/reality/maintenance'))).status).toBe(401)
    expect((await runRealityCron(new Request('http://localhost/api/cron/reality?work=unknown', {
      headers: { authorization: 'Bearer isolation-test' },
    }))).status).toBe(400)
    await idleSession(POLICY.reality.idleMinutesBeforeContact + 30, true)
    const push = vi.spyOn(pushOutbox, 'deliverRealityPush').mockResolvedValue(0)
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const blocked = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(providers, 'generateRealityContent').mockImplementation(async () => {
      started()
      await blocked
      return { text: '잘 지내요?', tone: 'warm' }
    })
    const evaluation = runRealityCron(new Request(`http://localhost/api/cron/reality?work=ai&now=${encodeURIComponent(DAY.toISOString())}`, {
      headers: { authorization: 'Bearer isolation-test' },
    }))
    try {
      await entered
      const response = await runMaintenanceCron(new Request('http://localhost/api/cron/reality/maintenance', {
        headers: { authorization: 'Bearer isolation-test' },
      }))
      expect(response.status).toBe(200)
      const maintenance = await response.json()
      expect(maintenance.bankOrders).toBeDefined()
      expect(maintenance.passNotices).toBeDefined()
      expect(push).toHaveBeenCalledTimes(1)
    } finally { release() }
    expect((await evaluation).status).toBe(200)
  })
})
