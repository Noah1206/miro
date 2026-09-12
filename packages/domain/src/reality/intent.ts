import type { ContactChannel, ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'
import type { SimulationEvent } from '../event/types'
import type { RealityIntent } from './types'

export type IntentInput = {
  relationship: RelationshipState
  activeEvents: SimulationEvent[]
  contactProfile: ContactProfile
  /** 사용자의 마지막 상호작용 후 경과 시간(분). */
  idleMinutes: number
  /** RP 턴에서 AI 가 남긴 의도. 있으면 우선한다. */
  pending: RealityIntent | null
}

/** P7 에서 실제로 발송 가능한 채널. 통화 계열은 P8 에서 연결된다. */
const SENDABLE: ContactChannel[] = ['message', 'push', 'photo', 'status', 'voice_message']

/**
 * 연락 의도 도출.
 *
 * "가입 N시간 후" 같은 스케줄이 아니라 현재 상태에서 이유를 찾는다.
 * 이유가 없으면 null 을 반환하고, 스케줄러는 아무것도 보내지 않는다.
 * 의도가 있다고 발송이 확정되는 것도 아니다 — evaluator 가 다시 거른다.
 */
export function deriveIntent(input: IntentInput): RealityIntent | null {
  const { relationship: r, activeEvents, contactProfile: p, idleMinutes, pending } = input

  if (pending) return { ...pending, channel: downgrade(pending.channel) }

  // 1. 미해결 사건 — 가장 강한 동기. 사건이 있으면 거리와 무관하게 이유가 생긴다.
  const event = activeEvents.find((e) => e.status === 'active' || e.status === 'escalated')
  if (event) {
    return {
      channel: preferred(p),
      reason: `event:${event.type}`,
      urgency: event.status === 'escalated' ? 0.9 : 0.7,
    }
  }

  // 2. 침묵이 길고 애착이 있으면 — 단, 정서적 거리가 멀면 먼저 연락하지 않는다.
  const bonded = r.attachment >= 40 && r.emotionalDistance <= 55
  if (bonded && idleMinutes >= longSilence(p)) {
    return {
      channel: preferred(p),
      reason: 'silence',
      urgency: Math.min(0.6, 0.3 + idleMinutes / (60 * 48)),
    }
  }

  // 3. 그 외에는 연락할 이유가 없다.
  return null
}

/** 캐릭터의 선호 채널. 발송 불가 채널이면 메시지로 낮춘다. */
function preferred(p: ContactProfile): ContactChannel {
  return downgrade(p.preferredChannel)
}

function downgrade(c: ContactChannel): ContactChannel {
  return SENDABLE.includes(c) ? c : 'message'
}

/** 연락 빈도 성향이 낮을수록 더 오래 기다린다. 0→약 3일, 100→약 6시간. */
function longSilence(p: ContactProfile): number {
  const hours = 72 - (p.contactFrequency / 100) * 66
  return Math.round(hours * 60)
}
