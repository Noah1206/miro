'use client'
import { useAccountProfile } from '@/components/account-profile-provider'
import { CharacterPhoto } from '@/components/character-visual'
import { LogoMark, TransitionLink } from '@/components/ui'
import type { AccountProfile } from '@/lib/account-profile'
import { useT } from '@/lib/i18n/client'
import styles from './home.module.css'

/** 11/6 요청(베이비챗 헤더처럼): 알림 종 옆 내 프로필 사진 — 누르면 프로필(/my). 사진이 없으면 마크. */
export function HeaderProfile({ initial }: { initial: AccountProfile }) {
  const t = useT()
  const { profile } = useAccountProfile(initial)
  return (
    <TransitionLink href="/my" prefetch={true} aria-label={t('내 프로필')} className={`hit ${styles.headerAvatar}`}>
      {profile.avatarUrl ? <CharacterPhoto key={profile.avatarUrl} src={profile.avatarUrl} alt="" size="avatar" width={30} height={30} sizes="30px" /> : <span className="avatar-default"><LogoMark size={18} label="" /></span>}
    </TransitionLink>
  )
}
