import { adultModelReady } from '@miro/providers'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { adultModeGateFor } from '@/lib/ops/safety'
import { inlineMirrorEnabled } from './inline-mirror'

/**
 * 이 방의 뒤 작업(먼저 연락 판단·하루 생활·기억 정리·소설)을 언베일 전용 모델(OpenRouter)로 보낼까 — 대화 턴(snapshot.ts 의 adultTurn)과 같은 판정.
 * 11/24 사용자: "언베일일 때는 무조건 OpenRouter". 한 방 구조(11/3)가 된 뒤로 adult_since 는 늘 비어 있는데 뒤 작업은 그 칸만 봐서,
 * 언베일을 켠 계정의 방도 전부 메인 키(Gemini 직접)로 먼저 나갔다 — 안전 필터에 막히면 한 번 더 보내 이중으로 들었다(48시간 487건).
 */
export async function roomAdult(room: { userId: string; characterId: string; sessionId: string; adultSince: Date | null }): Promise<boolean> {
  if (room.adultSince !== null) return true
  if (!inlineMirrorEnabled() || !(await homeUnveilEnabled(room.userId))) return false
  return (await adultModeGateFor(room.userId, room.characterId, room.sessionId)).allowed
}

/** 방이 없는 작업(캐릭터 설정 정리) — 그 계정이 언베일을 켜 두었으면 언베일 전용 모델로. */
export async function userAdult(userId: string | null | undefined): Promise<boolean> {
  return !!userId && adultModelReady() && inlineMirrorEnabled() && await homeUnveilEnabled(userId)
}
