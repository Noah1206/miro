import { and, eq } from 'drizzle-orm'
import { db, messages, reports, roleplaySessions, scenes } from '@miro/db'

export type ReportTarget = { type: 'message' | 'photo' | 'live_scene'; id: string }
export type ReportReason = 'safety' | 'rights' | 'harassment' | 'inappropriate' | 'other'

const UUID = /^[0-9a-f-]{36}$/i

/**
 * 신고 대상을 신고자가 접근 가능한 범위에서 찾고, 검토에 필요한 만큼만 스냅샷을 만든다.
 * 다른 사용자의 역할극 콘텐츠는 찾을 수 없다.
 */
export async function resolveTarget(userId: string, target: ReportTarget) {
  if (!UUID.test(target.id)) return null
  if (target.type === 'live_scene') {
    const [row] = await db.select({ scene: scenes, session: roleplaySessions })
      .from(scenes).innerJoin(roleplaySessions, eq(roleplaySessions.id, scenes.sessionId))
      .where(and(eq(scenes.id, target.id), eq(roleplaySessions.userId, userId))).limit(1)
    if (!row) return null
    return {
      sessionId: row.session.id, characterId: row.session.characterId,
      snapshot: { location: row.scene.location, time: row.scene.time, mood: row.scene.mood, backgroundAssetId: row.scene.backgroundAssetId },
    }
  }
  const [row] = await db.select({ message: messages, session: roleplaySessions })
    .from(messages).innerJoin(roleplaySessions, eq(roleplaySessions.id, messages.sessionId))
    .where(and(eq(messages.id, target.id), eq(roleplaySessions.userId, userId))).limit(1)
  if (!row) return null
  return {
    sessionId: row.session.id, characterId: row.session.characterId,
    snapshot: { role: row.message.role, kind: row.message.kind, content: row.message.content, turnIndex: row.message.turnIndex },
  }
}

export async function submitReport(userId: string, target: ReportTarget, reason: ReportReason, detail: string):
  Promise<{ ok: true; id: string } | { ok: false; reason: 'not_found' | 'duplicate' }> {
  const resolved = await resolveTarget(userId, target)
  if (!resolved) return { ok: false, reason: 'not_found' }
  try {
    const [r] = await db.insert(reports).values({
      reporterId: userId, targetType: target.type, targetId: target.id, reason, detail,
      characterId: resolved.characterId, sessionId: resolved.sessionId, targetSnapshot: resolved.snapshot,
    }).returning({ id: reports.id })
    return { ok: true, id: r!.id }
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, reason: 'duplicate' }
    throw e
  }
}
