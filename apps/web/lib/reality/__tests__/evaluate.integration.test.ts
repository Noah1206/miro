import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import {
  db, users, userSettings, characters, worlds, roleplaySessions, worldStates,
  relationships, events, messages, realityContacts, memories, contactProfiles, pushSubscriptions, realityPushJobs,
} from '@miro/db'
import { POLICY } from '@miro/config'
import { FIRST_CONTACT_REASON, firstContactDelayMinutes } from '@miro/domain'
import * as providers from '@miro/providers'
import * as engine from '@miro/engine'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import * as callService from '@/lib/call/service'
import { loadRealityContext } from '../context'
import { evaluateSession } from '../evaluate'
import { backOffFailing, runRealityMaintenance, runRealityScheduler } from '../scheduler'
import { GET as runMaintenanceCron } from '@/app/api/cron/reality/maintenance/route'
import { GET as runRealityCron } from '@/app/api/cron/reality/route'
import * as pushOutbox from '../push-outbox'
import { cloneAsReality, dropRealityClones } from './fixtures'

/** 시드 공식 캐릭터는 chat 이다. 엔진 테스트는 같은 성향의 reality 복제본 위에서 돈다 — slug 당 한 번. */
afterAll(dropRealityClones)
const realityBySlug = new Map<string, ReturnType<typeof cloneAsReality>>()
const reality = (slug: string) => {
  // 이 파일은 시각(DAY·NIGHT)을 고정해 활동 시간 규칙을 검증한다 — 기본 리듬을 그대로 쓴다.
  if (!realityBySlug.has(slug)) realityBySlug.set(slug, cloneAsReality(slug, { routine: 'default' }))
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
    relationship?: Partial<{ trust: number; attachment: number; emotionalDistance: number; jealousy: number }>
    activeEvent?: boolean
    turnCount?: number
  } = {}) {
    const [u] = await db.insert(users)
      .values({ email: `ra-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    await db.insert(userSettings).values({ userId: u!.id, timeZone: 'Asia/Seoul' })

    const c = await reality(slug)

    const idle = opts.idleMinutes ?? 60 * 30
    const [s] = await db.insert(roleplaySessions).values({
      userId: u!.id, characterId: c.id, worldId: c.worldId,
      lastInteractionAt: new Date(DAY.getTime() - idle * 60_000), turnCount: opts.turnCount ?? 0,
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

    // 쿨다운을 지난 시각에 다시 판단 — 이미 연락한 사건은 의도에서 빠진다(전엔 매번 집혀 중복으로 막혔다)
    const later = new Date(DAY.getTime() + (POLICY.reality.minGapMinutes + 5) * 60_000)
    expect(await evaluateSession(id, later)).toEqual({ outcome: 'no_intent' })
    expect(await realityMessages(id)).toHaveLength(1)
  })

  it('a contacted event does not shadow a second event', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')
    await db.insert(events).values({ sessionId: id, type: 'crisis', status: 'active', createdAtTurn: 2, continuationState: { summary: '창고 열쇠를 잃어버렸다' } })
    const later = new Date(DAY.getTime() + (POLICY.reality.minGapMinutes + 5) * 60_000)
    expect((await evaluateSession(id, later)).outcome).toBe('sent')
    expect(await realityMessages(id)).toHaveLength(2)
  })

  it('suppressed rows never push the last real contact out of view (cooldown holds)', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')
    // 밤새 막힌 기록이 열 줄 넘게 쌓였다 — 전엔 이것들이 최근 10줄을 채워 방금 보낸 연락이 안 보였다.
    await db.insert(realityContacts).values(Array.from({ length: 12 }, (_, i) => ({
      sessionId: id, channel: 'message' as const, reason: 'x', dedupeKey: `test-suppressed-${i}`, status: 'suppressed' as const, suppressedReason: 'busy',
    })))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: 'another', urgency: 0.9 } }).where(eq(roleplaySessions.id, id))
    expect(await evaluateSession(id, new Date(DAY.getTime() + 10 * 60_000))).toEqual({ outcome: 'suppressed', reason: 'cooldown' })
  })

  it('the same suppression is recorded once a day, not every check', async () => {
    const id = await session('thomas', { activeEvent: true })   // 낯선 사이 + 사건 → 동기 없음
    for (const minutes of [0, 30, 60]) {
      expect(await evaluateSession(id, new Date(DAY.getTime() + minutes * 60_000))).toEqual({ outcome: 'suppressed', reason: 'no_motivation' })
    }
    expect((await contacts(id)).filter((c) => c.status === 'suppressed')).toHaveLength(1)
  })

  it('a saved intent with no motivation is dropped instead of blocking every other contact', async () => {
    const id = await session('thomas')
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '그냥 생각나서', urgency: 0.3 } }).where(eq(roleplaySessions.id, id))
    expect(await evaluateSession(id, DAY)).toEqual({ outcome: 'suppressed', reason: 'no_motivation' })
    const [s] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(s!.pendingRealityIntent).toBeNull()
  })

  it('a blocked intent waits, but is dropped after half a day — a reply to the user never is', async () => {
    const fresh = await session('taeyun', { relationship: ESTABLISHED })
    const stale = await session('taeyun', { relationship: ESTABLISHED })
    const reply = await session('taeyun', { relationship: ESTABLISHED })
    const long = new Date(NIGHT.getTime() - 13 * 3_600_000).toISOString()
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '내일 보자고 말하기', urgency: 0.9 } }).where(eq(roleplaySessions.id, fresh))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '내일 보자고 말하기', urgency: 0.9, deferredSince: long } }).where(eq(roleplaySessions.id, stale))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '문자에 답장', urgency: 0.9, answers: 'user_message', deferredSince: long } }).where(eq(roleplaySessions.id, reply))
    for (const id of [fresh, stale, reply]) expect(await evaluateSession(id, NIGHT)).toEqual({ outcome: 'suppressed', reason: 'outside_active_hours' })   // 태윤 07~24시

    const pendingOf = async (id: string) => (await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.pendingRealityIntent
    expect(await pendingOf(fresh)).toMatchObject({ deferredSince: NIGHT.toISOString(), notBefore: new Date(NIGHT.getTime() + POLICY.reality.recheckMinutes * 60_000).toISOString() })
    expect(await pendingOf(stale)).toBeNull()
    expect(await pendingOf(reply)).toMatchObject({ answers: 'user_message', deferredSince: long })
  })

  it('first contact: after a real first conversation, once, on the character\'s own clock', async () => {
    const c = await reality('thomas')
    const [p] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, c.id))
    const [ch] = await db.select().from(characters).where(eq(characters.id, c.id))
    const delay = firstContactDelayMinutes(ch!.initiative, p!.initiativeLevel)

    const early = await session('thomas', { idleMinutes: delay - 30, turnCount: 4 })
    expect(await evaluateSession(early, DAY)).toEqual({ outcome: 'no_intent' })   // 아직 이르다
    const hello = await session('thomas', { idleMinutes: 30 * 60, turnCount: 1 })
    expect(await evaluateSession(hello, DAY)).toEqual({ outcome: 'no_intent' })   // 인사만 하고 떠났다

    const id = await session('thomas', { idleMinutes: delay + 5, turnCount: 4 })   // 낯선 사이 그대로
    const r = await evaluateSession(id, DAY)
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })
    const [contact] = await contacts(id)
    expect(contact!.reason).toBe(FIRST_CONTACT_REASON)
    expect(contact!.dedupeKey).toBe('message:first_contact')
    // 다음 날 다시 판단해도 첫 연락은 두 번 오지 않는다
    expect(await evaluateSession(id, new Date(DAY.getTime() + 24 * 3_600_000))).toEqual({ outcome: 'no_intent' })
  })

  it('daily cap: after a full day of contacts the character waits for tomorrow — but still answers the user', async () => {
    const id = await session('thomas', { idleMinutes: 90, relationship: ESTABLISHED })   // 마지막 대화 12:30
    // 오늘 아침부터 정오까지 다섯 번 보냈다(상한은 최대 5). 마지막 대화 전이라 '안 읽은 연락'은 아니다.
    await db.insert(realityContacts).values([8, 9, 10, 11, 12].map((h) => ({
      sessionId: id, channel: 'message' as const, reason: 'earlier', dedupeKey: `test-today-${h}`, status: 'opened' as const,
      sentAt: new Date(`2026-09-12T${String(h).padStart(2, '0')}:00:00+09:00`),
    })))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '한 번 더', urgency: 0.9 } }).where(eq(roleplaySessions.id, id))
    expect(await evaluateSession(id, DAY)).toEqual({ outcome: 'suppressed', reason: 'daily_cap' })

    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: '문자에 답장', urgency: 0.9, answers: 'user_message', notBefore: new Date(DAY.getTime() - 60_000).toISOString() } }).where(eq(roleplaySessions.id, id))
    const r = await evaluateSession(id, DAY)
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })
    const answered = (await contacts(id)).find((c) => c.reason === '문자에 답장')
    expect((answered!.payload as { answers?: string }).answers).toBe('user_message')
  })

  it('after meeting, an early relationship still gets "did you get home ok?" — the rule and profile decide, not the motivation formula', async () => {
    const id = await session('taeyun', { idleMinutes: 60, turnCount: 4, relationship: { trust: 35, emotionalDistance: 60 } })
    await db.insert(messages).values({ sessionId: id, role: 'user', kind: 'text', content: '오늘 즐거웠어요', turnIndex: 4 })
    const r = await evaluateSession(id, DAY)
    expect(r, JSON.stringify(r)).toMatchObject({ outcome: 'sent' })
    expect((await contacts(id))[0]!.reason).toMatch(/만나고 헤어진 뒤/)
  })

  it('jealous follow-up fires at most once a day', async () => {
    const id = await session('thomas', { idleMinutes: 60, relationship: { ...ESTABLISHED, jealousy: 80 } })
    expect(await evaluateSession(id, DAY)).toMatchObject({ outcome: 'scheduled', ruleId: 'jealous_follow_up' })
    const [s] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect((s!.characterState as { firedRules: string[] }).firedRules).toContain('jealous_follow_up:2026-09-12')
    await db.update(roleplaySessions).set({ pendingRealityIntent: null }).where(eq(roleplaySessions.id, id))
    expect((await evaluateSession(id, new Date(DAY.getTime() + 2 * 3_600_000))).outcome).not.toBe('scheduled')
  })

  it('the push for a new contact goes out right away, not on the next cron', async () => {
    const id = await session('thomas', { activeEvent: true, relationship: ESTABLISHED })
    const [owner] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    await db.insert(pushSubscriptions).values({ userId: owner!.userId, endpoint: `https://example.test/${randomBytes(6).toString('hex')}`, p256dh: 'test', auth: 'test' })
    const send = vi.fn<providers.PushProvider['send']>().mockResolvedValue({ ok: true })
    vi.spyOn(providers, 'resolvePush').mockReturnValue({ info: { mode: 'mock', name: 'test', notice: null }, send })
    expect((await evaluateSession(id, DAY)).outcome).toBe('sent')   // 판단 시각은 과거(DAY) — 알림 작업은 지금 생긴다
    const [contact] = await contacts(id)
    const jobs = await db.select().from(realityPushJobs).where(eq(realityPushJobs.contactId, contact!.id))
    expect(jobs.map((j) => j.status)).toEqual(['sent'])
    expect(send).toHaveBeenCalledTimes(1)
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

  it('one failing maintenance step does not stop push delivery', async () => {
    vi.spyOn(callService, 'expireCalls').mockRejectedValue(new Error('boom'))
    const push = vi.spyOn(pushOutbox, 'deliverRealityPush').mockResolvedValue(0)
    const run = await runRealityMaintenance(DAY)
    expect(run.failedSteps).toEqual(['calls'])
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('a session that keeps failing backs off instead of retrying every cron', async () => {
    const id = await idleSession(POLICY.reality.idleMinutesBeforeContact + 30, true)
    vi.spyOn(providers, 'generateRealityContent').mockRejectedValue(new Error('bad format'))
    expect((await runRealityScheduler(DAY)).errors).toBe(1)
    const [s] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id))
    expect(s!.realityCheckedAt?.getTime()).toBe(DAY.getTime() + 90 * 60_000)   // 의도 없이 실패 → 한 시간 반 뒤
  })

  it('a failing saved intent waits longer each time and is dropped on the third — a reply keeps trying', async () => {
    const plain = await idleSession(30)
    const reply = await idleSession(30)
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: 'x', urgency: 0.9 } }).where(eq(roleplaySessions.id, plain))
    await db.update(roleplaySessions).set({ pendingRealityIntent: { channel: 'message', reason: 'y', urgency: 0.9, answers: 'user_message' } }).where(eq(roleplaySessions.id, reply))
    const pendingOf = async (id: string) => (await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.pendingRealityIntent
    const after = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000).toISOString()

    await backOffFailing(plain, DAY)
    expect(await pendingOf(plain)).toMatchObject({ failures: 1, notBefore: after(30) })
    await backOffFailing(plain, DAY)
    expect(await pendingOf(plain)).toMatchObject({ failures: 2, notBefore: after(60) })
    await backOffFailing(plain, DAY)
    expect(await pendingOf(plain)).toBeNull()

    for (let i = 0; i < 3; i++) await backOffFailing(reply, DAY)
    expect(await pendingOf(reply)).toMatchObject({ failures: 3, notBefore: after(120), answers: 'user_message' })
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

describeDb('messenger reply when generation fails', () => {
  const made: string[] = []
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

  it('keeps the user\'s text and answers a few minutes later instead of failing the send', async () => {
    const [u] = await db.insert(users).values({ email: `mf-${randomBytes(5).toString('hex')}@miro.dev` }).returning()
    made.push(u!.id)
    await db.insert(userSettings).values({ userId: u!.id, timeZone: 'Asia/Seoul' })
    const c = await cloneAsReality('taeyun', { ownerId: u!.id })   // 하루 종일 비어 있는 리듬
    const { sessionId } = await createRoleplaySession(u!.id, c.id)
    vi.spyOn(engine, 'runTurn').mockRejectedValue(new Error('ai unavailable after 3 attempts: provider_overloaded'))

    const r = await runConversationTurn({ userId: u!.id, sessionId, input: '오늘 뭐 해?', mode: 'messenger' })
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, blocks: [] })
    const mine = await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'messenger')))
    expect(mine.map((m) => m.content)).toEqual(['오늘 뭐 해?'])
    const pending = (await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)))[0]!.pendingRealityIntent!
    expect(pending).toMatchObject({ channel: 'message', answers: 'user_message' })
    // 장면 채팅은 예전대로 실패를 알린다
    expect(await runConversationTurn({ userId: u!.id, sessionId, input: '안녕' })).toEqual({ ok: false, reason: 'generation' })

    vi.restoreAllMocks()
    const sent = await evaluateSession(sessionId, new Date(new Date(pending.notBefore!).getTime() + 60_000))
    expect(sent, JSON.stringify(sent)).toMatchObject({ outcome: 'sent', channel: 'message' })
  })
})
