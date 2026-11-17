import { CharacterPhoto } from '@/components/character-visual'
import { Back, TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './memory.module.css'

/** 11/17 기억 노트·유저노트 공통 머리 — 제목 없이 캐릭터 사진·이름만, 아래 두 노트 탭. */
export async function NotesHeader({ sessionId, name, photo, active }: { sessionId: string; name: string; photo?: string | null; active: 'memory' | 'note' }) {
  const t = await getT()
  const tab = (key: 'memory' | 'note', label: string) => <TransitionLink href={`/chat/${sessionId}/${key}`} replace aria-current={active === key ? 'page' : undefined} className={styles.tab}>{label}</TransitionLink>
  return (
    <header className={styles.header}>
      <div className={styles.back}><Back href={`/chat/${sessionId}`} /></div>
      {photo && <span className={styles.avatar}><CharacterPhoto src={photo} alt="" size="avatar" width={72} height={72} sizes="72px" /></span>}
      <h1 className="t-title-2">{name}</h1>
      <nav className={styles.tabs} aria-label={t('노트')}>{tab('memory', t('기억 노트'))}{tab('note', t('유저노트'))}</nav>
    </header>
  )
}
