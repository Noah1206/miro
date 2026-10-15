'use client'
import type { CharacterEntry } from '@/lib/character-entry'
import { useT } from '@/lib/i18n/client'
import styles from './stories/story-briefing.module.css'

export function CharacterBriefing({ entry }: { entry: CharacterEntry }) {
  const t = useT()
  return <div className={styles.guide}>
    <section className={styles.section}><h2 className="t-title-3">{t('이 세계에 들어가기 전에')}</h2><div className={styles.chapter}><p>{entry.world}</p></div></section>
    <section className={styles.role}>
      <h2 className="t-title-3">{t('이 이야기 속의 나')}</h2><p>{entry.role}</p>
      <h3>{t('지금 이 상황이 된 이유')}</h3><p>{entry.before}</p>
    </section>
  </div>
}
