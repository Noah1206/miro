/**
 * 기능 플래그 — Alpha 와 Production 은 같은 엔진을 쓰고, 켜는 기능과 한도만 다르다.
 * MIRO_MODE=alpha 면 돈 드는 기능(이미지·통화·Live Scene)을 끄고, 관계·기억·사건·리얼리티는 그대로 켠다.
 * 개별 플래그는 MIRO_FEATURE_<NAME>=1|0 으로 덮어쓸 수 있다.
 */
export type FeatureName =
  | 'imageGeneration' | 'voiceCall' | 'videoCall' | 'liveScene'
  | 'relationshipEngine' | 'memoryEngine' | 'eventEngine' | 'realityMessage'
  /** 리얼리티 메시지를 크론을 기다리지 않고 턴 직후 바로 보낸다 (알파의 즉시 후속 메시지). */
  | 'inlineReality'
  /** 의미 이벤트 분류에 LLM 을 보조로 쓴다 (비용 발생). 규칙 분류는 항상 켜져 있다. */
  | 'llmSemanticAnalysis'
  /** 최근 대화를 주기적으로 요약해 단기 기억으로 남긴다 (비용 발생). */
  | 'memorySummaries' | 'memoryExtraction'

export type Mode = 'alpha' | 'production'

const PRESET: Record<Mode, Record<FeatureName, boolean>> = {
  alpha: {
    imageGeneration: false, voiceCall: false, videoCall: false, liveScene: false,
    relationshipEngine: true, memoryEngine: true, eventEngine: true, realityMessage: true,
    inlineReality: true, llmSemanticAnalysis: false, memorySummaries: false, memoryExtraction: false,
  },
  production: {
    imageGeneration: true, voiceCall: true, videoCall: true, liveScene: true,
    relationshipEngine: true, memoryEngine: true, eventEngine: true, realityMessage: true,
    inlineReality: false, llmSemanticAnalysis: false, memorySummaries: false, memoryExtraction: false,
  },
}

export function currentMode(): Mode {
  return process.env.MIRO_MODE === 'alpha' ? 'alpha' : 'production'
}

export function feature(name: FeatureName): boolean {
  const override = process.env[`MIRO_FEATURE_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`]
  if (override === '1') return true
  if (override === '0') return false
  return PRESET[currentMode()][name]
}

export function features(): Record<FeatureName, boolean> {
  const out = {} as Record<FeatureName, boolean>
  for (const k of Object.keys(PRESET.production) as FeatureName[]) out[k] = feature(k)
  return out
}
