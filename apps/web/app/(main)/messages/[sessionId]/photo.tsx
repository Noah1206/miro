'use client'
import { useRef, useState } from 'react'
import { useT } from '@/lib/i18n/client'
import styles from './messages.module.css'

export function MessengerPhoto({ src, caption }: { src: string; caption?: string | null }) {
  const t = useT(), dialog = useRef<HTMLDialogElement>(null)
  const [failed, setFailed] = useState(false)
  const alt = caption ? t('캐릭터가 보낸 사진 — {caption}', { caption }) : t('캐릭터가 보낸 사진')
  return <>
    {failed ? <p className={styles.meta}>{t('사진을 불러오지 못했어요.')}</p> :
      <button type="button" className={styles.photoButton} onClick={() => dialog.current?.showModal()} aria-label={t('사진 크게 보기')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" />
      </button>}
    <dialog ref={dialog} className={styles.photoDialog} aria-label={t('사진 크게 보기')} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}>
      <button type="button" onClick={() => dialog.current?.close()} aria-label={t('닫기')}>×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
      {caption && <p>{caption}</p>}
    </dialog>
  </>
}
