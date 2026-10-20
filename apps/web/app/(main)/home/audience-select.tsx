'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { characterImageSources } from '@/components/character-visual'
import { useT } from '@/lib/i18n/client'
import styles from './home.module.css'

type Audience = 'all' | 'female' | 'male'

/**
 * 홈 남성향/여성향/전체(10/20). 처음 방문하면 가운데 팝업(네이티브 <dialog>, 사용자 요청)이 한 번 뜨고, 이후엔 검색창 왼쪽 버튼으로 다시 연다.
 * 고른 값은 이 기기의 쿠키(miro_home_audience — 홈 page.tsx 가 읽는다)에 두고 홈을 다시 그린다.
 */
export function AudienceSelect({ value, autoOpen, photos }: { value: Audience; autoOpen: boolean; photos: string[] }) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(autoOpen)
  const [pick, setPick] = useState<Audience>(value)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close() }, [open])
  // Escape·배경 탭 = 닫기. 처음 방문에 닫으면 '전체' 로 정한다 — 다음 방문에 다시 뜨지 않게.
  const dismiss = () => (autoOpen && value === 'all' ? save('all') : setOpen(false))
  const label: Record<Audience, string> = { male: t('남성향'), female: t('여성향'), all: t('전체') }
  const img = (src: string | undefined) => (src ? characterImageSources(src, 'thumbnail').src : undefined)
  const save = (v: Audience) => {
    document.cookie = `miro_home_audience=${v}; path=/; max-age=31536000; samesite=lax`
    setOpen(false)
    router.refresh()
  }
  const tile = (v: Audience, sub: string, src: string | undefined) => (
    <button type="button" aria-pressed={pick === v} onClick={() => setPick(v)} className={styles.audTile} data-audience={v}>
      <span className={styles.audImages}>{src ? <img src={src} alt="" /> : <i />}</span>
      <span className={styles.audText}><b>{label[v]}</b><small>{sub}</small></span>
    </button>
  )
  return (<>
    <button type="button" className={styles.audience} aria-haspopup="dialog" onClick={() => { setPick(value); setOpen(true) }}>{label[value]}</button>
    <dialog ref={ref} className={styles.audDialog} aria-labelledby="aud-title"
      onCancel={e => { e.preventDefault(); dismiss() }} onClick={e => { if (e.target === e.currentTarget) dismiss() }}>
      {/* 열릴 때 첫 초점은 제목 — 첫 칸에 초점 링이 뜨지 않게. */}
      <h2 id="aud-title" tabIndex={-1} autoFocus style={{ outline: 'none' }}>{t('취향이 어떻게 되세요?')}</h2>
      <div className={styles.audGrid}>
        {/* 세 갈래 나란히(10/20). */}
        {tile('all', t('모두 보기'), img(photos[1]))}
        {tile('male', t('여자 캐릭터와 로맨스'), '/audience/male.jpg')}
        {tile('female', t('남자 캐릭터와 로맨스'), img(photos[0]))}
      </div>
      <button type="button" className={styles.audStart} onClick={() => save(pick)}>{t('시작하기')}</button>
    </dialog>
  </>)
}
