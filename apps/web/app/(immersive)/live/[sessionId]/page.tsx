import { feature } from '@miro/config'
import { notFound, redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { TransitionLink } from '@/components/ui'
import { ensureSceneBackground } from './actions'
import { LiveStage } from './stage'

/** Live Scene — 장면이 화면 전체. Chat 과 같은 상태, 자유 입력은 항상. */
export default async function LiveScene({ params }: { params: Promise<{ sessionId: string }> }) {
  if (!feature('liveScene')) notFound()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const loaded = await loadSession(sessionId, user.id)
  // Live 는 미로 캐릭터의 장면이다. 일반 캐릭터챗 세션 주소로는 열리지 않는다.
  if (!loaded || loaded.restricted || loaded.experienceType !== 'reality') notFound()
  const [background, recent] = await Promise.all([
    ensureSceneBackground(sessionId),
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(desc(messages.turnIndex), desc(messages.createdAt)).limit(4),
  ])
  const s = loaded.snapshot
  return (
    <LiveStage sessionId={sessionId} characterName={loaded.characterName} background={background}
      header={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <TransitionLink href={`/chat/${sessionId}`} direction="back" className="t-caption hit" style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(10,10,11,0.6)' }}>‹ 대화로</TransitionLink>
          <p className="t-caption" style={{ textShadow: '0 1px 8px rgba(0,0,0,.7)' }}>
            {s.world.currentLocation} · {s.world.currentTime}
            {s.world.currentSceneId && <> · <TransitionLink href={`/report?type=live_scene&id=${s.world.currentSceneId}`} className="hit" style={{ textDecoration: 'underline' }}>신고</TransitionLink></>}
          </p>
        </div>
      }
      lines={[...recent].reverse().map((m) => ({ id: m.id, role: m.role, content: m.content }))} />
  )
}
