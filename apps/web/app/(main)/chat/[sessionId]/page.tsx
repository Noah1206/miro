import { notFound, redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { db, messages, realityContacts } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { matureGateFor } from '@/lib/ops/safety'
import { track } from '@/lib/analytics/track'
import { Back, Tip } from '@/components/ui'
import { COPY } from '@/lib/copy'
import { IncomingCall } from '@/components/incoming-call'
import { ChatComposer } from './composer'
import { MediaBar } from './media-bar'
import { MessageList, type Msg } from './messages'
import { StylePicker } from './style-picker'
import { ContextTrigger, type ContextData } from './context'

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) notFound()

  const [history, opened] = await Promise.all([
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))).returning({ id: realityContacts.id }),
  ])
  if (opened.length > 0) void track(user.id, 'reality_contact_opened', { sessionId, count: opened.length })

  const s = loaded.snapshot
  const mature = await matureGateFor(user.id, loaded.characterId)
  const ctx: ContextData = {
    name: loaded.characterName, location: s.world.currentLocation, time: s.world.currentTime, status: loaded.characterStatus,
    relationship: stageLabel(s.relationship.stage, s.relationship),
    scene: s.scene ? { mood: s.scene.mood, weather: s.scene.weather } : null,
    events: s.activeEvents.map((e) => ({ type: e.type, summary: String((e.continuationState as { summary?: string }).summary ?? e.type) })),
    npcs: s.activeNpcs.map((n) => n.name),
  }
  const items: Msg[] = history.map((m) => ({
    id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
    content: m.hiddenAt ? '운영 정책에 따라 숨김 처리된 메시지입니다.' : m.content,
    blocks: m.blocks as Array<Record<string, unknown>>,
  }))

  return (
    <main id="main" tabIndex={-1} className="chat-layout" style={{ outline: 'none' }}>
      <IncomingCall userId={user.id} characterName={loaded.characterName} />
      <section className="chat-main">
        <header className="chat-header" style={{ position: 'sticky', top: 0, zIndex: 15, padding: '10px var(--space-4)', background: 'rgba(10,10,11,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
          <Back href="/archive" />
          <ContextTrigger d={ctx}>
            <h1 className="t-title-3 t-name" style={{ lineHeight: 1.2 }}>{loaded.characterName}</h1>
            <p className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.world.currentLocation} · {s.world.currentTime}{s.world.worldStatus ? ` · ${s.world.worldStatus}` : ''}
            </p>
            {loaded.characterStatus && <p className="t-caption" style={{ color: 'var(--color-text-primary)' }}>{loaded.characterStatus}</p>}
          </ContextTrigger>
          <StylePicker sessionId={sessionId} current={s.outputStyle} label={COPY.a11y.styleGroup} />
        </header>
      <Tip id="chat" style={{ margin: '0 var(--space-5) var(--space-4)' }}>*별표* 안에 행동을 적으면 서술이 됩니다. 앱을 닫아도 이 사람이 먼저 연락할 수 있어요.</Tip>

        <div style={{ flex: 1, padding: 'var(--space-5) var(--space-4) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {loaded.restricted && <p data-restricted role="status" className="t-caption" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>운영 정책에 따라 이 역할극은 제한되었습니다.</p>}
          {history.length === 0 && s.character.worldRole.startingContext && (
            <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.85, padding: 'var(--space-5) var(--space-3)' }}>{s.character.worldRole.startingContext}</p>
          )}
          {s.activeEvents[0] && (
            <aside style={{ padding: '14px 16px', borderLeft: '2px solid var(--color-accent)', background: 'var(--color-surface-1)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
              <h2 className="t-micro" style={{ marginBottom: 4 }}>지금 이 세계에서</h2>
              <p className="t-body t-quote">{ctx.events[0]!.summary}</p>
            </aside>
          )}
          <MessageList items={items} characterName={loaded.characterName} />
        </div>

        <MediaBar sessionId={sessionId} matureAllowed={mature.allowed} />
        <ChatComposer sessionId={sessionId} characterName={loaded.characterName} />
      </section>

    </main>
  )
}
