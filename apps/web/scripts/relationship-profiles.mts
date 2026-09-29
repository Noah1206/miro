/**
 * 관계 성격표가 없거나 설정이 바뀐 미로 캐릭터의 표를 만든다 — 저장 때 만들기 전부터 있던 캐릭터, 만들기가 실패했던 캐릭터.
 * 기본은 대상 목록만 보여 준다. --apply 를 붙여야 모델을 부른다(캐릭터당 한 번, 약 $0.01). 작성자가 고친 칸은 남는다.
 *
 *   DATABASE_URL=... AI_PROVIDER=gemini GEMINI_API_KEY=... MIRO_MODEL_REGISTRY=... npx tsx scripts/relationship-profiles.mts [--apply]
 */
const { and, eq, isNull } = await import('drizzle-orm')
const { db, characters } = await import('@miro/db')
const { profileStatus, refreshRelationshipProfile } = await import('../lib/relationship-profile')
const apply = process.argv.includes('--apply')
const rows = await db.select().from(characters)
  .where(and(eq(characters.experienceType, 'reality'), eq(characters.isDraft, false), isNull(characters.deletedAt)))
const refresh = (c: typeof rows[number]) => refreshRelationshipProfile(c.id, c.ownerId).catch((e: Error) => `failed: ${e.message}`)
for (const c of rows) {
  const { status } = profileStatus(c)
  if (status === 'ready') continue
  if (!apply) { console.log(c.id, c.name, status, '(dry run)'); continue }
  let result = await refresh(c)
  // 공급자 동시 실행 제한·일시 오류는 잠깐 뒤 한 번만 다시 — 그래도 실패하면 다음 실행이나 캐릭터 저장이 다시 만든다.
  if (result.startsWith('failed')) { await new Promise(r => setTimeout(r, 3000)); result = await refresh(c) }
  console.log(c.id, c.name, status, result)
}
process.exit(0)
