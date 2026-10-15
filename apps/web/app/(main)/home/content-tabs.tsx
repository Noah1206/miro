import { TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './content-tabs.module.css'

export async function HomeContentTabs({ active, inset = false }: { active: 'characters' | 'stories'; inset?: boolean }) {
  const t = await getT()
  return (
    <nav aria-label={t('전체 이야기')} className={`${styles.tabs} ${inset ? styles.inset : ''}`}>
      <TransitionLink href="/home" aria-current={active === 'characters' ? 'page' : undefined}>{t('캐릭터')}</TransitionLink>
      <TransitionLink href="/stories" aria-current={active === 'stories' ? 'page' : undefined}>{t('작품')}</TransitionLink>
    </nav>
  )
}
