import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import {
  db, users, userSettings, characters, worlds, contactProfiles, roleplaySessions, worldStates, relationships,
  realityContacts, realityPushJobs, pushSubscriptions,
} from '@miro/db'
import { evaluateSession } from '../evaluate'
import { runRealityScheduler } from '../scheduler'
import { deliverRealityPush } from '../push-outbox'
import { startOutgoingCall } from '@/lib/call/service'
import { discoverGrid, homeRows } from '@/lib/home'
import { getCharacterByKey } from '@/lib/characters'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
/** 14:00 KST — Quiet Hours 밖, 활동 시간 안. */
const DAY = new Date('2026-09-12T14:00:00+09:00')

/**
 * 홈(chat)과 미로(reality)의 경계. 유형은 캐릭터 한 곳에 있고, 서버의 모든 Reality 경로가
 * 그것을 본다 — 스케줄러 후보, 최종 판단, 발송 큐, 사용자가 직접 거는 통화, 그리고 목록.
 */
describeDb('experience split: chat characters never reach Reality paths', () => {
  const made: string[] = []
  const chars: string[] = []
  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const id of chars) await db.delete(characters).where(eq(characters.id, id))
  })

  async function user() {
    const [u] = await db.insert(users).values({ email: `xs-${randomBytes(5).toString('hex')}@miro.dev`, plan: 'pro' }).returning()
    made.push(u!.id)
    await db.insert(userSettings).values({ userId: u!.id, quietHoursEnabled: false, timeZone: 'Asia/Seoul' })
    return u!.id
  }
  /** 공개 캐릭터 하나. 연락 스위치는 켠다 — 유형만이 Reality 를 가르는지 보기 위해서다. */
  async function character(type: 'chat' | 'reality', ownerId: string) {
    const [c] = await db.insert(characters).values({
      ownerId, isOfficial: false, isPublic: true, isDraft: false, experienceType: type,
      name: `${type}-${randomBytes(3).toString('hex')}`, personality: '차분하다.', tagline: '한 줄', images: ['https://img.test/1.png'],
    }).returning({ id: characters.id })
    chars.push(c!.id)
    const [w] = await db.insert(worlds).values({ characterId: c!.id, location: '서울', genre: '드라마' }).returning({ id: worlds.id })
    await db.insert(contactProfiles).values({ characterId: c!.id, enabled: true })
    return { id: c!.id, worldId: w!.id }
  }
  /** 형성된 관계에 오래 비운 세션 — 스케줄러가 집어 들 조건. */
  async function session(userId: string, c: { id: string; worldId: string }, pending = false) {
    const [s] = await db.insert(roleplaySessions).values({
      userId, characterId: c.id, worldId: c.worldId,
      lastInteractionAt: new Date(DAY.getTime() - 30 * 3600_000),
      ...(pending ? { pendingRealityIntent: { channel: 'message', reason: '보고 싶다', urgency: 0.8 } } : {}),
    }).returning({ id: roleplaySessions.id })
    await db.insert(worldStates).values({ sessionId: s!.id, currentLocation: '서울', currentTime: '저녁' })
    await db.insert(relationships).values({ sessionId: s!.id, trust: 50, attachment: 50, emotionalDistance: 40 })
    return s!.id
  }
  const checkedAt = async (id: string) =>
    (await db.select({ at: roleplaySessions.realityCheckedAt }).from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.at
  const pendingOf = async (id: string) =>
    (await db.select({ p: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, id)))[0]!.p

  it('the scheduler claims reality sessions and leaves chat sessions untouched', async () => {
    const u = await user()
    const chat = await session(u, await character('chat', u))
    const reality = await session(u, await character('reality', u))
    await runRealityScheduler(DAY, DAY)
    expect(await checkedAt(chat)).toBeNull()
    expect(await checkedAt(reality)).not.toBeNull()
  })

  it('evaluateSession refuses a chat session and clears any intent left on it', async () => {
    // 유형이 나중에 chat 으로 바뀐 세션에 의도가 남아 있을 수 있다. 두면 스케줄러가 매 주기 다시 집는다.
    const u = await user()
    const chat = await session(u, await character('chat', u), true)
    expect(await pendingOf(chat)).not.toBeNull()
    const r = await evaluateSession(chat, DAY)
    expect(r).toEqual({ outcome: 'skipped', reason: 'not_reality' })
    expect(await pendingOf(chat)).toBeNull()
  })

  it('a queued push is cancelled at delivery time if the character is not reality', async () => {
    // 큐에 든 뒤 유형이 바뀐 경우. 발송 시점에 자격을 다시 보고 보내지 않는다.
    const u = await user()
    const c = await character('reality', u)
    const s = await session(u, c)
    const [sub] = await db.insert(pushSubscriptions).values({ userId: u, endpoint: `https://push.test/${u}`, p256dh: 'k', auth: 'a' }).returning({ id: pushSubscriptions.id })
    const [contact] = await db.insert(realityContacts).values({
      sessionId: s, channel: 'message', dedupeKey: `x:${s}`, status: 'sent', payload: { text: '잘 지내?' }, sentAt: DAY,
    }).returning({ id: realityContacts.id })
    await db.insert(realityPushJobs).values({ contactId: contact!.id, subscriptionId: sub!.id, nextAttemptAt: DAY })
    await db.update(characters).set({ experienceType: 'chat' }).where(eq(characters.id, c.id))

    await deliverRealityPush(DAY)
    const [job] = await db.select({ status: realityPushJobs.status }).from(realityPushJobs).where(eq(realityPushJobs.contactId, contact!.id))
    expect(job!.status).toBe('cancelled')
  })

  it('a user cannot start a call with a chat character, and nothing is reserved', async () => {
    const u = await user()
    const chat = await session(u, await character('chat', u))
    await expect(startOutgoingCall(u, chat, 'voice')).rejects.toThrow('CALL_NOT_AVAILABLE')
    // 같은 사용자가 미로 캐릭터와는 건다 — 막힌 것이 유형이지 사용자가 아니다.
    const reality = await session(u, await character('reality', u))
    await expect(startOutgoingCall(u, reality, 'voice')).resolves.toMatch(/^[0-9a-f-]{36}$/)
  })

  it('home and search list chat only; 미로 lists reality only; the detail page shows both', async () => {
    const u = await user()
    const viewer = await user()
    const chat = await character('chat', u)
    const reality = await character('reality', u)
    await session(viewer, chat); await session(viewer, reality)

    const homeIds = (await homeRows(viewer)).flatMap(r => r.items.map(i => i.id))
    expect(homeIds).toContain(chat.id); expect(homeIds).not.toContain(reality.id)

    const search = (await discoverGrid(viewer, 'chat')).map(c => c.id)
    expect(search).toContain(chat.id); expect(search).not.toContain(reality.id)

    const miro = (await discoverGrid(viewer, 'reality')).map(c => c.id)
    expect(miro).toContain(reality.id); expect(miro).not.toContain(chat.id)

    // 상세는 두 유형 다 열린다. 미로 → 상세 → 대화 진입이 홈과 같은 길이기 때문이다.
    expect((await getCharacterByKey(reality.id, viewer))?.experienceType).toBe('reality')
    expect((await getCharacterByKey(chat.id, viewer))?.experienceType).toBe('chat')
  })
})
