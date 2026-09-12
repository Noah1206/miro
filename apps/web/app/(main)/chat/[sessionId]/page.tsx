import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { db, characters, roleplaySessions, worldStates } from '@miro/db'
import { currentUser } from '@/lib/auth'

/** Phase 4 에서 자유 RP 엔진으로 대체된다. 지금은 세션 상태 복구만 검증한다. */
export default async function ChatPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { sessionId } = await params
  const rows = await db
    .select({
      characterName: characters.name,
      location: worldStates.currentLocation,
      time: worldStates.currentTime,
    })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .where(and(
      eq(roleplaySessions.id, sessionId),
      eq(roleplaySessions.userId, user.id),   // 본인 세션만 조회 가능
      isNull(roleplaySessions.deletedAt),
    ))
    .limit(1)

  const s = rows[0]
  if (!s) notFound()

  return (
    <main style={{ minHeight: '100dvh', padding: 24 }}>
      <header style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
        <h1 style={{ fontSize: 17, margin: '0 0 4px' }}>{s.characterName}</h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
          {s.location} · {s.time}
        </p>
      </header>
      <p style={{ marginTop: 40, color: 'var(--text-secondary)', fontSize: 14 }}>
        자유 역할극 엔진은 Phase 4에서 연결됩니다.
      </p>
    </main>
  )
}
