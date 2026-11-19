import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { LANGUAGES } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { SettingsPage } from '@/components/ui/settings-page'
import { InstallAppButton } from '@/components/pwa-install'
import { getLanguage, getT } from '@/lib/i18n/server'
import { MenuItemContent, MenuRow, MenuSection } from '../menu'
import { VerificationSheet } from '../verify/verification-sheet'
import styles from '../my.module.css'

/** 프로필 화면의 색 변수 — 메뉴 줄(my.module.css)이 이 값을 읽는다. */
const PROFILE_VARS = { '--profile-bg': '#1c1c1c', '--profile-surface': '#262626', '--profile-control': '#303030', '--profile-text': '#f7f7f7', '--profile-muted': '#aaa', '--profile-divider': '#ffffff0e' } as CSSProperties

/** 11/20 사용자: 프로필의 설정 버튼이 여는 페이지 — 프로필에 있던 '앱 설정' 줄을 그대로 옮겼다. */
export default async function SettingsHome({ searchParams }: { searchParams: Promise<{ verify?: string; r?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login?next=/my/settings')
  const [t, language, { verify, r }] = await Promise.all([getT(), getLanguage(), searchParams])
  return (
    <SettingsPage title={t('설정')}>
      <div className={styles.sections} style={PROFILE_VARS}>
        <MenuSection title={t('앱 설정')}>
          <InstallAppButton className={styles.row}><MenuItemContent label={t('홈 화면에 추가')} icon="download" /></InstallAppButton>
          <MenuRow href="/my/language" label={t('언어')} end={LANGUAGES[language]} icon="globe" />
          <VerificationSheet initiallyVerified={!!user.adultVerifiedAt} autoOpen={verify === '1'} result={r} />
          <MenuRow href="/my/permissions" label={t('알림·접근 권한')} icon="bell" />
        </MenuSection>
      </div>
    </SettingsPage>
  )
}
