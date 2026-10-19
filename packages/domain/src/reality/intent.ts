import type { ContactChannel, ContactProfile } from '../character/types'
import type { RelationshipState } from '../relationship/types'
import type { SimulationEvent } from '../event/types'
import type { RealityIntent } from './types'
import { pickCallChannel } from '../call/pick'
import { firstContactDelayMinutes, silenceHours } from '../relationship/dynamics'
import { localClock, localIso, type LocalClock } from '../time/clock'
import { atLocal } from './moments'
import type { Availability } from './routine'

export type IntentInput = {
  relationship: RelationshipState
  activeEvents: SimulationEvent[]
  contactProfile: ContactProfile
  /** 사용자의 마지막 상호작용 후 경과 시간(분). */
  idleMinutes: number
  /** RP 턴이나 사건 규칙이 남긴 의도. 있으면 우선한다. notBefore 가 아직이면 그때까지 기다린다. */
  pending: RealityIntent | null
  now?: Date
  /** 현실 시계·생활 리듬 — 있으면 하루의 때에 맞춘 안부(식사 시간)가 가능하다. */
  clock?: LocalClock
  availability?: Availability
  lastContactAt?: Date | null
  /** 이미 연락한 사건(`id:status`). 같은 사건·상태로는 다시 연락하지 않고 다른 이유를 본다 — 안 그러면 사건이 풀릴 때까지 아무 연락도 못 한다. */
  contactedEvents?: ReadonlySet<string>
  /** 지금까지의 대화 턴 수와, 이 세션에서 먼저 연락한 적이 있는가 — 첫 연락(처음 만난 뒤 한 번)에 쓴다. */
  turnCount?: number
  contactedBefore?: boolean
  /** 캐릭터 성향의 주도성(0–100). 첫 연락이 언제 오는지를 성격대로 정한다. */
  initiative?: number
}

/** 처음 만난 뒤 한 번 먼저 보내는 연락의 이유. evaluator 가 동기 검사를 하지 않고, 세션에 한 번만 나간다. */
export const FIRST_CONTACT_REASON = '처음 만난 뒤 첫 연락 — 아직 서로 잘 모르는 사이라 가볍고 자연스럽게, 첫 만남이나 그때 나눈 이야기를 짧게 떠올린다'

/**
 * 첫 대화 끝의 약속(10/19) — "이따 저녁에 문자할게" 를 말하게 하고, 그 시각에 실제로 연락이 가게 한다.
 * 두 시간쯤 뒤, 그때가 밤 10시~아침 9시면 다음 날 아침 9시 반. when 은 대사에 그대로 쓰는 때(한국어 — 대사는 사용자 언어로 옮겨 쓴다).
 */
export function firstPromiseAt(now: Date, timeZone: string): { at: Date; when: string } {
  const later = new Date(now.getTime() + 2 * 3_600_000)
  const hour = localClock(later, timeZone).hour
  const sameDay = localIso(later, timeZone).slice(0, 10) === localIso(now, timeZone).slice(0, 10)
  if (hour >= 22 || hour < 9 || !sameDay) {
    const nextMorning = atLocal(now, timeZone, localClock(now, timeZone).hour < 9 ? 0 : 1, 9 * 60 + 30)
    return { at: nextMorning, when: localClock(now, timeZone).hour < 9 ? '이따 아침에' : '내일 아침에' }
  }
  return { at: later, when: hour < 12 ? '이따 점심쯤' : hour < 17 ? '이따 오후에' : hour < 20 ? '이따 저녁에' : '이따 밤에' }
}

/** 약속을 지키는 연락의 이유 — 캐릭터(계획)가 읽는다. */
export const PROMISE_REASON = '약속 지키기: 첫 대화에서 이 시간쯤 먼저 문자하겠다고 사용자에게 직접 약속했다. 그 약속을 기억하고 지키는 연락 — 그 대화를 이어 가볍게, 약속했던 걸 생색내지 않게.'

/** 첫 대화의 대사 지시 — 일정 하나를 묻고, 끝에 연락을 약속한다. 대사(dialogue) 생성에만 붙인다. */
export function firstMeetingDirective(when: string): string {
  return `## 첫 대화(서버 지시, 이번 답에만)
이번이 사용자와 나누는 첫 대화다. 이번 대사 안에서 아래 두 가지를 이 캐릭터의 성격·말투와 지금 장면에 맞게 자연스럽게 한다. 안내·홍보처럼 들리면 안 된다.
1. 사용자의 가까운 일정 하나를 가볍게 묻는다 — 오늘 이따, 내일, 이번 주에 뭐 하는지(시험·약속·일·면접 같은 것). 사용자가 이미 말했다면 다시 묻지 말고 그 얘기에 반응한다.
2. 대사 끝 무렵, "${when}" 먼저 문자(메시지)하겠다고 짧게 약속한다(예: "${when} 문자할게"). 때는 이것으로 고정한다 — 다른 시각을 말하지 않는다. 연락처를 주고받는 장면을 새로 만들지 않는다. 세계관상 '문자'가 어색하면 그 세계의 말(서신·전갈 등)로 바꿔 말한다.`
}

