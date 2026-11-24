'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Asset } from '@/lib/play/assets'
import { useT } from '@/lib/i18n/client'
import s from './assets.module.css'

const FIRST = 12

/**
 * 11/25 사용자: 작품 에셋(상황 사진)을 상세에서 본다. 언베일 사진은 언베일 켠 성인 인증 회원에게만 주소가 오고,
 * 그 밖엔 19 흐림 칸(누르면 언베일 켜기로). 12장 다음은 '전체 보기'로 펼친다.
 * 11/25 사용자: 사진을 누르면 크게 열리고 옆으로 밀어 넘긴다(스크롤 스냅 — 손가락 스와이프·화살표·키보드).
 */
export function AssetGallery({ assets, cover, unlockHref }: { assets: Asset[]; cover: string | null; unlockHref: string }) {
  const t = useT()
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const shown = assets.filter(a => a.img) as Array<Asset & { img: string }>
  if (!assets.length) return null
  const cell = (a: Asset) => (
    <li key={a.id}>
      {a.img
        ? <button type="button" onClick={() => setOpen(shown.findIndex(x => x.id === a.id))} aria-label={t('크게 보기')}><img src={a.img} alt="" loading="lazy" /></button>
        : <Link href={unlockHref} className={s.locked} aria-label={t('언베일 카드')}>{cover && <img src={cover} alt="" loading="lazy" />}<i>19</i></Link>}
    </li>
  )
  return (
    <section aria-labelledby="assets" className={s.wrap}>
      <h2 id="assets" className="t-title-3">{t('에셋')} <small>{assets.length}</small></h2>
      <ul className={s.grid}>{(all ? assets : assets.slice(0, FIRST)).map(cell)}</ul>
      {!all && assets.length > FIRST && <button type="button" className={s.more} onClick={() => setAll(true)}>{t('전체 보기 ({n})', { n: assets.length })}</button>}
      {open !== null && <Viewer images={shown.map(a => a.img)} start={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

function Viewer({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const t = useT()
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(start)
  const go = (i: number) => { const el = track.current; if (el) el.scrollTo({ left: Math.max(0, Math.min(images.length - 1, i)) * el.clientWidth, behavior: 'smooth' }) }
  useEffect(() => {
    const el = track.current; if (el) el.scrollLeft = start * el.clientWidth
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [start])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(at + 1); if (e.key === 'ArrowLeft') go(at - 1) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  })
  return (
    <div className={s.viewer} role="dialog" aria-modal="true" aria-label={t('에셋')}>
      <div ref={track} className={s.track} onScroll={e => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {images.map((src, i) => <div key={src} className={s.slide}><img src={src} alt="" loading={Math.abs(i - start) < 3 ? 'eager' : 'lazy'} /></div>)}
      </div>
      <span className={s.count}>{at + 1} / {images.length}</span>
      <button type="button" className={s.close} onClick={onClose} aria-label={t('닫기')}>✕</button>
      {at > 0 && <button type="button" className={`${s.nav} ${s.prev}`} onClick={() => go(at - 1)} aria-label={t('이전')}>‹</button>}
      {at < images.length - 1 && <button type="button" className={`${s.nav} ${s.next}`} onClick={() => go(at + 1)} aria-label={t('다음')}>›</button>}
    </div>
  )
}
