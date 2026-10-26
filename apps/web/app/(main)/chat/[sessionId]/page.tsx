import { ChatTheme, ChatHeaderAvatar } from '@/components/chat-theme'
import { notFound, redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { contactProfiles, db, messages } from '@miro/db'
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
import { walletSnapshot } from '@/lib/wallet/service'
import { chatModelOptions } from '@/lib/ai/chat-models'
import { TurnsProvider } from './turns'
import { sceneMessages } from '@/lib/messenger'
import { ConversationPersona } from '@/components/conversation-persona'
import { getT } from '@/lib/i18n/server'
import { msg } from '@/lib/i18n'
import { CoachMarks, type CoachStep } from '@/components/coach-marks'
import { ImmersiveProvider, VoiceStatus } from './immersive'
import { RoomMenu } from './room-menu'
import { SceneImage } from './scene-image'
import { feature, usageWeight } from '@miro/config'

/** 처음 들어온 대화 화면에서 짚어 주는 기능(10/19). 화면에 없는 버튼(테마에 따라 다름)은 건너뛴다. */
const CHAT_COACH: CoachStep[] = [
  { target: 'narration', title: msg('행동이나 상황을 표현하고 싶을 때 내용 앞뒤로 *를 붙여보세요.'), example: msg('예시) *수줍게 그를 바라보며* 보고싶었어…') },
  { target: 'model', title: msg('대화 방식을 바꿀 수 있어요.'), example: msg('기본 대화와 더 긴 대화 중에서 골라 보세요.') },
]

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  // 세션·기록·요금제·성인 판정은 서로를 기다릴 이유가 없다 — 한 번의 왕복 시간에 다 읽는다.
  const session = loadSession(sessionId, user.id)
  const [loaded, all, modelOptions, mature, adult, wallet, contact] = await Promise.all([
    session,
    db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    session.then(l => chatModelOptions(user.id, l?.adult.since !== null && !!l)),
    session.then((l) => l && matureGateFor(user.id, l.characterId)),
    session.then((l) => l && adultModeGateFor(user.id, l.characterId, sessionId)),
    walletSnapshot(user.id),
    // 유형(10/19) — 몰입 모드(음성/음성+영상)로 만든 캐릭터만 방 머리에 몰입 모드 단추가 있다.
    session.then((l) => l && db.select({ presentation: contactProfiles.presentation }).from(contactProfiles).where(eq(contactProfiles.characterId, l.characterId)).limit(1)),
  ])
  if (!loaded || !mature) notFound()
  const media = (contact && contact[0]?.presentation?.media) ?? 'text'
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
    <ChatModelProvider key={`${sessionId}:${loaded.adult.since !== null}`} initialWallet={wallet} initialModel={modelOptions.choices[0]?.id}><TurnsProvider><ImmersiveProvider sessionId={sessionId} media={media} enabled={feature('characterVoice')} portrait={loaded.characterPhoto} initialMessages={items} characterName={loaded.characterName}><ChatTheme key={sessionId} sessionId={sessionId}><main id="main" tabIndex={-1} className={`chat-layout ${styles.page}`} style={{ outline: 'none' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <ChatHeaderAvatar portrait={loaded.characterPhoto} /><div className={styles.headerIdentity}><h1 className={styles.title}>{loaded.characterName}</h1>
            {/* 호감은 숫자 그대로, 마음을 여는 속도는 막대 색으로만(10/16 사용자 결정 — 속도 글자는 보이지 않는다). */}
            <p className={styles.affinity} data-pace={s.character.personality.relationshipProfile?.opening?.value ?? 'normal'}>
              <span>{t('호감 {n}%', { n: affinity })}</span><span className={styles.affinityBar} aria-hidden="true"><i style={{ width: `${affinity}%` }} /></span>
            </p></div>
          {loaded.adult.since !== null && <TransitionLink href="/home" className="t-micro">{t('언베일')}</TransitionLink>}
          <RoomMenu sessionId={sessionId} initialPersona={s.userPersona ?? null} characterName={loaded.characterName} entry={loaded.entry} portrait={loaded.characterPhoto} messengerHref={loaded.experienceType === 'reality' ? `/messages/${sessionId}` : undefined} />
        </header>
        <VoiceStatus />
        {feature('imageGeneration')&&!loaded.restricted&&<SceneImage sessionId={sessionId} unveil={loaded.adult.on} cost={usageWeight('photo')}/>}

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
        {/* 미로 캐릭터는 문자 페이지가 따로 있다 — 문자·대화 방식 버튼은 입력창 안 아래 줄에(10/17). */}
        <CoachMarks storageKey="miro:tour:chat" steps={CHAT_COACH} />
        <ChatComposer sessionId={sessionId} characterName={loaded.characterName} modelOptions={modelOptions} roomHref={loaded.experienceType === 'reality' ? `/messages/${sessionId}` : undefined} commands={loaded.commands} />
      </section>

    </main></ChatTheme></ImmersiveProvider></TurnsProvider></ChatModelProvider>
  )
}
