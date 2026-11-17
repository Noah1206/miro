import { Back, TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './memory.module.css'

/** 11/17 기억 노트·유저노트 공통 머리 — 뒤로 가기와 두 노트 토글(옅은 회색)만. 사진·이름은 두지 않는다(사용자 요청). */
export async function NotesHeader({ sessionId, active }: { sessionId: string; active: 'memory' | 'note' }) {
  const t = await getT()
  const tab = (key: 'memory' | 'note', label: string) => <TransitionLink href={`/chat/${sessionId}/${key}`} replace aria-current={active === key ? 'page' : undefined} className={styles.tab}>{label}</TransitionLink>
  return (
    <header className={styles.header}>
      <Back href={`/chat/${sessionId}`} />
      <nav className={styles.tabs} aria-label={t('노트')}>{tab('memory', t('기억 노트'))}{tab('note', t('유저노트'))}</nav>
    </header>
  )
}
