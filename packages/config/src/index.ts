import { usagePolicy } from './ai-policy'
/**
 * MIRO Policy Configuration
 *
 * 모든 TBD 정책값의 단일 출처. Domain 코드에 수치를 하드코딩하지 않는다.
 * DEV_DEFAULT 로 표기된 값은 원가 측정 / 기술 검증 후 확정한다 (Product Decision).
 */

/** 확정되지 않은 개발용 임시값 표기. 런타임 동작은 항등함수. */
export function DEV_DEFAULT<T>(value: T): T {
  return value
}

export type Plan = 'free' | 'pro'

export const POLICY = {
  usage: {
    period: 'monthly' as const,
    get limits() { return usagePolicy().monthly },
    get weights() { return usagePolicy().weights },
    chargeRealityContact: DEV_DEFAULT(false),
  },

  relationship: {
    /** 한 턴에 허용되는 차원별 최대 변화량. AI 가 비정상 delta 를 반환해도 이 범위로 clamp. */
    deltaClampPerTurn: DEV_DEFAULT(15),
    /** 각 차원의 값 범위 */
    dimensionMin: 0,
    dimensionMax: 100,
  },

  event: {
    /** 동시에 활성일 수 있는 사건 수. 초과 시 신규 사건 발생 억제. */
    maxActive: DEV_DEFAULT(2),
    /** 동일 유형 사건 재발생까지 최소 턴 간격. */
    cooldownTurns: DEV_DEFAULT(8),
    /** 사건 후보가 실제 발생으로 선택되기 위한 최소 점수. */
    minSelectionScore: DEV_DEFAULT(0.55),
  },

  npc: {
    /** 동시에 활성일 수 있는 NPC 수. NPC 가 메인 캐릭터보다 맥락을 많이 차지하지 않게 한다. */
    maxActive: DEV_DEFAULT(4),
  },

  memory: {
    /** 장기 기억으로 승격되기 위한 최소 중요도. */
    minImportance: DEV_DEFAULT(0.4),
    /** 한 턴에 수집 가능한 기억 후보 최대 수. */
    maxCandidatesPerTurn: 3,
    /** 세션당 보존하는 장기 기억 최대 수. 초과 시 중요도 낮은 것부터 정리한다. */
    maxPerSession: DEV_DEFAULT(120),
  },

  reality: {
    /** 동일 세션에 대한 선연락 최소 간격(분). */
    minGapMinutes: DEV_DEFAULT(90),
    /** 사용자가 확인하지 않은 채 쌓일 수 있는 선연락 최대 수. */
    maxPending: DEV_DEFAULT(2),
    /**
     * 사용자의 마지막 상호작용 후 이 시간이 지나야 선연락 판단 대상이 된다.
     * 대화 중인 사용자에게 먼저 연락하지 않기 위해서다.
     */
    idleMinutesBeforeContact: DEV_DEFAULT(60),
    /** 한 세션을 다시 판단하기까지의 최소 간격(분). 스케줄러 부하 제어용. */
    recheckMinutes: DEV_DEFAULT(30),
    /** 스케줄러 1회 실행당 판단할 세션 수. */
    batchSize: DEV_DEFAULT(200),
    /** 사용자 timezone 미설정 시 기본값. Quiet Hours/Active Hours 판정에 쓴다. */
    defaultTimeZone: DEV_DEFAULT('Asia/Seoul'),
    /**
     * 연락 동기 임계값 (0-1). 낮출수록 캐릭터가 더 자주 먼저 연락한다.
     * 침묵만으로 연락이 가려면 적극적 캐릭터 + 가까운 관계가 필요하도록 맞춰져 있다 (Product feel, TBD).
     */
    motivationThreshold: DEV_DEFAULT(0.5),
  },

  quietHours: {
    /**
     * 명세서 5.1 예외: 야간 선연락은 기본 차단하고 사용자가 설정에서 켤 수 있다.
     * 차단 대상은 발송(Push/수신통화)이며 Simulation State 진행은 계속된다.
     */
    defaultEnabled: true,
    defaultStart: DEV_DEFAULT('23:00'),
    defaultEnd: DEV_DEFAULT('08:00'),
  },

  call: {
    /** 수신 통화가 이 시간 안에 수락되지 않으면 부재중으로 기록한다. */
    ringingTimeoutMinutes: DEV_DEFAULT(2),
    /** 한 통화의 최대 길이(분). 초과 시 서버가 종료한다. */
    maxMinutes: DEV_DEFAULT(30),
    /** 캐릭터가 메시지 대신 전화를 택하는 urgency 하한. profile.callProbability 와 함께 본다. */
    voiceUrgencyFloor: DEV_DEFAULT(0.8),
    videoUrgencyFloor: DEV_DEFAULT(0.9),
  },

  adultVerification: {
    /** 명세서 7.1 예외: 인증 실패 시 재시도 대기 시간. */
    retryAfterHours: 24,
    /** 성인 기준 연령 (만). 인증 Provider 확정 후 그쪽 판정을 따른다. */
    minimumAge: DEV_DEFAULT(19),
  },

  subscription: {
    /** 결제 기간(일). 실제 PG 의 주기를 따르게 되며, Mock 은 이 값을 쓴다. */
    periodDays: DEV_DEFAULT(30),
    /** 가격은 Product Decision — 확정 전까지 숫자를 두지 않는다. */
    priceLabel: 'TBD',
  },

  retention: {
    /** 삭제 확정된 역할극을 복구 가능하게 보관하는 기간(일). 법적 정책 확정 전 임시값. */
    deletedSessionDays: DEV_DEFAULT(30),
    /** 계정 삭제 후 운영 검토용 최소 보존(일). 명세서 12장: 세부 기간은 초기 범위 밖 → TBD. */
    deletedAccountDays: DEV_DEFAULT(30),
  },

  context: {
    /** ContextBuilder 가 조립할 수 있는 최대 토큰(근사). 초과 시 우선순위 낮은 항목부터 제외. */
    maxTokens: DEV_DEFAULT(8000),
    recentMessageCount: DEV_DEFAULT(12),
    relevantMemoryCount: DEV_DEFAULT(8),
  },

  generation: {
    /** Structured Output 검증 실패 시 재시도 횟수. 무한 재시도 금지. */
    maxRetries: 1,
  },
} as const
export * from './features'

export * from './ai-policy'
export * from './recharge-policy'
export * from './runtime'
