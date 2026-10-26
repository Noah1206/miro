'use client'
import type { HomeSort } from '@/lib/home'
import { useT } from '@/lib/i18n/client'
import styles from './content-tabs.module.css'
import section from '@/components/ui/section-tabs.module.css'

export function HomeContentTabs({ active, onChange }: { active: HomeSort; onChange: (sort: HomeSort) => void }) {
  const t = useT()
  const options = [
    { key: 'latest', label: t('최신순') },
    { key: 'ranking', label: t('랭킹순') },
    { key: 'reviews', label: t('후기순') },
  ] as const
  return (
    <div role="group" aria-label={t('정렬')} className={`${section.bar} ${section.fullBleed} ${styles.tabs}`}>
      {options.map(option => <button className={section.item} key={option.key} type="button" aria-pressed={active === option.key} onClick={() => onChange(option.key)}>{option.label}</button>)}
    </div>
  )
}
