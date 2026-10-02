import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { POLICY, characterAgencyMode, feature } from '@miro/config'
import { db, characterLifeEvents, characterRevisions, characterRuntimeStates, characters, messages, relationships, roleplaySessions, userSettings, worldStates } from '@miro/db'
import { acceptLifeEvents, describeRelationship, lifeLines, lifeWindow, localClock, localIso, type LifeEvent } from '@miro/domain'
import { liveCharacterDay } from '@miro/engine'
import { createAI } from '@miro/providers'
import { observe } from '@/lib/observe'
import { routineFor } from '@/lib/reality/routine'
import { installAIUsageSink } from '@/lib/usage/ai-usage'

const toEvent = (r: typeof characterLifeEvents.$inferSelect): LifeEvent => ({ id: r.id, occurredAt: r.occurredAt.toISOString(), block: r.block,
  kind: r.kind, summary: r.summary, valence: r.valence, intensity: r.intensity, shareable: r.shareable })

/**
 * 이 세션의 최근 자기 삶(지금까지 일어난 것만) — 대화 맥락과 판단 근거가 같은 것을 본다.
 * ids 는 목표·믿음이 가리키는 옛 일: 범위를 벗어나도 근거가 사라지지 않게 함께 읽는다.
 */
export async function recentLife(sessionId: string, now = new Date(), ids: string[] = []): Promise<LifeEvent[]> {
  const since = new Date(now.getTime() - POLICY.life.contextHours * 3_600_000)
  const linked = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id))
  const rows = await db.select().from(characterLifeEvents)
    .where(and(eq(characterLifeEvents.sessionId, sessionId), lte(characterLifeEvents.occurredAt, now),
      linked.length ? or(gte(characterLifeEvents.occurredAt, since), inArray(characterLifeEvents.id, linked)) : gte(characterLifeEvents.occurredAt, since)))
    .orderBy(desc(characterLifeEvents.occurredAt)).limit(POLICY.life.contextEvents + linked.length)
  return rows.reverse().map(toEvent)
}

export type LifeOutcome = { outcome: 'off' | 'not_due' | 'asleep' | 'quiet' | 'lived' | 'conflict'; events?: LifeEvent[] }

/**
 * 대화가 없던 시간을 산다(2026-10-02 '자기 삶'). 스케줄러가 먼저 연락을 판단하기 직전에 부른다 — 그 사이 겪은 일이 그 판단의 근거가 된다.
 * 자율성 live 세션만(판이 정리된 캐릭터). 되짚을 때가 아니거나 잔 시간뿐이면 모델을 부르지 않는다.
 * 모델은 일을 제안만 하고, 서버가 거른 것만 남긴다. life_until 을 같은 값에서만 옮겨(CAS) 두 워커가 같은 시간을 두 번 살지 않는다.
 */
export async function advanceCharacterLife(sessionId: string, now = new Date()): Promise<LifeOutcome> {
  if (!feature('characterLife')) return { outcome: 'off' }
  const [row] = await db.select({ session: roleplaySessions, runtime: characterRuntimeStates, revision: characterRevisions, characterId: characters.id, timeZone: userSettings.timeZone })
    .from(roleplaySessions)
    .innerJoin(characterRuntimeStates, eq(characterRuntimeStates.sessionId, roleplaySessions.id))
    .innerJoin(characterRevisions, eq(characterRevisions.id, characterRuntimeStates.revisionId))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(userSettings, eq(userSettings.userId, roleplaySessions.userId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt),
      isNull(roleplaySessions.restrictedAt), isNull(characters.deletedAt), eq(characters.experienceType, 'reality'))).limit(1)
  if (!row || row.runtime.mode !== 'live' || row.revision.status !== 'ready' || !row.revision.compiled
    || characterAgencyMode(sessionId, row.session.policyVersion) !== 'live') return { outcome: 'off' }
  const timeZone = row.timeZone ?? POLICY.reality.defaultTimeZone
  const routine = await routineFor(row.characterId, { wait: true })
  const window = lifeWindow({ lifeUntil: row.runtime.lifeUntil, lastInteractionAt: row.session.lastInteractionAt, now, routine, timeZone })
  if (!window) return { outcome: 'not_due' }
  const since = row.runtime.lifeUntil
  const advance = (tx: Pick<typeof db, 'update'>) => tx.update(characterRuntimeStates).set({ lifeUntil: window.to })
    .where(and(eq(characterRuntimeStates.sessionId, sessionId), since ? eq(characterRuntimeStates.lifeUntil, since) : isNull(characterRuntimeStates.lifeUntil)))
    .returning({ sessionId: characterRuntimeStates.sessionId })
  if (!window.awake.length) return (await advance(db)).length ? { outcome: 'asleep' } : { outcome: 'conflict' }

  const [recent, [relationship], [world], last] = await Promise.all([
    recentLife(sessionId, now),
    db.select().from(relationships).where(eq(relationships.sessionId, sessionId)).limit(1),
    db.select({ location: worldStates.currentLocation }).from(worldStates).where(eq(worldStates.sessionId, sessionId)).limit(1),
    db.select({ role: messages.role, content: messages.content, createdAt: messages.createdAt }).from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character'])))
      .orderBy(desc(messages.createdAt)).limit(4),
  ])
  const profile = row.revision.profile
  const { identity, personality, worldRole } = profile.character
  installAIUsageSink()
  const llm = createAI({ mock: () => ({ events: [] }), context: { userId: row.session.userId, sessionId, workload: 'background', origin: 'life:agency:reality:miro:background', adult: row.session.adultSince !== null } })
  const proposed = await liveCharacterDay(llm, {
    character: { identity, personality, worldRole },
    rules: row.revision.compiled.rules.map(({ id, domain, statement }) => ({ id, domain, statement })),
    world: { setting: profile.worldSetting, genre: profile.worldGenre ?? null, location: world?.location ?? '' },
    routine: { note: routine.note, blocks: routine.blocks },
    window: { from: localIso(window.from, timeZone), to: localIso(window.to, timeZone), awake: window.awake },
    recentLife: lifeLines(recent, timeZone),
    goals: row.runtime.state.goals.filter(goal => goal.status === 'active').map(goal => ({ description: goal.description, ...(goal.dueAt ? { dueAt: goal.dueAt } : {}) })),
    relationship: relationship ? `${relationship.stage} — ${describeRelationship(relationship as never)}` : '',
    lastConversation: last.reverse().map(m => ({ at: localClock(m.createdAt, timeZone).label, who: m.role === 'user' ? 'user' as const : 'character' as const, text: m.content.slice(0, 200) })),
    affect: row.runtime.state.affect,
  })
  const drafts = acceptLifeEvents(proposed, window, recent.map(e => e.summary), routine, timeZone)
  const stored = await db.transaction(async tx => {
    if ((await advance(tx)).length !== 1) return null // 다른 워커가 이 시간을 먼저 살았다.
    return drafts.length ? (await tx.insert(characterLifeEvents).values(drafts.map(d => ({ sessionId, ...d, occurredAt: new Date(d.occurredAt) }))).returning()).map(toEvent) : []
  })
  if (!stored) return { outcome: 'conflict' }
  observe('life.advanced', { sessionId, proposed: proposed.length, stored: stored.length, shareable: stored.filter(e => e.shareable).length })
  return { outcome: stored.length ? 'lived' : 'quiet', events: stored }
}
