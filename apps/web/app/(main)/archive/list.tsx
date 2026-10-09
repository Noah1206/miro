'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, ButtonLink, TransitionLink } from '@/components/ui'
import { CharacterPhoto } from '@/components/character-visual'
import { spring, tween } from '@/lib/motion/tokens'
import type { ArchiveCursor, ArchivePage } from '@/lib/ops/archive'
import { loadArchivePage } from './actions'
import { withParticle } from '@/lib/format'
import { dateLabel, preview } from '@/lib/archive-format'
import { useLanguage, useT } from '@/lib/i18n/client'
import emptyStyles from './empty.module.css'

/**
 * 항목이 사라지면 아래가 올라온다 (Layout Animation). 관계 수치는 어디에도 없다.
 * 보관/복원은 서버 액션. 눌린 즉시 토스트로 확인.
 */
export function ArchiveList({ initialPage }: {
  initialPage: ArchivePage
}) {
  const [items, setItems] = useState(initialPage.items)
  const [nextCursor, setNextCursor] = useState<ArchiveCursor | null>(initialPage.nextCursor)
  const [managing, setManaging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestId = useRef(0)
  const t = useT()
  const language = useLanguage()

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
      const page = await loadArchivePage(nextCursor)
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
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          <h1 className="t-title-1">{t('채팅')}</h1>
        {/* 대화 관리(…) — 누르면 방마다 삭제가 보인다. 지울 방이 없으면 두지 않는다(10/1). */}
        {items.length > 0 && <button type="button" onClick={() => setManaging((value) => !value)} aria-label={t('대화 관리')} aria-pressed={managing} style={{
          width: 40, height: 40, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 'var(--radius-sm)',
          background: managing ? 'var(--color-surface-2)' : 'transparent', color: 'var(--color-text-primary)',
        }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="15" cy="9" r="1.5" />
          </svg>
        </button>}
        </div>
      </header>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        <AnimatePresence initial={false}>
        {items.map((s) => {
          const portrait = s.characterImage
          return (
          <motion.li key={s.id} data-session-row data-status={s.status} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12, transition: tween.exit }} transition={spring.default}
            style={{ position: 'relative', padding: '10px 12px', borderRadius: 'var(--radius-lg)', background: 'rgba(255, 255, 255, 0.035)' }}>
            <TransitionLink href={`/chat/${s.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 68 }}>
              <div aria-hidden style={{ width: 56, height: 56, borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface-2)', display: 'grid', placeItems: 'center' }}>
                {portrait
                  ? <CharacterPhoto src={portrait} alt="" size="avatar" sizes="56px" width={56} height={56}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="t-name" style={{ fontSize: 22, color: s.accentA ?? 'var(--color-text-tertiary)', opacity: 0.8 }}>{s.characterName.slice(0, 1)}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <h2 className="t-name" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, lineHeight: 1.35 }}>
                    {s.characterName}
                  </h2>
                </div>
                <p className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>{s.lastMessage ? preview(s.lastMessage, s.characterName) : s.characterStatus ?? `${s.location} · ${s.time}`}</p>
              </div>
              <div style={{ width: 44, minHeight: 54, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 7 }}>
                <time className="t-micro" dateTime={new Date(s.lastInteractionAt).toISOString()} style={{ textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>{dateLabel(s.lastInteractionAt, undefined, t)}</time>
                {s.unread > 0 && <span data-unread aria-label={t('안 읽은 메시지 {n}개', { n: s.unread })} className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, minWidth: 21, height: 21, padding: '0 6px', borderRadius: 11, background: 'var(--color-danger)', color: 'var(--color-white)', display: 'grid', placeItems: 'center' }}>{s.unread}</span>}
              </div>
            </TransitionLink>
            {managing && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <ButtonLink href={`/archive/delete/${s.id}`} size="sm" variant="danger" aria-label={t('{name}의 역할극 삭제', { name: language === 'ko' ? withParticle(s.characterName, '과', '와', '와') : s.characterName })}>{t('삭제')}</ButtonLink>
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
