import { ChatRoomIcon } from '@/components/chat-icons'
import { ChatTheme, ChatThemePicker, ChatHeaderAvatar } from '@/components/chat-theme'
import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, realityContacts } from '@miro/db'
import { feature, voiceCallAllowed } from '@miro/config'
import { costOf } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { ConversationPersona } from '@/components/conversation-persona'
import { Back, Notice, TransitionLink } from '@/components/ui'
import { PushSubscribe } from '@/components/push-subscribe'
import { MessengerDelivery } from './delivery'
import { messengerItems } from '@/lib/messenger/inbox'
import styles from './messages.module.css'
import { MessengerThread } from './thread'
import { MessengerComposer } from './composer'
import { CallButton } from './call-button'
import { getT } from '@/lib/i18n/server'

/**
 * 문자(카톡형) 페이지 — 미로 캐릭터가 먼저 보낸 연락, 내가 보낸 문자, 통화 기록이 여기 모인다.
 * 캐릭터챗(/chat)은 만나서 나누는 장면이고, 여기는 각자 있는 곳에서 폰으로 주고받는 곳이다.
 */
export default async function MessagesPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ call?: string }> }) {
  const t = await getT()
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const { call } = await searchParams
  // 주인 확인이 먼저다 — 남의 세션 주소로 들어와도 그 사람의 연락을 '읽음' 으로 바꾸지 않는다.
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded || loaded.experienceType !== 'reality') notFound()
  // 두 경험에서 같은 페르소나를 사용한다.
  if (!loaded.personaConfigured) return <ConversationPersona required sessionId={sessionId} initial={loaded.snapshot.userPersona ?? null} characterName={loaded.characterName} context={loaded.snapshot.character.worldRole.startingContext} />
  const [rows] = await Promise.all([
    messengerItems(user.id, sessionId),
    // This is the user reading the character's incoming contacts, not the reverse.
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))),
  ])
  const items = (rows ?? []).filter(m => m.kind !== 'call_record' || feature('voiceCall') || feature('videoCall'))

  return (
    <MessengerDelivery key={sessionId} sessionId={sessionId} initial={items}><ChatTheme key={sessionId} sessionId={sessionId}><main id="main" tabIndex={-1} className={`chat-layout`} style={{ outline: 'none', background: 'var(--color-bg)' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          {/* 이름만 — 지금 하는 일·상태 메시지는 문자방에 두지 않는다(10/9, 사람 사이 문자엔 없다). 상태 메시지는 채팅 목록에만. */}
          <ChatHeaderAvatar /><h1 className={styles.title}>{loaded.characterName}</h1>
          {voiceCallAllowed(user.id) && (
            <CallButton sessionId={sessionId} cost={costOf('voiceCallPerMinute')} />
          )}
          <TransitionLink href={`/chat/${sessionId}`} className={styles.headerButton} aria-label={t('캐릭터챗')} title={t('캐릭터챗')}><ChatRoomIcon /></TransitionLink>
          <ConversationPersona sessionId={sessionId} initial={loaded.snapshot.userPersona ?? null} characterName={loaded.characterName} />
          <ChatThemePicker />
        </header>
        {call && (
          <Notice tone={call === 'usage' ? 'muted' : 'danger'} style={{ margin: '12px 16px 0' }}>
            {call === 'usage' ? t('이번 달 통화 제공량을 다 썼어요.') : call === 'off' ? t('지금은 통화를 쓸 수 없어요.') : t('통화를 시작하지 못했어요.')}
          </Notice>
        )}
        <MessengerThread characterName={loaded.characterName} portrait={loaded.characterPhoto} />
        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 문자 페이지에서 알림 권한을 묻는다. */}
        <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />
        <MessengerComposer />
      </section>
    </main></ChatTheme></MessengerDelivery>
  )
}
