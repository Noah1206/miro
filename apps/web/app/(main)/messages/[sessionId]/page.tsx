import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, messages, realityContacts } from '@miro/db'
import { feature, voiceCallAllowed } from '@miro/config'
import { costOf } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { requirePersona } from '@/lib/persona'
import { Back, Notice, TransitionLink } from '@/components/ui'
import { PushSubscribe } from '@/components/push-subscribe'
import { TurnsProvider } from '../../chat/[sessionId]/turns'
import styles from './messages.module.css'
import { MessengerThread, type MsgItem } from './thread'
import { MessengerComposer } from './composer'
import { CallButton } from './call-button'
import { MESSENGER_KINDS, isMessengerMessage } from '@/lib/messenger'
import { getT } from '@/lib/i18n/server'
import { characterAvailability } from '@/lib/reality/routine'

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
  // 문자도 채팅이다 — 페르소나가 없으면 먼저 만든다(저장하면 이 문자방으로 돌아온다).
  await requirePersona(loaded.snapshot.userPersona, `/messages/${sessionId}`)
  // 이름 아래 한 줄 — 지금 뭐 하는 중인지(생활 리듬)와 상태 메시지(자기 삶이 바꾼다). "얘도 자기 하루가 있다" 가 보이게(10/9).
  const [rows, , now] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.sessionId, sessionId), inArray(messages.kind, [...MESSENGER_KINDS]))).orderBy(asc(messages.turnIndex), asc(messages.createdAt)),
    // 여기서 읽었으니 '읽음'. 선연락 기록은 열어 본 시각을 남긴다.
    db.update(realityContacts).set({ status: 'opened', openedAt: new Date() })
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent'))),
    characterAvailability(loaded.characterId, new Date(), loaded.snapshot.clock?.timeZone).catch(() => null),
  ])
  const presence = now && (now.label ? t('{label} 중', { label: now.label }) : now.availability === 'free' ? t('활동 중') : null)
  const freshStatus = !!loaded.characterStatusAt && Date.now() - loaded.characterStatusAt.getTime() < 6 * 3_600_000

  const items: MsgItem[] = rows
    // 사진은 문자로 보낸 것만 — 장면 안의 사진은 캐릭터챗의 것이다.
    .filter(isMessengerMessage)
    // 통화 기록 줄은 전화가 닫혀 있으면(운영 베타, 2026-10-01) 지난 것도 보이지 않는다.
    .filter((m) => m.kind !== 'call_record' || feature('voiceCall') || feature('videoCall'))
    .map((m) => ({
      id: m.id, role: m.role, kind: m.hiddenAt ? 'hidden' : m.kind,
      content: m.hiddenAt ? t('운영 정책에 따라 숨김 처리된 메시지입니다.') : m.content,
      blocks: m.blocks as Array<Record<string, unknown>>, at: m.createdAt.toISOString(),
    }))

  return (
    <TurnsProvider><main id="main" tabIndex={-1} className={`chat-layout`} style={{ outline: 'none', background: 'var(--color-bg)' }}>
      <section className={`chat-main ${styles.main}`}>
        <header className={styles.header}>
          <Back href="/archive" />
          <div className={styles.titleBox}>
            <h1 className={styles.title}>{loaded.characterName}</h1>
            {(presence || loaded.characterStatus) && (
              <p className={styles.presence}>
                {presence && <span className={styles.presenceNow} data-availability={now?.availability}>{presence}</span>}
                {loaded.characterStatus && <span className={styles.status} data-fresh={freshStatus || undefined}>
                  {freshStatus && <span className="sr-only">{t('새 상태 메시지')}</span>}{loaded.characterStatus}
                </span>}
              </p>
            )}
          </div>
          {voiceCallAllowed(user.id) && (
            <CallButton sessionId={sessionId} cost={costOf('voiceCallPerMinute')} />
          )}
          <TransitionLink href={`/chat/${sessionId}`} className={styles.headerLink}>{t('캐릭터챗')}</TransitionLink>
        </header>
        {call && (
          <Notice tone={call === 'usage' ? 'muted' : 'danger'} style={{ margin: '12px 16px 0' }}>
            {call === 'usage' ? t('이번 달 통화 제공량을 다 썼어요.') : call === 'off' ? t('지금은 통화를 쓸 수 없어요.') : t('통화를 시작하지 못했어요.')}
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
