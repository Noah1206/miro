import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, messages, realityContacts } from '@miro/db'
import { voiceCallAllowed } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { Back, Notice, TransitionLink } from '@/components/ui'
import { PushSubscribe } from '@/components/push-subscribe'
import { TurnsProvider } from '../../chat/[sessionId]/turns'
import styles from './messages.module.css'
import { MessengerThread, type MsgItem } from './thread'
import { MessengerComposer } from './composer'
import { placeVoiceCall } from './actions'
import { MESSENGER_KINDS, isMessengerMessage } from '@/lib/messenger'

/**
 * 문자(카톡형) 페이지 — 미로 캐릭터가 먼저 보낸 연락, 내가 보낸 문자, 통화 기록이 여기 모인다.
 * 캐릭터챗(/chat)은 만나서 나누는 장면이고, 여기는 각자 있는 곳에서 폰으로 주고받는 곳이다.
 */
export default async function MessagesPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ call?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const { call } = await searchParams
  // 주인 확인이 먼저다 — 남의 세션 주소로 들어와도 그 사람의 연락을 '읽음' 으로 바꾸지 않는다.
  const loaded = await loadSession(sessionId, user.id)
  if (!loaded || loaded.experienceType !== 'reality') notFound()
  const [rows] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.sessionId, sessionId), inArray(messages.kind, [...MESSENGER_KINDS]))).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    // 여기서 읽었으니 '읽음'. 선연락 기록은 열어 본 시각을 남긴다.
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))),
  ])

  const items: MsgItem[] = rows
    // 사진은 문자로 보낸 것만 — 장면 안의 사진은 캐릭터챗의 것이다.
    .filter(isMessengerMessage)
    .map((m) => ({
      id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
      content: m.hiddenAt ? '운영 정책에 따라 숨김 처리된 메시지입니다.' : m.content,
      blocks: m.blocks as Array<Record<string, unknown>>, at: m.createdAt.toISOString(),
    }))

  return (
    <TurnsProvider><main id="main" tabIndex={-1} className={`chat-layout`} style={{ outline: 'none', background: 'var(--color-bg)' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <h1 className={styles.title}>{loaded.characterName}</h1>
          {voiceCallAllowed(user.id) && (
            <form action={placeVoiceCall}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <button type="submit" className={styles.headerButton} aria-label="통화">
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
              </button>
            </form>
          )}
          <TransitionLink href={`/chat/${sessionId}`} className={styles.headerLink}>캐릭터챗</TransitionLink>
        </header>
        {call && (
          <Notice tone={call === 'usage' ? 'muted' : 'danger'} style={{ margin: '12px 16px 0' }}>
            {call === 'usage' ? '이번 달 통화 제공량을 다 썼어요.' : call === 'off' ? '지금은 통화를 쓸 수 없어요.' : '통화를 시작하지 못했어요.'}
          </Notice>
        )}
        <MessengerThread items={items} characterName={loaded.characterName} portrait={loaded.characterPhoto} />
        {/* 앱 밖 연락은 끌 수 없다 — 이 기기가 구독될 때까지 문자 페이지에서 알림 권한을 묻는다. */}
        <PushSubscribe vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} name={loaded.characterName} />
        <MessengerComposer sessionId={sessionId} characterName={loaded.characterName} />
      </section>
    </main></TurnsProvider>
  )
}
