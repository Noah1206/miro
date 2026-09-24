import type { FeatureName } from '@miro/config'
import type { ContactChannel } from '@miro/domain'

/** 연락 수단의 기능 플래그. 서버가 features() 로 채워 넘긴다 — 발송·소개·미리보기가 같은 값을 본다. */
export type ContactCapabilities = Pick<Record<FeatureName, boolean>, 'realityMessage' | 'imageGeneration' | 'voiceCall' | 'videoCall'>

/** 꺼진 사진·통화는 메시지로 낮춘다. */
export function deliverableChannel(c: ContactChannel, can: ContactCapabilities): ContactChannel {
  if ((c === 'photo' && !can.imageGeneration) || (c === 'voice_call' && !can.voiceCall) || (c === 'video_call' && !can.videoCall)) return 'message'
  return c
}
