'use client'
import type { StoryEntry } from '@miro/domain'
import { useT } from '@/lib/i18n/client'
import styles from './story-briefing.module.css'

/** 작품 소개와 플레이 도중 안내가 같은 공개 설정을 보여 준다. */
export function StoryBriefing({ entry }: { entry: StoryEntry }) {
  const t = useT()
  return <div className={styles.guide}>
    <section className={styles.section}>
      <h2 className="t-title-3">{t('이 세계에 들어가기 전에')}</h2>
      {entry.world.map(w => <div key={w.title} className={styles.chapter}><h3>{w.title}</h3><p>{w.text}</p></div>)}
    </section>
    <section className={styles.role}>
      <h2 className="t-title-3">{t('이 이야기 속의 나')}</h2>
      <p>{entry.role}</p>
      <h3>{t('지금 내가 있는 곳')}</h3><p>{entry.arrival}</p>
      <h3>{t('처음 마주할 일')}</h3><p>{entry.objective}</p>
    </section>
    <section className={styles.section}>
      <h2 className="t-title-3">{t('기억해 둘 장소')}</h2>
      <dl className={styles.terms}>{entry.places.map(p => <div key={p.name}><dt>{p.name}</dt><dd>{p.text}</dd></div>)}</dl>
    </section>
    <section className={styles.section}>
      <h2 className="t-title-3">{t('이 세계의 약속')}</h2>
      <dl className={styles.terms}>{entry.rules.map(r => <div key={r.name}><dt>{r.name}</dt><dd>{r.text}</dd></div>)}</dl>
    </section>
  </div>
}
