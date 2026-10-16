import { ChatRoomIcon } from '@/components/chat-icons'
import { ChatTheme, ChatThemePicker, ChatHeaderAvatar } from '@/components/chat-theme'
import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db, messages } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { Back, TransitionLink } from '@/components/ui'
import styles from './chat.module.css'
import { COPY } from '@/lib/copy'
import { PushSubscribe } from '@/components/push-subscribe'
import { ChatComposer } from './composer'
import { MessageList, type Msg } from './messages'
import { ChatModelProvider, ModelPicker } from './model-picker'
import { walletSnapshot } from '@/lib/wallet/service'
import { chatModelOptions } from '@/lib/ai/chat-models'
import { TurnsProvider } from './turns'
import { sceneMessages } from '@/lib/messenger'
import { ConversationPersona } from '@/components/conversation-persona'
import { getT } from '@/lib/i18n/server'

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  const session = loadSession(sessionId, user.id)
  const [loaded, all, modelOptions, mature, adult, wallet] = await Promise.all([
    session,
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    session.then(l => chatModelOptions(user.id, l?.adult.since !== null && !!l)),
    session.then((l) => l && matureGateFor(user.id, l.characterId)),
    session.then((l) => l && adultModeGateFor(user.id, l.characterId, sessionId)),
    walletSnapshot(user.id),
  ])
  if (!loaded || !mature) notFound()
  // 채팅을 처음 진행하면 페르소나부터 — 캐릭터가 부를 이름과 내 소개(2026-09-29 결정). 저장하면 이 대화로 돌아온다.
  if (!loaded.personaConfigured) return <ConversationPersona entry={loaded.entry} required sessionId={sessionId} initial={loaded.snapshot.userPersona ?? null} characterName={loaded.characterName} context={loaded.snapshot.character.worldRole.startingContext} />
  // 문자·통화 기록은 /messages 의 것이다. 여기는 만나서 나눈 장면만 — 문자로 보낸 사진도 저쪽으로.
  const history = sceneMessages(all)

  const s = loaded.snapshot
  const affinity = Math.max(0, Math.min(100, Math.round(s.relationship.attraction)))
  const items: Msg[] = history.map((m) => ({
    id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
    content: m.hiddenAt ? t('운영 정책에 따라 숨김 처리된 메시지입니다.') : m.content,
    blocks: m.blocks as Array<Record<string, unknown>>, at: m.createdAt.toISOString(),
    opening: m.turnIndex <= 0 && !m.hiddenAt && (m.kind === 'text' || m.kind === 'photo') && (m.role === 'character' || m.role === 'narrator'),
  }))
  if (history.length === 0 && s.character.worldRole.startingContext) items.push({
    id: `opening:${sessionId}`, role: 'narrator', kind: 'text', content: s.character.worldRole.startingContext, blocks: [], opening: true,
  })

  return (
    <ChatModelProvider key={`${sessionId}:${loaded.adult.since !== null}`} initialWallet={wallet} initialModel={modelOptions.choices[0]?.id}><TurnsProvider><ChatTheme key={sessionId} sessionId={sessionId}><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <ChatHeaderAvatar portrait={loaded.characterPhoto} /><div className={styles.headerIdentity}><h1 className={styles.title}>{loaded.characterName}</h1>
            {/* 호감은 숫자 그대로, 마음을 여는 속도는 막대 색으로만(10/16 사용자 결정 — 속도 글자는 보이지 않는다). */}
            <p className={styles.affinity} data-pace={s.character.personality.relationshipProfile?.opening?.value ?? 'normal'}>
              <span>{t('호감 {n}%', { n: affinity })}</span><span className={styles.affinityBar} aria-hidden="true"><i style={{ width: `${affinity}%` }} /></span>
            </p></div>
          {loaded.adult.since !== null && <TransitionLink href="/home" className="t-micro">{t('언베일')}</TransitionLink>}
          {/* 미로 캐릭터는 문자 페이지가 따로 있다 — 만나서 나누는 장면과 폰으로 주고받는 문자를 섞지 않는다. */}
          {loaded.experienceType === 'reality' && (
            <TransitionLink href={`/messages/${sessionId}`} aria-label={t('문자')} className={styles.contextButton}>
              <ChatRoomIcon />
            </TransitionLink>
          )}
          <ConversationPersona entry={loaded.entry} sessionId={sessionId} initial={loaded.snapshot.userPersona ?? null} characterName={loaded.characterName} />
          <ChatThemePicker portrait={loaded.characterPhoto} />
          <ModelPicker {...modelOptions} />
        </header>

        <div className={styles.transcript}>
          {/* 'AI가 생성한 대화예요' 줄은 뺐다(2026-10-02 사용자: 사람처럼 느껴져야 한다). AI 라는 안내는 가입 때 필수 동의(AI 생성 콘텐츠 안내)로 한다. */}
          {loaded.restricted && <p data-restricted role="status" className="t-caption" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{t('운영 정책에 따라 이 역할극은 제한되었습니다.')}</p>}
          {loaded.experienceType === 'reality' && s.activeEvents[0] && (
            <aside style={{ marginBottom: 'var(--space-5)', padding: '14px 16px', borderLeft: '2px solid var(--color-accent)', background: 'var(--color-surface-1)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
              <h2 className="t-micro" style={{ marginBottom: 4 }}>{t('지금 이 세계에서')}</h2>
              <p className="t-body t-quote">{String((s.activeEvents[0].continuationState as { summary?: string }).summary ?? s.activeEvents[0].type)}</p>
            </aside>
          )}
          <MessageList sessionId={sessionId} hasStarted={s.turnCount > 0} items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} mood={s.characterState?.mood ?? 'neutral'} />
        </div>

        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 미로 캐릭터 대화방에서 알림 권한을 묻는다. */}
        {loaded.experienceType === 'reality' && <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />}
        <ChatComposer sessionId={sessionId} characterName={loaded.characterName} modelOptions={modelOptions} />
      </section>

    </main></ChatTheme></TurnsProvider></ChatModelProvider>
  )
}
