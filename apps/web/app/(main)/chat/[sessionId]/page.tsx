import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { db, messages, realityContacts } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { ChatComposer, StylePicker } from './composer'
import { MediaBar } from './media-bar'
import { IncomingCall } from '@/components/incoming-call'
import { matureGateFor } from '@/lib/ops/safety'

export default async function ChatPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { sessionId } = await params
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) notFound()

  const [history] = await Promise.all([
    db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    // 재진입 — 확인하지 않은 선연락을 열람 처리한다 (재진입 이벤트).
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))),
  ])

  const { snapshot: s } = loaded
  const activeEvent = s.activeEvents[0]
  const mature = await matureGateFor(user.id, loaded.characterId)

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <IncomingCall userId={user.id} characterName={loaded.characterName} />
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
          {loaded.characterStatus && (
            <p style={{ fontSize: 11, color: 'var(--accent-strong)', margin: '2px 0 0' }}>
              {loaded.characterStatus}
            </p>
          )}
        </div>
        <StylePicker sessionId={sessionId} current={s.outputStyle} />
      </header>

      <div style={{ flex: 1, padding: '20px 20px 8px', display: 'flex',
                    flexDirection: 'column', gap: 14 }}>
        {history.length === 0 && (
          <Opening text={s.character.worldRole.startingContext} />
        )}

        {activeEvent && <EventCard type={activeEvent.type} state={activeEvent.continuationState} />}

        {loaded.restricted && (
          <p data-restricted role="status" style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--accent-strong)' }}>운영 정책에 따라 이 역할극은 제한되었습니다.</p>
        )}
        {history.map((m) => (
          <Bubble key={m.id} id={m.id} role={m.role} kind={m.hiddenAt ? 'hidden' : m.kind}
                  content={m.hiddenAt ? '운영 정책에 따라 숨김 처리된 메시지입니다.' : m.content}
                  blocks={m.blocks as Array<Record<string, unknown>>} />
        ))}
      </div>

      <MediaBar sessionId={sessionId} matureAllowed={mature.allowed} />
      <ChatComposer sessionId={sessionId} />
    </main>
  )
}

function RealityTag({ sender, channel }: { sender?: string; channel?: string }) {
  return (
    <p style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--accent-strong)', margin: 0 }}>
      {[sender, channel].filter(Boolean).join(' · ')}
    </p>
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

function ReportLink({ id, kind }: { id: string; kind: string }) {
  // n30 — 개별 콘텐츠 단위 신고 진입점. 사용자 자신의 메시지는 신고 대상이 아니다.
  return (
    <Link href={`/report?type=${kind === 'photo' ? 'photo' : 'message'}&id=${id}`} aria-label="신고"
      style={{ fontSize: 10.5, color: 'var(--text-secondary)', opacity: .7, alignSelf: 'flex-start', marginTop: 2 }}>신고</Link>
  )
}

function Bubble({ id, role, kind, content, blocks }: {
  id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>>
}) {
  const mine = role === 'user'
  const reality = blocks.find((b) => b.type === 'reality') as
    { senderLabel?: string; channelLabel?: string; caption?: string | null } | undefined

  if (kind === 'photo') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {reality && <RealityTag sender={reality.senderLabel} channel={reality.channelLabel} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content} alt="캐릭터가 보낸 사진" style={{
          maxWidth: '68%', borderRadius: 14, border: '1px solid var(--border)',
          display: 'block',
        }} />
        {reality?.caption && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{reality.caption}</p>
        )}
        <ReportLink id={id} kind="photo" />
      </div>
    )
  }

  if (kind === 'hidden') {
    return <p data-hidden-message style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>{content}</p>
  }

  if (kind === 'call_record') {
    return (
      <p data-call-record style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>
        ☏ {content}
      </p>
    )
  }

  if (kind === 'reality_message') {
    // 캐릭터가 먼저 보낸 연락. 세계관 표현(편지/문자/사내 메신저)을 함께 보여준다.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <RealityTag sender={reality?.senderLabel} channel={reality?.channelLabel} />
        <div data-reality-message style={{
          maxWidth: '82%', padding: '11px 14px', borderRadius: 14,
          background: 'var(--elevated)', border: '1px solid var(--accent)',
          fontSize: 14.5, lineHeight: 1.72, whiteSpace: 'pre-wrap',
        }}>
          {content}
        </div>
        <ReportLink id={id} kind="message" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%', padding: '11px 14px', borderRadius: 14,
        background: mine ? 'var(--accent)' : 'var(--surface)',
        border: mine ? 'none' : '1px solid var(--border)',
        fontSize: 14.5, lineHeight: 1.72, whiteSpace: 'pre-wrap',
      }}>
        {content}
      </div>
      {!mine && <ReportLink id={id} kind="message" />}
    </div>
  )
}
