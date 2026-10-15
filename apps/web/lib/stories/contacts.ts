import { and, eq, gte, inArray, isNull, lte, or, sql, desc } from 'drizzle-orm'
import { db, pushSubscriptions, stories, storyContacts, storyMessages, storyRuns, userSettings } from '@miro/db'
import { contactGate, dueAt, localParts, rulesToSchedule, shouldCancel, type StoryDefinition, type StoryState } from '@miro/domain'
import { feature } from '@miro/config'
import { resolvePush } from '@miro/providers'
import { definitionOf } from './repo'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * 턴 저장 트랜잭션 안에서: 상태가 바뀌어 맞지 않게 된 예약은 취소하고, 새로 이유가 생긴 규칙만 예약한다.
 * (run, key) 고유 — 같은 연락은 회차에 한 번. 취소된 규칙도 다시 살리지 않는다.
 */
export async function syncContacts(tx: Tx, def: StoryDefinition, runId: string, state: StoryState, turnId: string | null, now: Date) {
  const rows = await tx.select().from(storyContacts).where(eq(storyContacts.runId, runId))
  for (const row of rows.filter(r => r.status === 'pending')) {
    const rule = def.contacts.find(r => r.id === row.ruleId)
    const why = rule ? shouldCancel(def, state, rule) : 'rule_removed'
    if (why) await tx.update(storyContacts).set({ status: 'cancelled', reason: why }).where(eq(storyContacts.id, row.id))
  }
  const keys = new Set(rows.map(r => r.key))
  const fresh = rulesToSchedule(def, state, keys)
  if (fresh.length) await tx.insert(storyContacts).values(fresh.map(r => ({ runId, ruleId: r.id, key: r.key, speaker: r.speaker, dueAt: dueAt(r, now), scheduledScene: state.scene, causeTurnId: turnId })))
    .onConflictDoNothing()
}

export type DeliveryResult = { id: string; outcome: 'sent' | 'cancelled' | 'held'; reason?: string }

/**
 * 크론: 때가 된 연락석을 실제로 보낸다. 예약 문안을 믿지 않고 발송 순간 회차를 잠그고 게이트를 전부 다시 본다.
 * 보류(조용한 시간·장면 중·한도)는 그대로 두고 15분 뒤 다시, 취소 사유면 취소. 앱 안 연락석은 항상 쌓이고,
 * 외부 푸시는 storyPush 플래그가 켜졌을 때만 이름과 '새 연락' 안내로만(본문·비밀 없음) 보낸다.
 */
export async function deliverDueStoryContacts(now: Date, limit = 20): Promise<DeliveryResult[]> {
  const claimed = await db.transaction(async tx => {
    const due = await tx.select({ id: storyContacts.id }).from(storyContacts)
      .where(and(eq(storyContacts.status, 'pending'), lte(storyContacts.dueAt, now), or(isNull(storyContacts.leaseUntil), lte(storyContacts.leaseUntil, now))))
      .orderBy(storyContacts.dueAt).limit(limit).for('update', { skipLocked: true })
    if (due.length) await tx.update(storyContacts).set({ leaseUntil: new Date(now.getTime() + 120_000) }).where(inArray(storyContacts.id, due.map(d => d.id)))
    return due.map(d => d.id)
  })
  const out: DeliveryResult[] = []
  for (const id of claimed) out.push(await deliverOne(id, now))
  return out
}

