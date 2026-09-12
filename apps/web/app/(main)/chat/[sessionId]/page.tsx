import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { ChatComposer, StylePicker } from './composer'
import { MediaBar } from './media-bar'

export default async function ChatPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { sessionId } = await params
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) notFound()

  const history = await db.select().from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))

  const { snapshot: s } = loaded
  const activeEvent = s.activeEvents[0]

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* 상단: 캐릭터 이름 + 현재 장소/상태 (명세서 3.1 표시) */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Link href="/archive" style={{ fontSize: 19, color: 'var(--text-secondary)' }}>‹</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 15.5, margin: 0, fontWeight: 600 }}>{loaded.characterName}</h1>
          <p style={{
            fontSize: 11.5, color: 'var(--text-secondary)', margin: '2px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {s.world.currentLocation} · {s.world.currentTime}
            {s.world.worldStatus ? ` · ${s.world.worldStatus}` : ''}
          </p>
        </div>
        <StylePicker sessionId={sessionId} current={s.outputStyle} />
      </header>

      <div style={{ flex: 1, padding: '20px 20px 8px', display: 'flex',
                    flexDirection: 'column', gap: 14 }}>
        {history.length === 0 && (
          <Opening text={s.character.worldRole.startingContext} />
        )}

        {activeEvent && <EventCard type={activeEvent.type} state={activeEvent.continuationState} />}

        {history.map((m) => (
          <Bubble key={m.id} role={m.role} kind={m.kind} content={m.content} />
        ))}
      </div>

      <MediaBar sessionId={sessionId} />
      <ChatComposer sessionId={sessionId} />
    </main>
  )
}

function Opening({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p style={{
      fontSize: 13.5, lineHeight: 1.8, color: 'var(--text-secondary)',
      textAlign: 'center', padding: '20px 12px', margin: 0,
      borderBottom: '1px solid var(--border)',
    }}>
      {text}
    </p>
  )
}

/** 사건은 Chat 안의 카드로 표시한다 (명세서 4.2 표시). */
function EventCard({ type, state }: { type: string; state: Record<string, unknown> }) {
  const summary = typeof state.summary === 'string' ? state.summary : null
  return (
    <aside style={{
      border: `1px solid var(--accent)`, borderRadius: 12, padding: '12px 14px',
      background: 'var(--elevated)',
    }}>
      <p style={{ fontSize: 10.5, letterSpacing: '0.1em', color: 'var(--accent-strong)',
                  margin: '0 0 4px' }}>
        진행 중
      </p>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{summary ?? type}</p>
    </aside>
  )
}

function Bubble({ role, kind, content }: { role: string; kind: string; content: string }) {
  const mine = role === 'user'

  if (kind === 'photo') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content} alt="캐릭터가 보낸 사진" style={{
          maxWidth: '68%', borderRadius: 14, border: '1px solid var(--border)',
          display: 'block',
        }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%', padding: '11px 14px', borderRadius: 14,
        background: mine ? 'var(--accent)' : 'var(--surface)',
        border: mine ? 'none' : '1px solid var(--border)',
        fontSize: 14.5, lineHeight: 1.72, whiteSpace: 'pre-wrap',
      }}>
        {content}
      </div>
    </div>
  )
}
