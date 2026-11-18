'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, ButtonLink, TransitionLink } from '@/components/ui'
import { CharacterPhoto } from '@/components/character-visual'
import { spring, tween } from '@/lib/motion/tokens'
import type { ArchiveCursor, ArchivePage, ArchiveChannel } from '@/lib/ops/archive'
import { loadArchivePage } from './actions'
import { withParticle } from '@/lib/format'
import { preview } from '@/lib/archive-format'
import { useLanguage, useT } from '@/lib/i18n/client'
import emptyStyles from './empty.module.css'
import styles from './list.module.css'
import { coverTitle } from '@/lib/editorial/cover-title'
import { INTL_LOCALE } from '@/lib/i18n'

/** '3분 전'·'1일 전' — 마지막 대화 시각(서버와 브라우저 시각이 달라 그 칸만 수화 경고를 끈다). */
function ago(at: Date, locale: string): string {
  const sec = (Date.now() - new Date(at).getTime()) / 1000
  if (sec < 60) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second')
  const rtf = new Intl.RelativeTimeFormat(locale)
  for (const [unit, n] of [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600]] as const) if (sec >= n) return rtf.format(-Math.floor(sec / n), unit)
  return rtf.format(-Math.floor(sec / 60), 'minute')
}

/**
 * 항목이 사라지면 아래가 올라온다 (Layout Animation). 관계 수치는 어디에도 없다.
 * 보관/복원은 서버 액션. 눌린 즉시 토스트로 확인.
 */
