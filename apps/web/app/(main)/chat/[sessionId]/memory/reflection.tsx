'use client'
import { useEffect, useState } from 'react'
import type { MemoryReflection } from '@/lib/memory-reflection'
import { useT } from '@/lib/i18n/client'
import { Skeleton } from '@/components/ui'
import { thinkAboutMe } from './actions'
import styles from './memory.module.css'

/** 나에 대한 생각 — 저장된 글이 지금 기억과 맞으면 바로, 아니면 열 때 새로 쓴다(몇 초). */
export function Reflection({ sessionId, name, initial }: { sessionId: string; name: string; initial: MemoryReflection | null }) {
  const t = useT()
  const [r, setR] = useState(initial)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (initial) return
    let live = true
    void thinkAboutMe(sessionId).then(x => { if (!live) return; if (x) setR(x); else setFailed(true) })
    return () => { live = false }
  }, [sessionId, initial])
  if (failed) return null
  return (
    <section className={`${styles.section} ${styles.thought}`} aria-busy={!r}>
      <h2 className="t-micro">{t('나에 대한 {name}의 생각', { name })}</h2>
      {!r ? <div className="stack" style={{ gap: 8 }} aria-label={t('생각을 정리하는 중…')}><Skeleton h={22} w="80%" /><Skeleton h={14} /><Skeleton h={14} /><Skeleton h={14} w="60%" /></div> : <>
        <p className="t-quote">“{r.oneLine}”</p>
        <p className="t-body" style={{ whiteSpace: 'pre-line' }}>{r.thought}</p>
        {r.wonder.length > 0 && <div className="stack" style={{ gap: 4 }}>
          <h3 className="t-micro">{t('더 알고 싶은 것')}</h3>
          <ul className={styles.list}>{r.wonder.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>}
      </>}
    </section>
  )
}
