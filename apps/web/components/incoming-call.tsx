import { feature } from '@miro/config'
import { ringingFor } from '@/lib/call/service'
import { RingWatcher } from './ring-watcher'

/**
 * 수신 화면(n34). (main) 레이아웃에 한 번 붙는다 — 어느 화면에 있든 벨이 울린다.
 * 첫 화면은 서버가 지금 울리는 통화를 넘기고, 그 뒤로는 RingWatcher 가 몇 초마다 물어 새 벨을 바로 그린다.
 */
export async function IncomingCall({ userId, characterName }: { userId: string; characterName?: string }) {
  // 전화가 울릴 수 없는 환경(운영은 통화 기능이 꺼져 있다)에서는 묻지도, 8초마다 폴링하지도 않는다.
  if (!feature('voiceCall') && !feature('videoCall')) return null
  const call = await ringingFor(userId)
  return <RingWatcher initial={call ? { id: call.id, channel: call.channel, reason: call.reason, characterName: characterName ?? call.characterName } : null} />
}
