import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db, conversationRequests } from '@miro/db'
import { runConversationTurn } from '@/lib/simulation/turn'
import { exceededMessage } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'

export type TurnMsg = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

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
  /** 이번 턴에 저장된 메시지. 화면이 바로 붙인다. */
  messages?: TurnMsg[]
  /** 문자: 캐릭터가 바빠서 답장이 나중에 온다. */
  delayed?: { until: string; label: string }
}

const fail = (error: string): TurnState => ({ error, notice: null, limit: null })

/**
 * 캐릭터챗(/chat)과 문자(/messages)가 같이 쓰는 턴 액션 본체. 폼을 읽고 파이프라인(lib/simulation/turn)을 부른 뒤
 * 결과를 화면 상태로 옮긴다. 두 페이지의 차이는 mode 와 되살릴 경로뿐이다.
 */
export async function turnFromForm(userId: string, form: FormData, opts: { mode: 'chat' | 'messenger'; path: (sessionId: string) => string }): Promise<TurnState> {
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()
  if (input.length === 0) return { error: null, notice: null, limit: null }

  const r = await runConversationTurn({ userId, sessionId, input, mode: opts.mode, chatModel: String(form.get('chatModel') ?? 'miro'), requestId: String(form.get('requestId') ?? '') || undefined })
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
          .where(and(eq(conversationRequests.id, id), eq(conversationRequests.userId, userId), eq(conversationRequests.sessionId, sessionId))).limit(1) : []
        return { ...fail(COPY.error.saveConflict), retryWithSameId: request?.status !== 'failed' }
      }
      // 답을 못 만든 것은 유저가 고칠 수 있는 일이 아니다. 오류 문구 대신 기다림을 이어 둔다.
      case 'generation': return { error: null, notice: null, limit: null, keepWaiting: true }
      case 'safety': return fail('이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.')
      default: return { error: null, notice: null, limit: null }
    }
  }
  const messages: TurnMsg[] = (r.messages ?? []).map((m) => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, blocks: (m.blocks ?? []) as TurnMsg['blocks'] }))
  // 답은 액션이 그대로 들고 간다. 재전송으로 되살린 옛 결과에 메시지가 없을 때만 페이지를 다시 받아 온다.
  if (messages.length === 0) revalidatePath(opts.path(sessionId))
  return { succeeded: true, messages, error: null, notice: r.providerMode === 'mock' ? COPY.status.mockLLM : null, limit: null, ...(r.delayed ? { delayed: r.delayed } : {}) }
}
