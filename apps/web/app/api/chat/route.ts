import { NextResponse } from 'next/server'
import { getAlphaSession, saveAlphaSession, clientIp } from '@/lib/alpha/session'
import { applyUserMessage } from '@/lib/alpha/relationship'
import { buildPrompt, cleanReply, type AlphaMessage } from '@/lib/alpha/prompt'
import { checkLimits, recordCall, type LimitKind } from '@/lib/alpha/limits'
import { resolveAlphaAI } from '@/lib/alpha/ai'
import { REALITY_DELAYS_MS, REPLY_DELAY_MS, fallbackReply, realityLines, type RealityTrigger } from '@/lib/alpha/character'
import { trackAlpha } from '@/lib/alpha/track'
import { observe } from '@/lib/observe'

export const runtime = 'nodejs'

/** 최근 몇 마디만 프롬프트에 싣는다 — 전체 대화를 보내지 않는다. */
const RECENT = 8
/** 리얼리티 메시지를 본 뒤 이만큼 더 이야기하면 가장 재밌는 순간에 끊는다. */
const CLIFF_AFTER_REALITY = 6
const CLIFF_HARD = 10

export type ChatResponse = {
  reply: string
  delayMs: number
  followUp?: { lines: string[]; delaysMs: number[] }
  wow?: boolean
  cliffhanger?: boolean
  limit?: LimitKind
}

/**
 * Browser → /api/chat → 관계 엔진 → 프롬프트 → AI Provider → 대사.
 * AI 는 여기서만 호출된다. 한도에 걸리면 호출 없이 limit 만 돌려준다.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getAlphaSession()
  if (!session) return NextResponse.json({ error: 'no_session' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const ip = await clientIp()
  const limit = await checkLimits(session.id, ip)
  if (limit) return NextResponse.json({ reply: '', delayMs: 0, limit } satisfies ChatResponse)

  // 1) 관계 — 우리 코드가 바꾼다.
  const applied = applyUserMessage(session.state, text)
  const now = new Date()
  session.state = applied.state
  session.memories = [...session.memories, ...applied.memories].slice(-6)
  session.messages = [...session.messages, { role: 'user', text, at: now.toISOString() } satisfies AlphaMessage]
  session.userMessages += 1
  const wowNow = applied.wow && !session.wowAt
  if (wowNow) session.wowAt = now

  // 2) 대사 — AI 는 여기에만.
  const { system, prompt } = buildPrompt({ state: session.state, memories: session.memories, recent: session.messages.slice(-RECENT) })
  await recordCall(session.id, ip)
  let reply = ''
  try {
    reply = cleanReply(await resolveAlphaAI().generateResponse({ system, prompt, maxTokens: 160 }))
  } catch (e) {
    observe('alpha.ai_failed', { error: (e as Error).message })
  }
  if (!reply) reply = fallbackReply(session.state.currentMood, session.userMessages)
  session.messages = [...session.messages, { role: 'character', text: reply, at: new Date().toISOString() }]

  // 3) 리얼리티 메시지 — 문턱을 처음 넘는 순간, 미리 쓴 대사로. 세션에 한 번.
  let followUp: ChatResponse['followUp']
  if (!session.realityAt) {
    const trigger: RealityTrigger | null =
      session.state.jealousy >= 45 ? 'jealousy_high'
        : session.state.anger >= 55 ? 'anger_high'
          : session.state.affection >= 75 ? 'affection_high' : null
    if (trigger) {
      const lines = realityLines(trigger, session.memories)
      followUp = { lines, delaysMs: REALITY_DELAYS_MS.slice(0, lines.length) }
      session.realityAt = new Date()
      session.messages = [...session.messages, ...lines.map((t) => ({ role: 'character' as const, text: t, at: new Date().toISOString() }))]
    }
  }

  // 4) 클리프행어 — 리얼리티를 본 뒤 몇 마디, 또는 충분히 오래 이야기했을 때 한 번.
  let cliffhanger = false
  if (!session.cliffAt && ((session.realityAt && session.userMessages >= CLIFF_AFTER_REALITY) || session.userMessages >= CLIFF_HARD)) {
    cliffhanger = true
    session.cliffAt = new Date()
  }

  await saveAlphaSession(session)

  if (session.userMessages === 1) trackAlpha(session.id, 'first_message_sent')
  if (session.userMessages === 3) trackAlpha(session.id, 'third_message_sent')
  if (wowNow) trackAlpha(session.id, 'wow_event_triggered', { rule: applied.fired[0] ?? 'delta' })

  return NextResponse.json({
    reply, delayMs: REPLY_DELAY_MS[session.state.currentMood], followUp, wow: wowNow || undefined, cliffhanger: cliffhanger || undefined,
  } satisfies ChatResponse)
}
