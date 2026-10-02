import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { Back, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { COPY } from '@/lib/copy'
import { PushSubscribe } from '@/components/push-subscribe'
import { ChatComposer } from './composer'
import { MessageList, type Msg } from './messages'
import { ChatModelProvider } from './model-picker'
import { chatModelOptions } from '@/lib/ai/chat-models'
import { ContextTrigger, type ContextData } from './context'
import { AdultToggle } from './adult-toggle'
import { TurnsProvider } from './turns'
import { sceneMessages } from '@/lib/messenger'
import { requirePersona } from '@/lib/persona'
import { getT } from '@/lib/i18n/server'

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  const session = loadSession(sessionId, user.id)
  const [loaded, all, modelOptions, mature, adult] = await Promise.all([
    session,
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    chatModelOptions(user.id),
    session.then((l) => l && matureGateFor(user.id, l.characterId)),
    session.then((l) => l && adultModeGateFor(user.id, l.characterId)),
  ])
  if (!loaded || !mature) notFound()
  // 채팅을 처음 진행하면 페르소나부터 — 캐릭터가 부를 이름과 내 소개(2026-09-29 결정). 저장하면 이 대화로 돌아온다.
  await requirePersona(loaded.snapshot.userPersona, `/chat/${sessionId}`)
  // 문자·통화 기록은 /messages 의 것이다. 여기는 만나서 나눈 장면만 — 문자로 보낸 사진도 저쪽으로.
  const history = sceneMessages(all)

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
    content: m.hiddenAt ? t('운영 정책에 따라 숨김 처리된 메시지입니다.') : m.content,
    blocks: m.blocks as Array<Record<string, unknown>>,
  }))

  return (
    <ChatModelProvider><TurnsProvider><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <h1 className={styles.title}>{loaded.characterName}</h1>
          {/* 성인 모드는 켤 수 있을 때만 보인다(성인 인증·전용 모델·성인 캐릭터). 켜져 있으면 끌 수 있게 늘 보인다. */}
          {(loaded.adult.on || adult?.allowed) && <AdultToggle sessionId={sessionId} on={loaded.adult.on} everOn={loaded.adult.since !== null} />}
          {/* 미로 캐릭터는 문자 페이지가 따로 있다 — 만나서 나누는 장면과 폰으로 주고받는 문자를 섞지 않는다. */}
          {loaded.experienceType === 'reality' && (
            <TransitionLink href={`/messages/${sessionId}`} aria-label={t('문자')} className={styles.contextButton}>
              <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /></svg>
            </TransitionLink>
          )}
          {loaded.experienceType === 'reality' && <ContextTrigger d={ctx} className={styles.contextButton}>
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h11M4 18h16" /></svg>
          </ContextTrigger>}
        </header>

        <div className={styles.transcript}>
          {/* 'AI가 생성한 대화예요' 줄은 뺐다(2026-10-02 사용자: 사람처럼 느껴져야 한다). AI 라는 안내는 가입 때 필수 동의(AI 생성 콘텐츠 안내)로 한다. */}
          {loaded.restricted && <p data-restricted role="status" className="t-caption" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{t('운영 정책에 따라 이 역할극은 제한되었습니다.')}</p>}
          {history.length === 0 && s.character.worldRole.startingContext && (
            <p className={styles.opening}>{s.character.worldRole.startingContext}</p>
          )}
          {loaded.experienceType === 'reality' && s.activeEvents[0] && (
            <aside style={{ marginBottom: 'var(--space-5)', padding: '14px 16px', borderLeft: '2px solid var(--color-accent)', background: 'var(--color-surface-1)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
              <h2 className="t-micro" style={{ marginBottom: 4 }}>{t('지금 이 세계에서')}</h2>
              <p className="t-body t-quote">{ctx.events[0]!.summary}</p>
            </aside>
          )}
          <MessageList items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} mood={s.characterState?.mood ?? 'neutral'} />
        </div>

        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 미로 캐릭터 대화방에서 알림 권한을 묻는다. */}
        {loaded.experienceType === 'reality' && <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />}
        <ChatComposer sessionId={sessionId} characterName={loaded.characterName} modelOptions={modelOptions} />
      </section>

    </main></TurnsProvider></ChatModelProvider>
  )
}
