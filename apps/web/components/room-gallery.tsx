'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { roomGallery } from '@/app/(main)/chat/[sessionId]/actions'
import styles from './room-menu.module.css'

type Item = { image: string | null; blurred: boolean }

/** 갤러리(11/8) — 채팅방 메뉴 맨 위 가로 줄. 대화에서 뜬 상황별 사진은 선명하게, 아직 안 본 사진은 자물쇠 칸으로. 메뉴를 열 때마다 다시 읽는다. */
export function RoomGallery({ sessionId, open }: { sessionId: string; open: boolean }) {
  const t = useT()
  const [items, setItems] = useState<Item[] | null>(null)
  const [view, setView] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    roomGallery(sessionId).then(r => { if (live) setItems(r.items) }).catch(() => {})
    return () => { live = false }
  }, [open, sessionId])
  if (!items?.length) return null
  const unlocked = items.filter(i => i.image).length
  return (
    <section className={styles.gallery} aria-label={t('갤러리')}>
      <h3>{t('갤러리')} <span>{unlocked}/{items.length}</span></h3>
      <ul>
        {items.map((it, i) => <li key={i}>
          {it.image
            ? <button type="button" onClick={() => setView(it.image)} aria-label={t('사진 크게 보기')} data-blurred={it.blurred || undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image} alt="" loading="lazy" decoding="async" />
              </button>
            : <span className={styles.locked} aria-label={t('아직 열리지 않은 사진')}>
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              </span>}
        </li>)}
      </ul>
      {view && <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={t('사진 크게 보기')} onClick={() => setView(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view} alt="" data-blurred={items.find(i => i.image === view)?.blurred || undefined} />
      </div>}
    </section>
  )
}
