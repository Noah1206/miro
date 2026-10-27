'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DiscoveryFilters } from '@/components/discovery-filters'
import type { DiscoveryGroup } from '@/lib/discovery-filters'
import { useT } from '@/lib/i18n/client'
import { startNavigation } from '@/lib/motion/view-transition'
import styles from './audience-select.module.css'

/** BL catalog picker with broad genres, careers and species; no audience preferences. */
export function AudienceSelect({ groups }: { groups: DiscoveryGroup[] }) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [openCount, setOpenCount] = useState(0)
  const ref = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close() }, [open])
  const close = () => setOpen(false)
  const apply = () => {
    setOpen(false)
    const params = new URLSearchParams()
    tags.forEach(tag => params.append('tag', tag))
    // 이동 신호를 함께 보낸다 — 결과 화면이 그려지는 동안 뼈대가 뜬다(10/27).
    const url = tags.length ? `/search/results?${params}` : '/search/results'
    startNavigation('forward', () => router.push(url), url)
  }
  return (<>
    <button ref={trigger} type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpenCount(value => value + 1); setOpen(true) }}>
      {t('전체')}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <dialog ref={ref} className={styles.dialog} aria-labelledby="discovery-title"
      onClose={() => { setOpen(false); trigger.current?.focus() }}
      onCancel={event => { event.preventDefault(); close() }} onClick={event => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
      }}>
      <header className={styles.header}>
        <div><h2 id="discovery-title" tabIndex={-1} autoFocus>{t('취향으로 찾기')}</h2><p>{t('좋아하는 분위기와 성향을 골라보세요')}</p></div>
        <button type="button" onClick={close} aria-label={t('닫기')} className={styles.close}>×</button>
      </header>
      <div className={styles.scroll}>
        <DiscoveryFilters key={openCount} groups={groups} selected={tags} onChange={setTags} />
        {!groups.length && <p className={styles.empty}>{t('등록된 태그가 아직 없어요')}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.reset} onClick={() => setTags([])}>{t('초기화')}</button>
        <button type="button" className={styles.apply} onClick={apply}>{tags.length ? t('{n}개 태그로 찾기', { n: tags.length }) : t('전체 보기')}</button>
      </footer>
    </dialog>
  </>)
}
