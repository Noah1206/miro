import { TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './characters.module.css'

/** 내 캐릭터 / 내 음성 머리 탭(10/28) — 캐릭터와 음성을 따로 만들고, 캐릭터 만들기의 '음성' 탭에서 고른다. */
export async function MakeTabs({ active }: { active: 'characters' | 'voices' }) {
  const t = await getT()
  return (
    <nav aria-label={t('만든 것')} className={styles.tabs}>
      <TransitionLink href="/my/characters" aria-current={active === 'characters' ? 'page' : undefined}>{t('캐릭터')}</TransitionLink>
      <TransitionLink href="/my/voices" aria-current={active === 'voices' ? 'page' : undefined}>{t('음성')}</TransitionLink>
    </nav>
  )
}
