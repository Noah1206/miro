'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, memories, messages } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor } from '@/lib/ops/safety'
import { auxiliaryLLM } from '@/lib/simulation/mock-llm'
import { msg } from '@/lib/i18n'

import { SUGGEST_OUT as Out, SUGGEST_SYSTEM as SYSTEM, type Suggestion } from '@/lib/suggest-prompt'
export type { Suggestion }

/**
 * 추천 답변(11/3, 제타식) — 유저 다음 말 후보 3개. 차감 없음(보조 모델). 언베일이 켜진 방은 성인 모델로.
 * 11/11 사용자: 대화 맥락에 맞게 — 지금 상황(장소·시간) + 지금까지(중요한 기억) + 최근 대화 8개(캐릭터 답은 끝부분 = 방금 순간),
 * 다시 받기로 숨긴 턴은 뺀다(예전엔 섞였고, 줄당 앞 350자만 봐서 답 끝의 지금 순간이 잘렸다).
 */
export async function suggestReplies(sessionId: string): Promise<{ options: Suggestion[] } | { error: string }> {
  const user = await requireUser()
  // 방 확인과 최근 대화를 한 바퀴에 읽는다 — 대화는 방 주인이 확인된 뒤에만 쓴다.
  const [loaded, rows, mem] = await Promise.all([loadSession(sessionId, user.id, '', { view: true }),
    db.select({ role: messages.role, content: messages.content, blocks: messages.blocks }).from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'text'), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator'])))
      .orderBy(desc(messages.turnIndex), desc(messages.createdAt)).limit(8),
    db.select({ content: memories.content }).from(memories).where(eq(memories.sessionId, sessionId)).orderBy(desc(memories.importance), desc(memories.createdAt)).limit(4)])
  if (!loaded || loaded.restricted) return { error: msg('대화를 찾을 수 없습니다.') }
  const who = (r: string) => (r === 'user' ? '유저' : r === 'narrator' ? '서술' : loaded.characterName)
  // 캐릭터 답은 서술·행동·대사만, 길면 끝부분(방금 순간)을 남긴다. 마지막 답은 더 길게.
  const text = (r: typeof rows[number]) => {
    const blocks = (r.blocks as Array<{ type?: string; text?: string }> | null) ?? []
    return (blocks.filter(b => b.type && ['narrative', 'action', 'dialogue'].includes(b.type)).map(b => b.text).filter(Boolean).join(' ') || r.content).replace(/\s+/g, ' ')
  }
  const ordered = rows.reverse()
  const recent = ordered.map((r, i) => { const t = text(r), max = i === ordered.length - 1 ? 1200 : 400; return `${who(r.role)}: ${t.length > max ? `…${t.slice(-max)}` : t}` }).join('\n')
  const world = loaded.snapshot.world
  const place = [world.currentLocation, world.currentTime].filter(Boolean).join(' · ')
  const history = mem.map(m => `- ${m.content.slice(0, 200)}`).join('\n')
  const persona = loaded.snapshot.userPersona
  // 11/4: 최근 6줄만 보면 장면을 거꾸로 읽는다(괴롭힘 고백 → '좋아해요'). 시작 상황을 같이 준다.
  const start = loaded.snapshot.character.worldRole.startingContext
  const adult = (await adultModeGateFor(user.id, loaded.characterId, sessionId)).allowed
  const llm = auxiliaryLLM(loaded.characterName, { userId: user.id, sessionId, requestId: randomUUID(), workload: 'interactive', origin: 'chat:suggest', adult })
  try {
    const { options } = await llm.generateStructured({ task: 'semantic_event', promptVersion: 'suggest-replies:v5', maxTokens: 450, schema: Out, system: SYSTEM,
      prompt: `캐릭터: ${loaded.characterName}\n${start ? `시작 상황(유저 시점): ${start.slice(0, 500)}\n` : ''}${persona ? `유저 페르소나: ${persona.name}${persona.description ? ` — ${persona.description}` : ''}\n` : ''}${place ? `지금 상황: ${place}\n` : ''}${history ? `지금까지:\n${history}\n` : ''}\n최근 대화(맨 아래가 방금):\n${recent || '(아직 없음)'}` })
    return { options: options.map(o => ({ say: o.say.replace(/^["“]|["”]$/g, '').trim(), act: o.act.trim() })).filter(o => o.say || o.act) }
  } catch {
    return { error: msg('추천 답변을 만들지 못했어요. 다시 눌러 주세요.') }
  }
}
