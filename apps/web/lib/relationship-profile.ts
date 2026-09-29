import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, characters } from '@miro/db'
import { keepAuthorItems, parseRelationshipProfile, type RelationshipProfile } from '@miro/domain'
import { compileRelationshipProfile, temperamentHash, temperamentSource } from '@miro/engine'
import { createAI } from '@miro/providers'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'
import { installAIUsageSink } from '@/lib/usage/ai-usage'

type CharacterRow = typeof characters.$inferSelect
/** none: 아직 만들지 않음 · stale: 설정이 바뀌어 다시 만들 차례 · ready: 지금 설정으로 만든 표. */
export type ProfileStatus = 'none' | 'stale' | 'ready'

export function profileStatus(c: CharacterRow): { profile: RelationshipProfile | null; status: ProfileStatus } {
  const profile = parseRelationshipProfile(c.relationshipProfile)
  if (!profile) return { profile: null, status: 'none' }
  return { profile, status: profile.sourceHash === temperamentHash(temperamentSource(c)) ? 'ready' : 'stale' }
}

/**
 * 설정이 바뀐 미로 캐릭터의 관계 성격표를 다시 만든다. 이미 지금 설정으로 만든 표면 모델을 부르지 않는다.
 * 모델이 도는 사이 설정이 또 바뀌었으면 쓰지 않는다 — 그 저장이 자기 몫을 다시 만든다.
 */
export async function refreshRelationshipProfile(characterId: string, userId: string | null): Promise<'fresh' | 'updated' | 'skipped'> {
  const [row] = await db.select().from(characters).where(and(eq(characters.id, characterId), isNull(characters.deletedAt))).limit(1)
  if (!row || row.experienceType !== 'reality') return 'skipped'
  const source = temperamentSource(row)
  const hash = temperamentHash(source)
  if (parseRelationshipProfile(row.relationshipProfile)?.sourceHash === hash) return 'fresh'
  installAIUsageSink()
  // 사용자의 월 사용량은 차감하지 않는다(usageUnits 0) — 캐릭터를 저장한 대가가 아니라 서비스가 치르는 준비 비용이다.
  const llm = createAI({ mock: () => ({ reactions: [], grows: [], pace: [], moods: [], reachOut: [] }), context: {
    userId: userId ?? undefined, requestId: randomUUID(), workload: 'background', usageUnits: 0, origin: 'character:relationship-profile',
  } })
  const next = await compileRelationshipProfile(llm, source)
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update').limit(1)
    if (!current || current.deletedAt || temperamentHash(temperamentSource(current)) !== hash) return 'skipped'
    // 모델이 도는 사이 작성자가 고친 칸도 남는다 — 쓰기 직전의 표를 기준으로 얹는다.
    const merged = keepAuthorItems(next, parseRelationshipProfile(current.relationshipProfile))
    await tx.update(characters).set({ relationshipProfile: merged }).where(eq(characters.id, characterId))
    return 'updated' as const
  })
}

/** 저장 뒤에 돌린다 — 저장은 모델을 기다리지 않는다. 실패하면 표는 그대로(없으면 기본 규칙)이고, 다음 저장이 다시 시도한다. */
export async function scheduleRelationshipProfile(characterId: string, userId: string): Promise<void> {
  await afterResponse(async () => {
    try { await refreshRelationshipProfile(characterId, userId) } catch (e) {
      observe('relationship_profile.failed', { characterId, error: (e as Error).message })
    }
  })
}
