import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  db, accountDeletions, authSessions, characters, events, memories, pushSubscriptions,
  roleplaySessions, subscriptions, users, aiFeedback, aiEvaluationSamples, userPersonas,
} from '@miro/db'
import { postOperatorNote } from '@/lib/ops/alerts'
import { observe } from '@/lib/observe'

export type DeletionImpact = {
  sessions: number
  createdCharacters: number
  memories: number
  events: number
  subscription: 'none' | 'active' | 'cancelled'
}

/** 확정 전에 보여주는 영향 정보 (명세서 12.1). */
export async function deletionImpact(userId: string): Promise<DeletionImpact> {
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt)))
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(characters)
    .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(memories)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, memories.sessionId))
    .where(eq(roleplaySessions.userId, userId))
  const [e] = await db.select({ n: sql<number>`count(*)::int` }).from(events)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, events.sessionId))
    .where(eq(roleplaySessions.userId, userId))
  const [sub] = await db.select({ status: subscriptions.status }).from(subscriptions)
    .where(eq(subscriptions.userId, userId)).limit(1)
  return {
    sessions: s?.n ?? 0, createdCharacters: c?.n ?? 0, memories: m?.n ?? 0, events: e?.n ?? 0,
    subscription: !sub || sub.status === 'expired' ? 'none' : sub.status,
  }
}

/**
 * 계정 삭제 확정. 한 트랜잭션으로:
 * 로그인 차단(users.deleted_at) · 세션 토큰 폐기 · Push 구독 제거 · 역할극/캐릭터 soft delete · 구독 해지.
 * 운영 검토용 보존이 필요한 데이터(신고 스냅샷)는 남는다 — 세부 보존 기간은 TBD.
 */
export async function deleteAccount(userId: string): Promise<'completed' | 'already'> {
  const [u] = await db.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u || u.deletedAt) return 'already'
  const impact = await deletionImpact(userId)
  const now = new Date()
  await db.transaction(async (tx) => {
    const [req] = await tx.insert(accountDeletions).values({ userId, impact }).returning({ id: accountDeletions.id })
    await tx.update(users).set({ deletedAt: now, allowTraining: false, allowEvaluation: false, birthDate: null, tastes: [] }).where(eq(users.id, userId))
    await tx.delete(aiFeedback).where(eq(aiFeedback.userId, userId))
    await tx.delete(aiEvaluationSamples).where(eq(aiEvaluationSamples.userId, userId))
    await tx.delete(authSessions).where(eq(authSessions.userId, userId))
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    // 페르소나는 사용자가 쓴 자기 소개다 — 계정이 지워지면 남기지 않는다(users 는 표시만 하는 삭제라 cascade 가 돌지 않는다).
    await tx.delete(userPersonas).where(eq(userPersonas.userId, userId))
    await tx.update(roleplaySessions).set({ deletedAt: now, status: 'archived' })
      .where(and(eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt)))
    await tx.update(characters).set({ deletedAt: now })
      .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
    await tx.update(subscriptions).set({ status: 'cancelled', renewalStatus: 'cancelled', updatedAt: now })
      .where(eq(subscriptions.userId, userId))
    await tx.update(accountDeletions).set({ status: 'completed', completedAt: now })
      .where(eq(accountDeletions.id, req!.id))
  })
  // 삭제는 DB 안의 표시라, 그보다 앞선 백업에서 복구하면 계정이 되살아난다. 운영자 채널(DB 밖)에 남겨
  // 복구 뒤 다시 지울 목록으로 쓴다(miro-backups README). 이메일은 보내지 않는다. 실패해도 삭제는 끝난 것이다.
  const noted = await postOperatorNote(`계정 삭제 기록 · ${userId} · ${now.toISOString()}\n백업에서 복구하면 이 계정을 다시 삭제해야 해요.`).catch(() => false)
  if (!noted) observe('account.deletion_note_unsent', { userId })
  return 'completed'
}
