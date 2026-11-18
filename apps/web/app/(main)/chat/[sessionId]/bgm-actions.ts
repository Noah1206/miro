'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { characters, db, messages, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { adultModeGateFor } from '@/lib/ops/safety'
import { auxiliaryLLM } from '@/lib/simulation/mock-llm'

const Choice = z.object({ pick: z.number().int().min(0).max(50) })

/**
 * 11/19 상황별 BGM 고르기 — 방금 대화(유저 말 + 캐릭터 답)를 보고 만든 사람이 적은 상황 중 지금 맞는 곡 하나. 차감 없음(보조 모델).
 * 맞는 게 없으면 기본 곡(상황이 빈 곡), 그것도 없으면 null(음악을 끈다). current = 지금 나오는 곡 — 여전히 맞으면 그대로 둔다.
 */
export async function pickBgm(sessionId: string, current: string | null): Promise<string | null> {
  const user = await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null
  const [room] = await db.select({ bgm: characters.bgm, name: characters.name, characterId: characters.id }).from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  const tracks = room?.bgm ?? []
  if (!room || !tracks.length) return null
  const fallback = tracks.find(t => !t.situation)?.url ?? null
  const situational = tracks.filter(t => t.situation)
  if (!situational.length) return fallback
  const rows = await db.select({ role: messages.role, content: messages.content }).from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.kind, 'text'), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator'])))
    .orderBy(desc(messages.turnIndex), desc(messages.createdAt)).limit(3)
  if (!rows.length) return fallback
  const recent = rows.reverse().map(r => `${r.role === 'user' ? '유저' : room.name}: ${r.content.replace(/\s+/g, ' ').slice(-900)}`).join('\n')
  const now = situational.findIndex(t => t.url === current) + 1
  const list = situational.map((t, i) => `${i + 1}. ${t.situation}`).join('\n')
  const adult = (await adultModeGateFor(user.id, room.characterId, sessionId)).allowed
  const llm = auxiliaryLLM(room.name, { userId: user.id, sessionId, requestId: randomUUID(), workload: 'interactive', origin: 'chat:bgm', adult })
  try {
    const { pick } = await Promise.race([
      llm.generateStructured({ schema: Choice, task: 'semantic_event', promptVersion: 'bgm:v1', temperature: 0, maxTokens: 32, maxRetries: 1,
        responseSchema: { type: 'object', properties: { pick: { type: 'integer', minimum: 0 } }, required: ['pick'] },
        system: '캐릭터 채팅의 배경음악을 고른다. 만든 사람이 곡마다 적어 둔 상황 중, 대화 맨 아래(방금)의 분위기·장면에 맞는 곡 하나의 번호를 고른다. '
          + '지금 나오는 곡이 여전히 맞으면 그 번호를 그대로 고른다(분위기가 분명히 바뀌었을 때만 바꾼다). 맞는 곡이 없으면 0. 반드시 {"pick": 번호} JSON 하나로만 답한다.',
        prompt: `## 상황 목록\n${list}\n\n## 지금 나오는 곡\n${now || '없음'}\n\n## 최근 대화(맨 아래가 방금)\n${recent}` }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('bgm timeout')), 8000)),
    ])
    return pick >= 1 && pick <= situational.length ? situational[pick - 1]!.url : fallback
  } catch {
    return current ?? fallback   // 고르기에 실패하면 지금 곡을 그대로
  }
}
