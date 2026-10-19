import { ringingFor } from '@/lib/call/service'
import { RingWatcher } from './ring-watcher'

/**
 * 수신 화면(n34). (main) 레이아웃에 한 번 붙는다 — 어느 화면에 있든 벨이 울린다.
 * 첫 화면은 서버가 지금 울리는 통화를 넘기고, 그 뒤로는 RingWatcher 가 몇 초마다 물어 새 벨을 바로 그린다.
 */
export async function IncomingCall({ userId, characterName }: { userId: string; characterName?: string }) {
  // 10/19: 음성·영상 유형 캐릭터가 전역 플래그와 무관하게 전화를 걸 수 있어 늘 듣는다(폴링은 RingWatcher 가 몇 초마다).
  const call = await ringingFor(userId)
  return <RingWatcher initial={call ? { id: call.id, channel: call.channel, reason: call.reason, characterName: characterName ?? call.characterName } : null} />
}
