'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, messages } from '@miro/db'
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
- 바로 앞 캐릭터의 말과 지금 장면에 자연스럽게 이어진다. 유저 페르소나가 있으면 그 사람답게.
- 캐릭터의 대사·속마음은 쓰지 않는다. 설명·번호·이모지 없이. 최근 대화와 같은 언어로 쓴다.`

/** 추천 답변(11/3, 제타식) — 최근 대화로 유저 다음 말 후보 3개. 차감 없음(보조 모델). 언베일이 켜진 방은 성인 모델로. */
export async function suggestReplies(sessionId: string): Promise<{ options: Suggestion[] } | { error: string }> {
  const user = await requireUser()
  const loaded = await loadSession(sessionId, user.id, '', { view: true })
  if (!loaded || loaded.restricted) return { error: msg('대화를 찾을 수 없습니다.') }
  const rows = await db.select({ role: messages.role, content: messages.content }).from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'text'))).orderBy(desc(messages.turnIndex), desc(messages.createdAt)).limit(12)
  const who = (r: string) => (r === 'user' ? '유저' : r === 'narrator' ? '서술' : loaded.characterName)
  const recent = rows.reverse().map(r => `${who(r.role)}: ${r.content.slice(0, 500)}`).join('\n')
  const persona = loaded.snapshot.userPersona
  const adult = (await adultModeGateFor(user.id, loaded.characterId, sessionId)).allowed
  const llm = auxiliaryLLM(loaded.characterName, { userId: user.id, sessionId, requestId: randomUUID(), workload: 'interactive', origin: 'chat:suggest', adult })
  try {
    const { options } = await llm.generateStructured({ task: 'semantic_event', promptVersion: 'suggest-replies:v1', maxTokens: 500, schema: Out, system: SYSTEM,
      prompt: `캐릭터: ${loaded.characterName}\n${persona ? `유저 페르소나: ${persona.name}${persona.description ? ` — ${persona.description}` : ''}\n` : ''}\n최근 대화:\n${recent || '(아직 없음)'}` })
    return { options: options.map(o => ({ say: o.say.replace(/^["“]|["”]$/g, '').trim(), act: o.act.trim() })).filter(o => o.say || o.act) }
  } catch {
    return { error: msg('추천 답변을 만들지 못했어요. 다시 눌러 주세요.') }
  }
}