/** 대사가 실제로 나중 연락을 약속했는가(네 언어). 약속하지 않았으면 약속 연락을 잡지 않는다 — 기존 첫 연락이 맡는다. */
const PROMISE = /(연락|문자|톡|카톡|메시지|메세지|서신|전갈|전화)\s*(을|를)?\s*(할게|할께|줄게|보낼게|드릴게|하마|할 테니|할테니|해 줄게|해줄게|넣을게|남길게|보내마|띄울게)|\b(text|message|call|ping|write to|write) you\b|(連絡|メッセージ|メール|LINE)(する|します|送る)|(发消息|联系你|给你发|打给你|发信息)/i
export function promisedContact(text: string): boolean {
  return PROMISE.test(text)
}

/** 하루 세 번의 안부 창. 이 시간에 캐릭터가 비어 있고 관계가 됐으면 "밥 먹었어?" 를 보낼 이유가 생긴다. */
const MEALS: Array<{ name: string; from: number; to: number; reason: string }> = [
  { name: '아침', from: 7, to: 9, reason: 'checkin:아침 — 잘 잤는지, 하루 시작을 가볍게 묻는다' },
  { name: '점심', from: 12, to: 13, reason: 'checkin:점심 — 점심 먹었는지, 오전이 어땠는지 묻는다' },
  { name: '저녁', from: 18, to: 20, reason: 'checkin:저녁 — 저녁 먹었는지, 오늘 하루가 어땠는지 묻는다' },
]

/** 발송 가능한 채널. missed_call 은 결과 상태이지 의도가 아니다. */
const SENDABLE: ContactChannel[] = [
  'message', 'push', 'photo', 'status', 'voice_message', 'voice_call', 'video_call',
]

/**
 * 연락 의도 도출.
 *
 * "가입 N시간 후" 같은 스케줄이 아니라 현재 상태에서 이유를 찾는다.
 * 이유가 없으면 null 을 반환하고, 스케줄러는 아무것도 보내지 않는다.
 * 의도가 있다고 발송이 확정되는 것도 아니다 — evaluator 가 다시 거른다.
 */
export function deriveIntent(input: IntentInput): RealityIntent | null {
  const { relationship: r, activeEvents, contactProfile: p, idleMinutes, pending } = input

  // 0. 사용자가 선연락을 껐다 — 사건이든 RP 가 남긴 의도든 밖으로 나가지 않는다.
  if (p.enabled === false) return null

  if (pending) {
    // 예약된 의도는 시각이 될 때까지 다른 이유로 대체하지 않는다 — 캐릭터의 계획이다.
    if (pending.notBefore && new Date(pending.notBefore).getTime() > (input.now ?? new Date()).getTime()) return null
    return { ...pending, channel: downgrade(pending.channel) }
  }

  // 1. 미해결 사건 — 가장 강한 동기. 사건이 있으면 거리와 무관하게 이유가 생긴다.
  //    이미 연락한 사건(같은 상태)은 건너뛴다 — 9/27 운영: 사건 하나로 연락한 뒤 사흘 동안 그 사건만 집혀 중복으로 막혀 아무 연락도 없었다.
  const event = activeEvents.find((e) => (e.status === 'active' || e.status === 'escalated') && !input.contactedEvents?.has(`${e.id}:${e.status}`))
  if (event) {
    const urgency = event.status === 'escalated' ? 0.9 : 0.7
    return {
      channel: pickCallChannel(p, urgency, preferred(p)),
      reason: `event:${event.type}`,
      urgency,
      eventKey: `${event.id}:${event.status}`,
    }
  }

  // 1.2 처음 만난 뒤 첫 연락 — 아직 관계 문턱 전이라도, 첫 대화를 나누고 떠난 사용자에게 성격대로의 시간이 지나면 한 번(2026-10-02).
  if (!input.contactedBefore && idleMinutes >= firstContactDelayMinutes(input.initiative ?? 50, p.initiativeLevel)) {
    return { channel: preferred(p), reason: FIRST_CONTACT_REASON, urgency: 0.5 }
  }

  // 마지막으로 연락한 뒤로도 조용했던 시간 — 방금 문자를 보냈으면 '오래 연락이 없다'고 다시 보내지 않는다.
  const sinceContactMinutes = input.lastContactAt ? ((input.now ?? new Date()).getTime() - input.lastContactAt.getTime()) / 60_000 : Infinity
  const quietMinutes = Math.min(idleMinutes, sinceContactMinutes)

  // 1.5 식사 시간 안부 — 캐릭터가 비어 있고 오늘 몇 시간 조용했을 때의 기회. 관계 문턱은 없다 — 보낼지는 캐릭터가 관계를 보고 정한다(10/16).
  if (input.clock && input.availability === 'free' && idleMinutes >= 180) {
    const meal = MEALS.find((m) => input.clock!.hour >= m.from && input.clock!.hour < m.to)
    if (meal && sinceContactMinutes >= 6 * 60) return { channel: preferred(p), reason: meal.reason, urgency: 0.4 }
  }

  // 2. 연락이 오래 없을 때 — 관계성(연애·친구·일…)과 연락 주도성, 지금의 친밀도로 문턱과 간격을 매번 다시 정한다.
  //    가까워질수록 문턱을 넘고, 간격도 짧아진다 (relationship/dynamics).
  if (quietMinutes >= silenceHours(r, p.contactFrequency, p.initiativeLevel) * 60) {
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

