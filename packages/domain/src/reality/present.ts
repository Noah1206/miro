import type { ContactChannel } from '../character/types'

export type ContactPresentation = {
  senderLabel?: string
  channelLabels?: Record<string, string>
}

export type PresentedContact = {
  /** 알림/목록에 표시할 발신자 이름. 예: '토마스', '알 수 없는 번호' */
  senderLabel: string
  /** 채널의 세계관 표현. 예: '메시지', '편지', '사내 메신저' */
  channelLabel: string
}

const DEFAULT_LABELS: Record<ContactChannel, string> = {
  message: '메시지',
  push: '메시지',
  photo: '사진',
  voice_message: '음성 메시지',
  status: '상태',
  missed_call: '부재중 전화',
  voice_call: '전화',
  video_call: '영상통화',
}

/**
 * World Translation.
 *
 * 도메인 기능은 공통이고 표현만 세계관에 맞게 바뀐다 (명세서 5.1).
 * 캐릭터별 코드 분기 대신 contact_profiles.presentation 데이터를 읽는다.
 */
export function presentContact(
  channel: ContactChannel,
  characterName: string,
  presentation: ContactPresentation | null | undefined,
): PresentedContact {
  return {
    senderLabel: presentation?.senderLabel ?? characterName,
    channelLabel: presentation?.channelLabels?.[channel] ?? DEFAULT_LABELS[channel],
  }
}
