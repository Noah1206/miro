import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { asc, desc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { ensureSceneBackground } from './actions'
import { LiveComposer } from './composer'

/**
 * Live Scene — 중요 장면의 몰입 모드.
 * Chat 과 같은 Simulation State 를 쓰며, 자유 입력을 항상 허용한다.
 */
export default async function LiveScene({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { sessionId } = await params
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) notFound()

  const [background, recent] = await Promise.all([
    ensureSceneBackground(sessionId),
    db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.turnIndex), desc(messages.createdAt))
      .limit(4),
  ])

  const s = loaded.snapshot
  const latest = [...recent].reverse()

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      position: 'relative',
      background: background
        ? `linear-gradient(rgba(14,14,16,0.62), rgba(14,14,16,0.93)), url(${background}) center/cover`
        : 'var(--bg)',
    }}>
      <header style={{ padding: '16px 20px', display: 'flex',
                       alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href={`/chat/${sessionId}`} style={{
          fontSize: 12.5, color: 'var(--text-secondary)',
          padding: '7px 12px', borderRadius: 999,
          background: 'rgba(23,23,26,0.75)', border: '1px solid var(--border)',
        }}>
          ‹ 대화로
        </Link>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0 }}>
          {s.world.currentLocation} · {s.world.currentTime}
        </p>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                    justifyContent: 'flex-end', padding: '20px 20px 8px', gap: 12 }}>
        {latest.map((m) => (
          <p key={m.id} style={{
            fontSize: m.role === 'user' ? 14 : 15.5,
            lineHeight: 1.85, margin: 0, whiteSpace: 'pre-wrap',
            color: m.role === 'user' ? 'var(--text-secondary)' : 'var(--text-primary)',
            textShadow: '0 1px 12px rgba(0,0,0,0.6)',
          }}>
            {m.content}
          </p>
        ))}
      </div>

      <LiveComposer sessionId={sessionId} characterName={loaded.characterName} />
    </main>
  )
}
