import { and, eq, ilike, ne, sql } from 'drizzle-orm'
import { db, messages, roleplaySessions } from '@miro/db'
import { endingTitle } from './novel-ending'

/** 엔딩 도감(11/10) — 이 사용자가 이 캐릭터와의 대화방들에서 닿은 결말 이름. 결말 표식(— ENDING · 이름 —)이 남은 답만 읽는다. */
export async function reachedEndings(characterId: string, userId: string): Promise<Set<string>> {
  const rows = await db.select({ blocks: messages.blocks }).from(messages)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, messages.sessionId))
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.characterId, characterId), ne(messages.role, 'user'),
      ilike(sql`${messages.blocks}::text`, '%ENDING%')))
    .limit(200)
  return new Set(rows.map(r => endingTitle(r.blocks)).filter((x): x is string => !!x))
}