export async function deliverOne(contactId: string, now: Date): Promise<DeliveryResult> {
  let push: { userId: string; title: string; runId: string } | null = null
  const result = await db.transaction(async tx => {
    const [c] = await tx.select().from(storyContacts).where(eq(storyContacts.id, contactId)).for('update')
    if (!c || c.status !== 'pending') return { id: contactId, outcome: 'cancelled' as const, reason: 'not_pending' }
    const [run] = await tx.select().from(storyRuns).where(eq(storyRuns.id, c.runId)).for('update')
    if (!run || run.status === 'archived') {
      await tx.update(storyContacts).set({ status: 'cancelled', reason: 'run_archived', leaseUntil: null }).where(eq(storyContacts.id, c.id))
      return { id: c.id, outcome: 'cancelled' as const, reason: 'run_archived' }
    }
    const def = await definitionOf(run.storyId)
    const rule = def.contacts.find(r => r.id === c.ruleId)
    const state = run.state as StoryState
    if (!rule) { await tx.update(storyContacts).set({ status: 'cancelled', reason: 'rule_removed', leaseUntil: null }).where(eq(storyContacts.id, c.id)); return { id: c.id, outcome: 'cancelled' as const, reason: 'rule_removed' } }
    const [settings] = await tx.select().from(userSettings).where(eq(userSettings.userId, run.userId))
    const tz = settings?.timeZone ?? null
    const today = tz ? localParts(now, tz).day : null
    const sent = await tx.select({ speaker: storyContacts.speaker, sentAt: storyContacts.sentAt, key: storyContacts.key }).from(storyContacts)
      .where(and(eq(storyContacts.runId, run.id), eq(storyContacts.status, 'sent'), gte(storyContacts.sentAt, new Date(now.getTime() - 36 * 3_600_000))))
    const [unread] = await tx.select({ n: sql<number>`count(*)::int` }).from(storyMessages)
      .where(and(eq(storyMessages.runId, run.id), eq(storyMessages.channel, 'dm'), eq(storyMessages.thread, c.speaker), eq(storyMessages.role, 'character'), isNull(storyMessages.readAt)))
    const lastBySpeaker = sent.filter(s => s.speaker === c.speaker && s.sentAt).map(s => s.sentAt!.getTime()).sort((x, y) => y - x)[0]
    const gate = contactGate(def, state, rule, {
      now, timeZone: tz, globalAllowed: settings?.pushEnabled ?? true,
      userQuiet: settings?.quietHoursEnabled ? { start: settings.quietHoursStart, end: settings.quietHoursEnd } : null,
      lastSceneInputAt: run.lastSceneInputAt, sentToday: today ? sent.filter(s => s.sentAt && localParts(s.sentAt, tz!).day === today).length : 0,
      lastSentBySpeaker: lastBySpeaker ? new Date(lastBySpeaker) : null, unreadBySpeaker: unread?.n ?? 0,
      keyAlreadySent: sent.some(s => s.key === c.key), scheduledScene: c.scheduledScene,
    })
    if (!gate.ok) {
      if (gate.cancel) await tx.update(storyContacts).set({ status: 'cancelled', reason: gate.reason, leaseUntil: null }).where(eq(storyContacts.id, c.id))
      else await tx.update(storyContacts).set({ reason: gate.reason, leaseUntil: null, dueAt: new Date(now.getTime() + 15 * 60_000) }).where(eq(storyContacts.id, c.id))
      return { id: c.id, outcome: gate.cancel ? 'cancelled' as const : 'held' as const, reason: gate.reason }
    }
    const [msg] = await tx.insert(storyMessages).values({ runId: run.id, channel: 'dm', thread: c.speaker, role: 'character', speaker: c.speaker, content: rule.text, contactId: c.id, createdAt: now }).returning({ id: storyMessages.id })
    await tx.update(storyContacts).set({ status: 'sent', sentAt: now, messageId: msg!.id, reason: null, leaseUntil: null }).where(eq(storyContacts.id, c.id))
    const [st] = await tx.select({ title: stories.title }).from(stories).where(eq(stories.id, run.storyId))
    push = { userId: run.userId, title: def.characters.find(x => x.key === c.speaker)?.name ?? st?.title ?? '', runId: run.id }
    return { id: c.id, outcome: 'sent' as const }
  })
  if (result.outcome === 'sent' && push && feature('storyPush')) await sendPush(push).catch(() => {})
  return result
}

/** 잠금화면에는 인물 이름과 '새 연락' 안내만. 사건·관계 내용은 싣지 않는다. */
async function sendPush(p: { userId: string; title: string; runId: string }) {
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, p.userId), isNull(pushSubscriptions.failedAt)))
  const provider = resolvePush()
  for (const s of subs) {
    const r = await provider.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { title: p.title, body: '새 연락이 도착했어요.', url: `/stories/play/${p.runId}?tab=dm`, tag: `story:${p.runId}` })
    if (!r.ok && r.gone) await db.update(pushSubscriptions).set({ failedAt: new Date() }).where(eq(pushSubscriptions.id, s.id))
  }
}

export async function markThreadRead(runId: string, thread: string, now = new Date()) {
  await db.update(storyMessages).set({ readAt: now })
    .where(and(eq(storyMessages.runId, runId), eq(storyMessages.channel, 'dm'), eq(storyMessages.thread, thread), eq(storyMessages.role, 'character'), isNull(storyMessages.readAt)))
}

export async function pendingContacts(runId: string) {
  return db.select().from(storyContacts).where(eq(storyContacts.runId, runId)).orderBy(desc(storyContacts.createdAt))
}
