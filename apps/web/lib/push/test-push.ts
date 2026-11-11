import { productionRuntime } from '@miro/config'
import { resolvePush } from '@miro/providers'
import { observe } from '@/lib/observe'
import { pushToUser } from './to-user'

/**
 * 사용자 자신의 모든 기기에 확인용 알림 하나. 캐릭터 연락과 같은 발송 경로(resolvePush)를 타므로
 * 이게 오면 캐릭터의 연락도 온다 — 출시 게이트 "실기기 푸시 확인" 을 사용자 스스로 할 수 있게 한다.
 */
export async function sendTestPush(userId: string, now = new Date()): Promise<{ devices: number; sent: number; gone: number }> {
  if (productionRuntime() && resolvePush().info.mode !== 'live') throw new Error('PUSH_NOT_READY')
  const r = await pushToUser(userId, { title: 'MIRO', body: '알림이 잘 와요. 캐릭터의 연락도 이렇게 도착해요.', url: '/my/permissions', tag: 'push-test' }, now)
  observe('push.test', { userId, ...r })
  return r
}
