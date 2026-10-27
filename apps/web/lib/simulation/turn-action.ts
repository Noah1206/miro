import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db, conversationRequests } from '@miro/db'
import type { TurnStream } from '@miro/engine'
import { runConversationTurn } from '@/lib/simulation/turn'
import { undoLastTurn } from '@/lib/simulation/reroll'
import { clientIp } from '@/lib/alpha/session'
import { UsageExceededError, exceededMessage, usageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { msg } from '@/lib/i18n'

export type TurnMsg = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> }

export type TurnState = {
  succeeded?: boolean
  tokensCharged?: number
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
  /** 일반 방 거절 뒤 언베일 권유(캐릭터챗만). ready=바로 켤 수 있음, verify=본인인증·동의가 남음. */
  unveil?: 'ready' | 'verify'
  /** 리롤로 되돌린 옛 턴의 메시지 — 화면이 지운다. 있으면 새 답을 못 받았어도 옛 턴은 이미 없다. */
  undone?: string[]
}

const fail = (error: string): TurnState => ({ error, notice: null, limit: null })
const exceeded = (e: UsageExceededError): TurnState => ({ error: exceededMessage(e), notice: null, limit: { plan: e.plan, resetsAt: e.resetsAt.toISOString() } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TurnOpts = { mode: 'chat' | 'messenger'; path: (sessionId: string) => string; stream?: TurnStream }

/**
 * 캐릭터챗(/chat)과 문자(/messages)가 같이 쓰는 턴 액션 본체. 폼을 읽고 파이프라인(lib/simulation/turn)을 부른 뒤
 * 결과를 화면 상태로 옮긴다. 두 페이지의 차이는 mode 와 되살릴 경로뿐이다.
 * 리롤(10/27, 캐릭터챗만): 폼에 reroll(마지막 답 id)이 있으면 그 턴을 되돌리고 같은 말을 다시 보낸다 — 보낼 말·명령어는 되돌리기 기록의 것을 쓴다.
 */
export async function turnFromForm(userId: string, form: FormData, opts: TurnOpts & { onUndone?: (ids: string[]) => void }): Promise<TurnState> {
  const reroll = opts.mode === 'chat' ? String(form.get('reroll') ?? '') : ''
  if (!reroll) return turnState(userId, form, opts)
  if (!UUID.test(reroll)) return fail(msg('이 답은 지금 다시 받을 수 없어요.'))
  // 잔액이 없으면 되돌리지 않는다 — 옛 답만 사라지고 새 답은 못 받는다.
  const balance = await usageStatus(userId)
  if (balance.remaining + balance.rechargeRemaining <= 0) return exceeded(new UsageExceededError(balance.plan, balance.resetsAt ?? new Date()))
  const undone = await undoLastTurn(userId, String(form.get('sessionId') ?? ''), reroll)
  if (!undone.ok) return fail(msg('이 답은 지금 다시 받을 수 없어요.'))
  opts.onUndone?.(undone.messageIds)
  const state = await turnState(userId, form, opts, { input: undone.input, command: undone.command ?? undefined, commandId: undone.commandId ?? undefined })
  return { ...state, undone: undone.messageIds }
}

async function turnState(userId: string, form: FormData, opts: TurnOpts, resend?: { input: string; command?: string; commandId?: string }): Promise<TurnState> {
  const sessionId = String(form.get('sessionId') ?? '')
  // 글 없이 명령어만 보내면 `/이름`이 말풍선이 된다. 지시는 서버가 캐릭터 또는 접근 가능한 라이브러리에서 찾는다.
  const command = resend ? resend.command : opts.mode === 'chat' ? String(form.get('command') ?? '').trim().replace(/^\//, '').slice(0, 12) || undefined : undefined
  const commandId = resend ? resend.commandId : opts.mode === 'chat' ? String(form.get('commandId') ?? '').trim() || undefined : undefined
  const input = resend ? resend.input : String(form.get('input') ?? '').trim() || (command ? `/${command}` : '')
  if (input.length === 0) return { error: null, notice: null, limit: null }

  const r = await runConversationTurn({ userId, sessionId, input, command, commandId, ip: await clientIp(), mode: opts.mode, chatModel: String(form.get('chatModel') ?? 'miro'), tokenCeiling: form.has('tokenCeiling') ? Number(form.get('tokenCeiling')) : undefined, requestId: String(form.get('requestId') ?? '') || undefined, stream: opts.stream })
  if (!r.ok) {
    switch (r.reason) {
      case 'command_unavailable': return fail(msg('명령어를 사용할 수 없어요. 다시 선택해 주세요.'))
      case 'usage': return exceeded(r.error)
      case 'model_unavailable': return fail(msg('선택한 모델을 사용할 수 없어요. 요금제와 모델 준비 상태를 확인해 주세요.'))
      case 'budget': return fail(r.kind === 'turn_tokens' ? msg('이번 답변의 생성 한도에 도달했어요. 토큰은 차감되지 않았어요. 입력을 줄이거나 다른 답변 길이를 선택해 주세요.') : r.kind === 'user_monthly' ? COPY.error.budgetMonthly : COPY.error.budget)
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
      case 'safety': return { ...fail(msg('이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.')), ...(opts.mode === 'chat' && r.unveil ? { unveil: r.unveil } : {}) }
      default: return { error: null, notice: null, limit: null }
    }
  }
  const messages: TurnMsg[] = (r.messages ?? []).map((m) => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, blocks: (m.blocks ?? []) as TurnMsg['blocks'] }))
  // 답은 액션이 그대로 들고 간다. 재전송으로 되살린 옛 결과에 메시지가 없을 때만 페이지를 다시 받아 온다.
  if (messages.length === 0) revalidatePath(opts.path(sessionId))
  return { succeeded: true, tokensCharged: r.tokensCharged, messages, error: null, notice: r.providerMode === 'mock' ? COPY.status.mockLLM : null, limit: null, ...(r.delayed ? { delayed: r.delayed } : {}) }
}