export function ArchiveList({ initialPage, channel='chat' }: {
  initialPage: ArchivePage; channel?:ArchiveChannel
}) {
  const [items, setItems] = useState(initialPage.items)
  const [nextCursor, setNextCursor] = useState<ArchiveCursor | null>(initialPage.nextCursor)
  const [managing, setManaging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestId = useRef(0)
  const t = useT()
  const language = useLanguage()
  // 20초마다·포커스 때 목록 데이터만 다시 받는다(10/27) — router.refresh() 는 화면 전체를 다시 그리고 미리 받아 둔 이동을 지웠다.
  // 예전처럼 첫 페이지로 바꾼다(더 불러온 쪽도 첫 페이지로 돌아간다).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      const currentRequest = ++requestId.current
      fetch(`/api/archive?channel=${channel}`, { cache: 'no-store' }).then(res => res.ok ? res.json() as Promise<ArchivePage> : null).then(page => {
        if (!page || currentRequest !== requestId.current) return
        setItems(page.items.map(item => ({ ...item, lastInteractionAt: new Date(item.lastInteractionAt) })))
        setNextCursor(page.nextCursor)
        setLoading(false)
        setError(false)
      }).catch(() => { /* 다음 주기에 다시 받는다 — 보이는 목록은 그대로 둔다. */ })
    }
    const timer = window.setInterval(refresh, 20_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [channel])

  // 서버가 목록을 새로 주면(삭제 뒤 돌아왔을 때 등) 그 목록으로 바꾼다. 이름 검색 입력칸은 없앴다(2026-09-30 요청).
  useEffect(() => {
    requestId.current++
    setItems(initialPage.items)
    setNextCursor(initialPage.nextCursor)
    setLoading(false)
    setError(false)
  }, [initialPage])

  async function loadMore() {
    if (!nextCursor || loading) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(false)
    try {
      const page = await loadArchivePage(nextCursor,channel)
      if (currentRequest !== requestId.current) return
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      if (currentRequest === requestId.current) setError(true)
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }
  return (
    <>
      <header className="sticky-head" style={{ marginBottom: 12, paddingBlock: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          {/* 11/12 사용자(A안): 제목 자리에 큰 글자 탭 — 고른 쪽만 흰색(베이비챗 '홈 랭킹'). 화면 이름은 화면 낭독기에만. */}
          <h1 className="sr-only">{t('대화')}</h1>
          <nav aria-label={t('대화 종류')} className={styles.channels}>
            {([['chat', t('캐릭터챗'), '/archive'], ['dm', 'DM', '/archive?channel=dm']] as const).map(([key, label, href]) =>
              <TransitionLink key={key} href={href} aria-current={channel === key ? 'page' : undefined} className={styles.channel}>{label}</TransitionLink>)}
          </nav>
        {/* 대화 관리 — 누르면 방마다 삭제가 보인다. 지울 방이 없으면 두지 않는다. */}
        {items.length > 0 && <button type="button" onClick={() => setManaging((value) => !value)} aria-label={t('대화 관리')} aria-pressed={managing} style={{
          width: 40, height: 40, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 'var(--radius-sm)',
          background: managing ? 'var(--color-surface-2)' : 'transparent', color: 'var(--color-text-primary)',
        }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M10 2h4l.6 2.8L16.7 6l2.7-.9 2 3.5-2.1 1.9v3l2.1 1.9-2 3.5-2.7-.9-2.1 1.2L14 22h-4l-.6-2.8L7.3 18l-2.7.9-2-3.5 2.1-1.9v-3L2.6 8.6l2-3.5 2.7.9 2.1-1.2L10 2Z" />
            <circle cx="12" cy="12" r="3.3" />
          </svg>
        </button>}
        </div>
      </header>
      {/* 11/19 사용자: 목록 한 줄 = 둥근 사진 60px + 세 줄(제목·마지막 말·아랫줄과 시간). */}
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
        {items.map((s) => {
          const portrait = s.characterImage
          const title = coverTitle({ slug: s.characterSlug, name: s.characterName })
          return (
          <motion.li key={s.id} data-session-row data-status={s.status} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12, transition: tween.exit }} transition={spring.default}
            style={{ position: 'relative' }}>
            <TransitionLink href={s.href ?? `/chat/${s.id}`} className={styles.row}>
              <div aria-hidden className={styles.avatar}>
                {portrait
                  ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="60px" width={60} height={60}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="t-name" style={{ fontSize: 24, color: s.accentA ?? 'var(--color-text-tertiary)', opacity: 0.8 }}>{title.slice(0, 1)}</span>}
              </div>
              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <h2 className={styles.title}>{title}</h2>
                  {s.unread > 0 && <span data-unread aria-label={t('안 읽은 메시지 {n}개', { n: s.unread })} className={styles.unread}>{s.unread}</span>}
                </div>
                <p className={styles.preview}>{s.lastMessage ? preview(s.lastMessage, s.characterName) : channel==='dm'?t('아직 주고받은 메시지가 없어요.'):s.characterStatus ?? s.location}</p>
                <p className={styles.meta}>
                  {s.storyTitle && <span className={styles.metaText}>{s.storyTitle} · {t('{n}회차', { n: s.runNo! })}</span>}
                  <span className={styles.time} suppressHydrationWarning>{ago(s.lastInteractionAt, INTL_LOCALE[language])}</span>
                </p>
              </div>
            </TransitionLink>
            {managing && !s.storyTitle && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <ButtonLink href={`/archive/delete/${s.id}`} size="sm" variant="danger" aria-label={t('{name}의 역할극 삭제', { name: language === 'ko' ? withParticle(coverTitle({ slug: s.characterSlug, name: s.characterName }), '과', '와', '와') : coverTitle({ slug: s.characterSlug, name: s.characterName }) })}>{t('삭제')}</ButtonLink>
              </div>
            )}
          </motion.li>
          )
        })}
        </AnimatePresence>
      </ul>
      {loading && <p role="status" className="t-caption" style={{ marginTop: 16 }}>{t('불러오는 중…')}</p>}
      {error && <div role="alert" className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>{t('목록을 불러오지 못했어요.')} <Button type="button" size="sm" variant="ghost" onClick={() => void loadMore()}>{t('다시 시도')}</Button></div>}
      {/* 빈 목록 — 글 한 줄은 심심해서(2026-10-01 요청) 그림·제목·한 줄(버튼은 10/1 뺐다). 그림은 로고의 두 조각(3D 그림은 로고와 결이 달라 뺐다). */}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state empty-state--fill">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div className={emptyStyles.mark} aria-hidden><span className={emptyStyles.left} /><span className={emptyStyles.right} /></div>
            <p className="t-title-3" style={{ color: 'var(--color-text-primary)' }}>{t('아직 대화가 없어요')}</p>
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('마음에 드는 캐릭터를 찾아 첫 대화를 시작해 보세요.')}</p>
          </div>
        </div>
      )}
      {nextCursor && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}><Button type="button" variant="secondary" onClick={loadMore} disabled={loading}>{t('더 보기')}</Button></div>}
    </>
  )
}
