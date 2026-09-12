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
    /** 사용량 창 길이(시간). 창 시작 = 첫 생성 AI Request 시각 (소진 시점 아님). */
    windowHours: 5,
    limits: {
      free: DEV_DEFAULT(100),
      pro: DEV_DEFAULT(1000),
    } satisfies Record<Plan, number>,
    /** 생성 종류별 소비 가중치. Provider 확정 후 실측으로 교체. */
    weights: {
      textRP: DEV_DEFAULT(1),
      complexEvent: DEV_DEFAULT(2),
      photo: DEV_DEFAULT(10),
      faceCast: DEV_DEFAULT(15),
      background: DEV_DEFAULT(8),
      liveScene: DEV_DEFAULT(12),
      /** 통화는 분당 가중치 */
      voiceCallPerMinute: DEV_DEFAULT(5),
      videoCallPerMinute: DEV_DEFAULT(20),
    },
    /** 단순 선연락/Push 는 사용량을 차감하지 않는 방향을 우선 적용 (명세서 정책 1). */
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

  adultVerification: {
    /** 명세서 7.1 예외: 인증 실패 시 재시도 대기 시간. */
    retryAfterHours: 24,
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
