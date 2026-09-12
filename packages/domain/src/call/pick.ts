import { POLICY } from '@miro/config'
import type { ContactChannel, ContactProfile } from '../character/types'

/**
 * 메시지 대신 전화를 걸지 결정한다.
 *
 * 난수를 쓰지 않는다. profile 의 call/videoCallProbability 는 "이 캐릭터가 전화를 택하는
 * 성향" 이며, 의도의 urgency 와 함께 임계값으로 본다 — 같은 상태면 같은 결과다.
 */
export function pickCallChannel(
  profile: ContactProfile,
  urgency: number,
  fallback: ContactChannel,
): ContactChannel {
  const { voiceUrgencyFloor, videoUrgencyFloor } = POLICY.call
  if (urgency >= videoUrgencyFloor && profile.videoCallProbability >= 0.5) return 'video_call'
  if (urgency >= voiceUrgencyFloor && profile.callProbability >= 0.5) return 'voice_call'
  return fallback
}
