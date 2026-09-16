import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { db, adminActions, characters, roleplaySessions, users } from '@miro/db'

export type ExperienceType = 'chat' | 'reality'

/** 지정 화면 목록. 삭제된 캐릭터는 뺀다. 대화 수는 유형을 바꿀 때 무엇이 영향받는지 보여 준다. */
export async function listCharactersForAdmin(type: ExperienceType | 'all' = 'all') {
  return db.select({
    id: characters.id, name: characters.name, slug: characters.slug,
    isOfficial: characters.isOfficial, isPublic: characters.isPublic, isDraft: characters.isDraft,
    experienceType: characters.experienceType, createdAt: characters.createdAt,
    ownerEmail: users.email,
    sessions: sql<number>`(select count(*)::int from roleplay_sessions s where s.character_id = ${characters.id} and s.deleted_at is null)`,
    pendingIntents: sql<number>`(select count(*)::int from roleplay_sessions s where s.character_id = ${characters.id} and s.pending_reality_intent is not null)`,
  })
    .from(characters)
    .leftJoin(users, eq(users.id, characters.ownerId))
    .where(and(isNull(characters.deletedAt), ...(type === 'all' ? [] : [eq(characters.experienceType, type)])))
    .orderBy(desc(characters.experienceType), desc(characters.createdAt))
    .limit(300)
}

export type SetTypeResult =
  | { result: 'changed'; from: ExperienceType; clearedIntents: number; cancelledPushes: number }
  | { result: 'unchanged' }

/**
 * 캐릭터를 미로(reality)에 넣거나 홈(chat)으로 되돌린다. 운영자 전용.
 *
 * 기획이 정한 대로 유형 전환은 "기존 세션·발송 큐 처리까지 포함한 별도 운영 작업" 이다.
 * 그래서 chat 으로 되돌릴 때는 같은 트랜잭션에서 그 캐릭터 세션에 남은 선연락 의도를 지우고,
 * 아직 나가지 않은 Push 를 취소한다 — 유형이 바뀐 뒤 늦게 나가는 연락이 없게.
 * reality 로 넣을 때는 정리할 것이 없다. 세션이 그때부터 스케줄러 후보가 될 뿐이다.
 *
 * 조건부 UPDATE 라 이미 그 유형이면 아무것도 하지 않고 감사 기록도 남기지 않는다.
 */
export async function setExperienceType(adminId: string, characterId: string, type: ExperienceType, note = ''): Promise<SetTypeResult> {
  return db.transaction(async (tx) => {
    const [changed] = await tx.update(characters).set({ experienceType: type })
      .where(and(eq(characters.id, characterId), ne(characters.experienceType, type), isNull(characters.deletedAt)))
      .returning({ id: characters.id })
    if (!changed) return { result: 'unchanged' }
    const from: ExperienceType = type === 'reality' ? 'chat' : 'reality'

    let clearedIntents = 0, cancelledPushes = 0
    if (type === 'chat') {
      const cleared = await tx.update(roleplaySessions).set({ pendingRealityIntent: null })
        .where(and(eq(roleplaySessions.characterId, characterId), sql`${roleplaySessions.pendingRealityIntent} is not null`))
        .returning({ id: roleplaySessions.id })
      clearedIntents = cleared.length
      const cancelled = await tx.execute<{ id: string }>(sql`
        update reality_push_jobs j set status = 'cancelled', lease_token = null, lease_until = null
         where j.status in ('pending', 'sending')
           and j.contact_id in (
             select rc.id from reality_contacts rc
               join roleplay_sessions s on s.id = rc.session_id
              where s.character_id = ${characterId})
        returning j.id`)
      cancelledPushes = cancelled.length
    }

    await tx.insert(adminActions).values({
      adminId, action: type === 'reality' ? 'character_set_reality' : 'character_set_chat',
      characterId, previousStatus: from, newStatus: type, note,
    })
    return { result: 'changed', from, clearedIntents, cancelledPushes }
  })
}
