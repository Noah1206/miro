import { and, eq, isNull } from 'drizzle-orm'
import { db, pushSubscriptions } from '@miro/db'
import { resolvePush, type PushPayload } from '@miro/providers'

/** 그 사용자의 모든 기기에 알림 하나. 만료된 구독(410/404)은 failedAt 을 찍어 다음 발송에서 뺀다. */
export async function pushToUser(userId: string, payload: PushPayload, now = new Date()): Promise<{ devices: number; sent: number; gone: number }> {
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
  const provider = resolvePush()
  let sent = 0, gone = 0
  for (const sub of subs) {
    const r = await provider.send(sub, payload)
    if (r.ok) sent++
    else if (r.gone) { gone++; await db.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, sub.id)) }
  }
  return { devices: subs.length, sent, gone }
}
