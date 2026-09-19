'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db, conversationRequests } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { runConversationTurn } from '@/lib/simulation/turn'
import { exceededMessage } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'

export type TurnState = {
  succeeded?: boolean
  retryWithSameId?: boolean
  error: string | null
  notice: string | null
  /** 한도 도달 시 UI 가 Pro 안내 / 초기화 대기를 구분해 보여준다. */
  limit: { plan: 'free' | 'pro'; resetsAt: string } | null
  /**
   * 생성이 실패했지만 오류 문구를 띄우지 않는다 — 캐릭터가 아직 쓰는 중인 것처럼 점을 계속 돌린다.
   * 유저가 손쓸 수 있는 실패(한도·안전·세션 없음)는 해당하지 않는다. 그건 말해 줘야 풀린다.
   */
  keepWaiting?: boolean
}

const fail = (error: string): TurnState => ({ error, notice: null, limit: null })

/** 자유 RP 한 턴. 파이프라인은 lib/simulation/turn 에 있다 — /api/chat 과 같은 코드. */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()
  if (input.length === 0) return { error: null, notice: null, limit: null }

  const r = await runConversationTurn({ userId: user.id, sessionId, input, chatModel: String(form.get('chatModel') ?? 'miro'), requestId: String(form.get('requestId') ?? '') || undefined })
  if (!r.ok) {
    switch (r.reason) {
      case 'usage': return { error: exceededMessage(r.error), notice: null, limit: { plan: r.error.plan, resetsAt: r.error.resetsAt.toISOString() } }
      case 'model_unavailable': return fail('선택한 모델을 사용할 수 없어요. 요금제와 모델 준비 상태를 확인해 주세요.')
      case 'budget': return fail(r.kind === 'user_monthly' ? COPY.error.budgetMonthly : COPY.error.budget)
      case 'too_long': return fail(COPY.error.tooLong(2000))
      case 'not_found': return fail(COPY.error.sessionNotFound)
      case 'restricted': return fail(COPY.error.restricted)
      case 'conflict': {
        const id = String(form.get('requestId') ?? '')
        const valid = /^[0-9a-f-]{36}$/i.test(id)
        const [request] = valid ? await db.select({ status: conversationRequests.status }).from(conversationRequests)
          .where(and(eq(conversationRequests.id, id), eq(conversationRequests.userId, user.id), eq(conversationRequests.sessionId, sessionId))).limit(1) : []
        return { ...fail(COPY.error.saveConflict), retryWithSameId: request?.status !== 'failed' }
      }
      // 답을 못 만든 것은 유저가 고칠 수 있는 일이 아니다. 오류 문구 대신 기다림을 이어 둔다.
      case 'generation': return { error: null, notice: null, limit: null, keepWaiting: true }
      case 'safety': return fail('이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.')
      default: return { error: null, notice: null, limit: null }
    }
  }
  revalidatePath(`/chat/${sessionId}`)
  return { succeeded: true, error: null, notice: r.providerMode === 'mock' ? COPY.status.mockLLM : null, limit: null }
}
