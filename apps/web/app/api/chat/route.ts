import { NextResponse } from 'next/server'
import { and, count, eq } from 'drizzle-orm'
import { db, realityContacts } from '@miro/db'
import { clientIp, getAlphaSession } from '@/lib/alpha/session'
import { REALITY_DELAY_MS, REPLY_DELAY_MS } from '@/lib/alpha/character'
import { trackAlpha } from '@/lib/alpha/track'
import { runConversationTurn, type ConversationOutcome } from '@/lib/simulation/turn'
import { COPY } from '@/lib/copy'

export const runtime = 'nodejs'

/** 리얼리티 메시지를 본 뒤 이만큼 더 이야기하면 가장 재밌는 순간에 끊는다. */
const CLIFF_AFTER_REALITY = 6
const CLIFF_HARD = 10

export type LimitKind = 'user' | 'ip' | 'global'
export type ChatResponse = {
  reply: string
  delayMs: number
  followUp?: { lines: string[]; delaysMs: number[] }
  wow?: boolean
  cliffhanger?: boolean
  limit?: LimitKind
  error?: string
}

/**
 * Browser → /api/chat → State Update Pipeline(runConversationTurn) → 대사.
 * 웹의 /chat 액션과 같은 코드가 돈다. 한도에 걸리면 AI 호출 없이 limit 만 돌려준다.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getAlphaSession()
  if (!session) return NextResponse.json({ error: 'no_session' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const ip = await clientIp()
  const r = await runConversationTurn({ userId: session.userId, sessionId: session.sessionId, input: text, ip, requestId: req.headers.get('idempotency-key') ?? undefined })
  if (!r.ok) return NextResponse.json(failure(r))

  const [reality] = await db.select({ n: count() }).from(realityContacts)
    .where(and(eq(realityContacts.sessionId, session.sessionId), eq(realityContacts.status, 'sent')))
  const realitySeen = (reality?.n ?? 0) > 0
  const cliffhanger = (realitySeen && r.turnIndex === CLIFF_AFTER_REALITY) || r.turnIndex === CLIFF_HARD
  const wow = r.firedRules.length > 0
  const followUp = r.reality && r.reality.channel !== 'status'
    ? { lines: [r.reality.text], delaysMs: [REALITY_DELAY_MS] } : undefined

  if (r.turnIndex === 1) trackAlpha(session.userId, 'first_message_sent')
  if (r.turnIndex === 3) trackAlpha(session.userId, 'third_message_sent')
  if (wow) trackAlpha(session.userId, 'wow_event_triggered', { rule: r.firedRules[0] })

  return NextResponse.json({
    reply: messengerText(r.blocks), delayMs: REPLY_DELAY_MS[r.characterState.mood],
    followUp, wow: wow || undefined, cliffhanger: cliffhanger || undefined,
  } satisfies ChatResponse)
}

/** 실패는 문장으로만 나간다 — 오류 코드나 스택은 화면에 닿지 않는다. */
function failure(r: Exclude<ConversationOutcome, { ok: true }>): ChatResponse {
  if (r.reason === 'safety') return { reply: '', delayMs: 0, error: '이 내용으로는 대화를 이어갈 수 없어요. 다른 상황으로 이야기해 주세요.' }
  if (r.reason === 'budget') return { reply: '', delayMs: 0, limit: r.kind === 'user' ? 'user' : r.kind === 'ip' ? 'ip' : 'global' }
  if (r.reason === 'usage') return { reply: '', delayMs: 0, limit: 'user' }
  if (r.reason === 'too_long') return { reply: '', delayMs: 0, error: COPY.error.tooLong(500) }
  return { reply: '', delayMs: 0, error: COPY.error.generation }
}

/** 메신저 화면용 — 대사는 그대로, 행동·서술은 *별표* 로. */
function messengerText(blocks: Extract<ConversationOutcome, { ok: true }>['blocks']): string {
  return blocks.map((b) => (b.type === 'dialogue' || b.type === 'npc' ? b.text : `*${b.text}*`)).join('\n')
}
