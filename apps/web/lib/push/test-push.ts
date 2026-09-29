import { and, eq, isNull } from 'drizzle-orm'
import { db, pushSubscriptions } from '@miro/db'
import { productionRuntime } from '@miro/config'
import { resolvePush } from '@miro/providers'
import { observe } from '@/lib/observe'

/**
 * 사용자 자신의 모든 기기에 확인용 알림 하나. 캐릭터 연락과 같은 발송 경로(resolvePush)를 타므로
 * 이게 오면 캐릭터의 연락도 온다 — 출시 게이트 "실기기 푸시 확인" 을 사용자 스스로 할 수 있게 한다.
 * 만료된 구독(410/404)은 캐릭터 연락 때와 똑같이 failedAt 을 찍어 다음 발송에서 뺀다.
 */
export async function sendTestPush(userId: string, now = new Date()): Promise<{ devices: number; sent: number; gone: number }> {
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
  const provider = resolvePush()
  if (productionRuntime() && provider.info.mode !== 'live') throw new Error('PUSH_NOT_READY')
  let sent = 0, gone = 0
  for (const sub of subs) {
    const r = await provider.send(sub, { title: 'MIRO', body: '알림이 잘 와요. 캐릭터의 연락도 이렇게 도착해요.', url: '/my/permissions', tag: 'push-test' })
    if (r.ok) sent++
    else if (r.gone) { gone++; await db.update(pushSubscriptions).set({ failedAt: now }).where(eq(pushSubscriptions.id, sub.id)) }
  }
  observe('push.test', { userId, devices: subs.length, sent, gone })
  return { devices: subs.length, sent, gone }
}
