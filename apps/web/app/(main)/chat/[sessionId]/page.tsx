import { notFound, redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { db, messages, realityContacts } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { matureGateFor } from '@/lib/ops/safety'
import { track } from '@/lib/analytics/track'
import { Back } from '@/components/ui'
import styles from './chat.module.css'
import { COPY } from '@/lib/copy'
import { IncomingCall } from '@/components/incoming-call'
import { PushSubscribe } from '@/components/push-subscribe'
import { ChatComposer } from './composer'
import { MediaBar } from './media-bar'
import { feature } from '@miro/config'
import { MessageList, type Msg } from './messages'
import { ChatModelProvider, ModelPicker } from './model-picker'
import { chatModelOptions } from '@/lib/ai/chat-models'
import { ContextTrigger, type ContextData } from './context'
import { TurnsProvider } from './turns'

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  const session = loadSession(sessionId, user.id)
  const [loaded, history, opened, modelOptions, mature] = await Promise.all([
    session,
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))).returning({ id: realityContacts.id }),
    chatModelOptions(user.id),
    session.then((l) => l && matureGateFor(user.id, l.characterId)),
  ])
  if (!loaded || !mature) notFound()
  if (opened.length > 0) void track(user.id, 'reality_contact_opened', { sessionId, count: opened.length })

  const s = loaded.snapshot
  const ctx: ContextData = {
    name: loaded.characterName, location: s.world.currentLocation, time: s.world.currentTime, status: loaded.characterStatus,
    relationship: stageLabel(s.relationship.stage, s.relationship),
    scene: s.scene ? { mood: s.scene.mood, weather: s.scene.weather } : null,
    events: s.activeEvents.map((e) => ({ type: e.type, summary: String((e.continuationState as { summary?: string }).summary ?? e.type) })),
    npcs: s.activeNpcs.map((n) => n.name),
    sessionId, turnCount: s.turnCount,
  }
  const items: Msg[] = history.map((m) => ({
    id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
    content: m.hiddenAt ? '운영 정책에 따라 숨김 처리된 메시지입니다.' : m.content,
    blocks: m.blocks as Array<Record<string, unknown>>,
  }))

  return (
    <ChatModelProvider><TurnsProvider><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <IncomingCall userId={user.id} characterName={loaded.characterName} />
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <h1 className={styles.title}>{loaded.characterName}</h1>
          <ModelPicker {...modelOptions} />
          <ContextTrigger d={ctx} className={styles.contextButton}>
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h11M4 18h16" /></svg>
          </ContextTrigger>
        </header>

        <div className={styles.transcript}>
          <p className={styles.aiNotice}><svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v1" /></svg>AI가 생성한 대화예요</p>
          {loaded.restricted && <p data-restricted role="status" className="t-caption" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>운영 정책에 따라 이 역할극은 제한되었습니다.</p>}
          {history.length === 0 && s.character.worldRole.startingContext && (
            <p className={styles.opening}>{s.character.worldRole.startingContext}</p>
          )}
          {s.activeEvents[0] && (
            <aside style={{ padding: '14px 16px', borderLeft: '2px solid var(--color-accent)', background: 'var(--color-surface-1)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
              <h2 className="t-micro" style={{ marginBottom: 4 }}>지금 이 세계에서</h2>
              <p className="t-body t-quote">{ctx.events[0]!.summary}</p>
            </aside>
          )}
          <MessageList items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} mood={s.characterState?.mood ?? 'neutral'} />
        </div>

        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 미로 캐릭터 대화방에서 알림 권한을 묻는다. */}
        {loaded.experienceType === 'reality' && <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />}
        {/* 사진·통화·Live 는 미로 캐릭터의 것이다. 서버가 어차피 거절하지만, 없는 기능의 버튼을 그리지 않는다. */}
        {loaded.experienceType === 'reality' && <MediaBar sessionId={sessionId} matureAllowed={mature.allowed}
          enabled={{ photo: feature('imageGeneration'), live: feature('liveScene'), voice: feature('voiceCall'), video: feature('videoCall') }} />}
        <ChatComposer sessionId={sessionId} characterName={loaded.characterName} />
      </section>

    </main></TurnsProvider></ChatModelProvider>
  )
}
