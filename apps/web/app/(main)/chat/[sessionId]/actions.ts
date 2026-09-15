'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db, roleplaySessions, conversationRequests } from '@miro/db'
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
}

const fail = (error: string): TurnState => ({ error, notice: null, limit: null })

/** 자유 RP 한 턴. 파이프라인은 lib/simulation/turn 에 있다 — /api/chat 과 같은 코드. */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  const input = String(form.get('input') ?? '').trim()
  if (input.length === 0) return { error: null, notice: null, limit: null }

  const r = await runConversationTurn({ userId: user.id, sessionId, input, requestId: String(form.get('requestId') ?? '') || undefined })
  if (!r.ok) {
    switch (r.reason) {
      case 'usage': return { error: exceededMessage(r.error), notice: null, limit: { plan: r.error.plan, resetsAt: r.error.resetsAt.toISOString() } }
      case 'budget': return fail(COPY.error.budget)
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
      case 'generation': return fail(COPY.error.generation)
      case 'safety': return fail('이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.')
      default: return { error: null, notice: null, limit: null }
    }
  }
  revalidatePath(`/chat/${sessionId}`)
  return { succeeded: true, error: null, notice: r.providerMode === 'mock' ? COPY.status.mockLLM : null, limit: null }
}

/** 출력 스타일 변경 (n29). */
export async function setOutputStyle(sessionId: string, style: string): Promise<void> {
  const user = await requireUser()
  if (!['messenger', 'balanced', 'narrative'].includes(style)) return

  await db.update(roleplaySessions)
    .set({ outputStyle: style as 'messenger' | 'balanced' | 'narrative' })
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id)))

  revalidatePath(`/chat/${sessionId}`)
}
