import { and, eq, ilike, isNull, ne, sql } from 'drizzle-orm'
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

/** 이 작품으로 진행 중인 대화방이 있는지 — 있으면 소개 페이지가 '처음부터 다시 하기'(다회차)를 보인다. */
export async function hasActiveRun(characterId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.characterId, characterId), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt)))
    .limit(1)
  return !!row
}
