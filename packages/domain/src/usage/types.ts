import type { Plan } from '@miro/config'

export type UsageKind =
  | 'textRP' | 'complexEvent' | 'characterDraft' | 'photo' | 'faceCast'
  | 'background' | 'liveScene' | 'voiceCallPerMinute' | 'videoCallPerMinute'

export type UsageWindow = {
  id: string
  userId: string
  plan: Plan
  /** 창 시작 = 첫 생성 AI Request 시각. 사용량 소진 시점이 아니다. */
  startedAt: Date
  endsAt: Date
  consumed: number
  limit: number
}

export type UsageLedgerEntry = {
  id: string
  windowId: string
  userId: string
  kind: UsageKind
  amount: number
  /** 이중 차감 방지. DB UNIQUE 제약과 짝을 이룬다. */
  idempotencyKey: string
  status: 'reserved' | 'committed' | 'rolled_back'
  createdAt: Date
}

export type UsageDecision =
  | { allowed: true; window: UsageWindow; cost: number }
  | { allowed: false; reason: 'limit_reached'; plan: Plan; resetsAt: Date }
