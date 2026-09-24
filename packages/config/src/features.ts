/**
 * 기능 플래그 — Alpha 와 Production 은 같은 엔진을 쓰고, 켜는 기능과 한도만 다르다.
 * MIRO_MODE=alpha 면 돈 드는 기능(이미지·통화·Live Scene)을 끄고, 관계·기억·사건·리얼리티는 그대로 켠다.
 * 개별 플래그는 MIRO_FEATURE_<NAME>=1|0 으로 덮어쓸 수 있다.
 */
import { productionRuntime } from './runtime'

export type FeatureName =
  | 'imageGeneration' | 'voiceCall' | 'videoCall' | 'liveScene'
  | 'relationshipEngine' | 'memoryEngine' | 'eventEngine' | 'realityMessage'
  /** 리얼리티 메시지를 크론을 기다리지 않고 턴 직후 바로 보낸다 (알파의 즉시 후속 메시지). */
  | 'inlineReality'
  /** 의미 이벤트 분류에 LLM 을 보조로 매 턴 쓴다 (비용 발생). 규칙 분류는 항상 켜져 있다. */
  | 'llmSemanticAnalysis'
  /** 최근 대화를 주기적으로 요약해 단기 기억으로 남긴다 (비용 발생). */
  | 'memorySummaries' | 'memoryExtraction'

export type Mode = 'alpha' | 'production'

const PRESET: Record<Mode, Record<FeatureName, boolean>> = {
  alpha: {
    imageGeneration: false, voiceCall: false, videoCall: false, liveScene: false,
    relationshipEngine: true, memoryEngine: true, eventEngine: true, realityMessage: true,
    inlineReality: true, llmSemanticAnalysis: false, memorySummaries: true, memoryExtraction: true,
  },
  production: {
    imageGeneration: true, voiceCall: true, videoCall: true, liveScene: true,
    relationshipEngine: true, memoryEngine: true, eventEngine: true, realityMessage: true,
    // 2026-09-24: 관계가 표현 규칙에만 걸려 움직이지 않았다 — AI 분류를 매 턴 붙인다(턴 원가 약 +10%).
    inlineReality: false, llmSemanticAnalysis: true, memorySummaries: true, memoryExtraction: true,
  },
}

export function currentMode(): Mode {
  return process.env.MIRO_MODE === 'alpha' ? 'alpha' : 'production'
}

export function feature(name: FeatureName): boolean {
  // Media transports are not production-verified yet. A production env override must not expose them.
  if (productionRuntime() && ['voiceCall', 'videoCall', 'liveScene', 'imageGeneration'].includes(name)) return false
  const override = process.env[`MIRO_FEATURE_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`]
  if (override === '1') return true
  if (override === '0') return false
  return PRESET[currentMode()][name]
}

/**
 * 음성통화를 운영에서 먼저 열어 볼 계정(MIRO_VOICE_CALL_USERS, 쉼표 구분 사용자 ID).
 * 사람이 실제 기기로 통화해 본 뒤 전체 공개는 위 차단 목록에서 voiceCall 을 빼는 것으로 한다.
 * 사용자가 거는 통화만 해당한다 — 캐릭터가 먼저 거는 통화는 전체 공개 전까지 열리지 않는다.
 */
export function voiceCallAllowed(userId: string | null | undefined): boolean {
  if (feature('voiceCall')) return true
  return !!userId && voiceCallTesters().includes(userId)
}
export function voiceCallTesters(): string[] {
  return (process.env.MIRO_VOICE_CALL_USERS ?? '').split(',').map((id) => id.trim()).filter(Boolean)
}

export function features(): Record<FeatureName, boolean> {
  const out = {} as Record<FeatureName, boolean>
  for (const k of Object.keys(PRESET.production) as FeatureName[]) out[k] = feature(k)
  return out
}
