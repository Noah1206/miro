import { and, eq, gt, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import {
  db, characterRuntimeStates, conversationRequests, events, memories, memoryJobs, messages, npcs, relationships, reports,
  roleplaySessions, turnUndos, userMoments, worldStates,
} from '@miro/db'

export type UndoResult =
  | { ok: true; messageIds: string[]; input: string; command: string | null; commandId: string | null }
  | { ok: false; reason: 'not_found' | 'stale' | 'reported' | 'busy' }

/**
 * 리롤(10/27) — 마지막 장면 턴을 그 턴 전으로 되돌린다. 같은 말을 다시 보내는 건 부른 쪽(턴 파이프라인)이 한다.
 * commitTurn 이 남긴 되돌리기 기록(turn_undos)으로 세계·관계·대화방·자율성 상태를 이전 값으로 덮고, 이 턴이 만든 메시지·사건·NPC·일정·기억을 지운다.
 * 그 답이 아직 마지막일 때만 — 턴 수와 버전이 그 턴 직후 그대로이고, 뒤에 온 메시지·진행 중인 요청이 없고, 숨겨지거나 신고된 답이 아닐 때.
 * 이미 만든 답이라 차감된 사용량은 돌려주지 않는다.
 * ponytail: 응답 뒤 기억 작업이 이 턴 때문에 바꾼 옛 기억(교체·요약 덮어쓰기)은 되살리지 않는다 — 다음 요약 작업이 다시 만든다.
 */
export async function undoLastTurn(userId: string, sessionId: string, replyId: string): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    // 턴 시작(beginRequest)과 같은 잠금 — 되돌리는 사이 새 턴이 끼어들지 않는다.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conversation:${sessionId}`}))`)
    const [session] = await tx.select().from(roleplaySessions)
      .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt))).for('update')
    if (!session || session.status !== 'active' || session.restrictedAt) return { ok: false, reason: 'not_found' }
    const [undo] = await tx.select().from(turnUndos).where(eq(turnUndos.sessionId, sessionId)).for('update')
    if (!undo || undo.turnIndex !== session.turnCount || !undo.messageIds.includes(replyId)) return { ok: false, reason: 'stale' }
    const b = undo.before
    const ids = undo.messageIds

    const [world] = await tx.select({ version: worldStates.version }).from(worldStates).where(eq(worldStates.sessionId, sessionId)).for('update')
    const [relationship] = await tx.select({ version: relationships.version }).from(relationships).where(eq(relationships.sessionId, sessionId)).for('update')
    const [runtime] = b.runtime
      ? await tx.select({ version: characterRuntimeStates.version }).from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).for('update')
      : []
    if (world?.version !== b.versions.world || relationship?.version !== b.versions.relationship || (b.runtime && runtime?.version !== b.versions.runtime)) {
      return { ok: false, reason: 'stale' }
    }
    const turn = await tx.select({ createdAt: messages.createdAt, hiddenAt: messages.hiddenAt }).from(messages)
      .where(and(eq(messages.sessionId, sessionId), inArray(messages.id, ids)))
    if (turn.length !== ids.length) return { ok: false, reason: 'stale' }
    const since = new Date(Math.min(...turn.map(m => m.createdAt.getTime())))
    const [later] = await tx.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.sessionId, sessionId), gt(messages.createdAt, since), notInArray(messages.id, ids))).limit(1)
    if (later) return { ok: false, reason: 'stale' }
    // 숨김·신고된 답은 검토 근거라 지우지 않는다.
    const [reported] = await tx.select({ id: reports.id }).from(reports).where(inArray(reports.targetId, ids)).limit(1)
    if (reported || turn.some(m => m.hiddenAt)) return { ok: false, reason: 'reported' }
    const [busy] = await tx.select({ id: conversationRequests.id }).from(conversationRequests)
      .where(and(eq(conversationRequests.sessionId, sessionId), eq(conversationRequests.status, 'pending'), gt(conversationRequests.leaseUntil, new Date()))).limit(1)
    if (busy) return { ok: false, reason: 'busy' }

    /* ---- 이 턴이 만든 것 ---- */
    if (b.events.created.length) await tx.delete(events).where(and(eq(events.sessionId, sessionId), inArray(events.id, b.events.created)))
    for (const e of b.events.updated) {
      await tx.update(events).set({ status: e.status, continuationState: e.continuationState, consequences: e.consequences,
        cooldownUntilTurn: e.cooldownUntilTurn, resolvedAtTurn: e.resolvedAtTurn }).where(and(eq(events.id, e.id), eq(events.sessionId, sessionId)))
    }
    if (b.npcs.length) await tx.delete(npcs).where(and(eq(npcs.sessionId, sessionId), inArray(npcs.id, b.npcs)))
    await tx.delete(userMoments).where(and(eq(userMoments.sessionId, sessionId), inArray(userMoments.sourceMessageId, ids)))
    if (b.moments.length) await tx.update(userMoments).set({ status: 'active' }).where(and(eq(userMoments.sessionId, sessionId), inArray(userMoments.id, b.moments)))
    // 기억: 이 턴이 넣은 것과 이 턴 메시지를 출처로 한 것(뒤이은 기억 작업 포함)을 지우고, 이 턴이 지운 것을 되살린다.
    await tx.delete(memories).where(and(eq(memories.sessionId, sessionId),
      or(inArray(memories.sourceMessageId, ids), b.memories.inserted.length ? inArray(memories.id, b.memories.inserted) : undefined)))
    if (b.memories.deleted.length) await tx.insert(memories).values(b.memories.deleted.map(m => ({ ...m, createdAt: new Date(m.createdAt) }))).onConflictDoNothing()
    await tx.update(memoryJobs).set({ status: 'cancelled', leaseToken: null, leaseUntil: null })
      .where(and(eq(memoryJobs.sessionId, sessionId), inArray(memoryJobs.messageId, ids), inArray(memoryJobs.status, ['pending', 'running'])))
    // 음성 합성 작업·문자 수신함은 FK cascade 로 함께 지워진다.
    await tx.delete(messages).where(and(eq(messages.sessionId, sessionId), inArray(messages.id, ids)))

    /* ---- 이전 값으로 — 버전은 올린다(이 턴을 읽어 둔 다른 쓰기가 덮지 못하게) ---- */
    const now = new Date()
    await tx.update(worldStates).set({ ...b.world, version: sql`${worldStates.version} + 1`, updatedAt: now }).where(eq(worldStates.sessionId, sessionId))
    await tx.update(relationships).set({ ...b.relationship, version: sql`${relationships.version} + 1`, updatedAt: now }).where(eq(relationships.sessionId, sessionId))
    if (b.runtime) {
      await tx.update(characterRuntimeStates).set({ state: b.runtime.state, nextWakeAt: b.runtime.nextWakeAt ? new Date(b.runtime.nextWakeAt) : null,
        version: sql`${characterRuntimeStates.version} + 1`, updatedAt: now }).where(eq(characterRuntimeStates.sessionId, sessionId))
    }
    await tx.update(roleplaySessions).set({ turnCount: b.session.turnCount, lastInteractionAt: new Date(b.session.lastInteractionAt),
      pendingRealityIntent: b.session.pendingRealityIntent as never, characterState: b.session.characterState }).where(eq(roleplaySessions.id, sessionId))
    await tx.delete(turnUndos).where(eq(turnUndos.sessionId, sessionId))
    return { ok: true, messageIds: ids, input: undo.input, command: b.command.name, commandId: b.command.sourceId }
  })
}
