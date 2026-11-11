'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, memories, messages } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor } from '@/lib/ops/safety'
import { auxiliaryLLM } from '@/lib/simulation/mock-llm'
import { msg } from '@/lib/i18n'

export type Suggestion = { say: string; act: string }

const Out = z.object({ options: z.array(z.object({ say: z.string().max(80), act: z.string().max(80) })).min(1).max(3) })
const SYSTEM = `너는 롤플레이 채팅에서 사용자(유저)가 다음에 보낼 말의 후보를 만든다. 캐릭터가 아니라 유저 쪽 대사다.
- 후보 3개. 서로 방향이 달라야 한다(예: 장난스럽게 / 진지하게 / 대담하게). 같은 말의 바꿔 쓰기 금지.
- 각 후보: say = 유저가 소리 내어 하는 짧은 대사(따옴표 없이, 40자 이내), act = 유저의 짧은 행동·시선 묘사(주어 없이 과거형, 40자 이내, 예: "방 문틈으로 그 모습을 멍하니 바라보았다").
- 최근 대화의 맨 마지막(캐릭터가 방금 한 말·행동)에 대한 유저의 다음 반응이다. 그 순간 캐릭터가 물은 것에는 답하고, 요구·제안에는 응하거나 거절하는 식으로 바로 이어진다. 유저 페르소나가 있으면 그 사람답게.
- 지금 상황(장소·시간)과 지금까지의 흐름(이미 일어난 일·관계)을 전제로 한다. 이미 지난 일을 처음 일어나는 일처럼 쓰지 않는다.
- 시작 상황에 적힌 유저의 처지와 방금 일어난 일을 그대로 전제한다. 사건을 다른 일로 바꿔 읽지 않는다(예: 괴롭혔다고 털어놓은 장면을 고백으로 바꾸지 않는다). 등장인물끼리의 관계·호칭도 시작 상황을 따른다.
- 캐릭터의 대사·속마음은 쓰지 않는다. 설명·번호·이모지 없이. 최근 대화와 같은 언어로 쓴다.
- 답은 반드시 이 모양의 JSON 객체 하나: {"options":[{"say":"…","act":"…"},{"say":"…","act":"…"},{"say":"…","act":"…"}]} (배열만 내지 않는다)`

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
    const { options } = await llm.generateStructured({ task: 'semantic_event', promptVersion: 'suggest-replies:v4', maxTokens: 300, schema: Out, system: SYSTEM,
      prompt: `캐릭터: ${loaded.characterName}\n${start ? `시작 상황(유저 시점): ${start.slice(0, 500)}\n` : ''}${persona ? `유저 페르소나: ${persona.name}${persona.description ? ` — ${persona.description}` : ''}\n` : ''}${place ? `지금 상황: ${place}\n` : ''}${history ? `지금까지:\n${history}\n` : ''}\n최근 대화(맨 아래가 방금):\n${recent || '(아직 없음)'}` })
    return { options: options.map(o => ({ say: o.say.replace(/^["“]|["”]$/g, '').trim(), act: o.act.trim() })).filter(o => o.say || o.act) }
  } catch {
    return { error: msg('추천 답변을 만들지 못했어요. 다시 눌러 주세요.') }
  }
}
