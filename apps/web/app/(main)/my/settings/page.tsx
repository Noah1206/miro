import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { LANGUAGES } from '@miro/domain'
import { currentUser } from '@/lib/auth'
import { SettingsPage } from '@/components/ui/settings-page'
import { InstallAppButton } from '@/components/pwa-install'
import { getLanguage, getT } from '@/lib/i18n/server'
import { MenuItemContent, MenuRow, MenuSection } from '../menu'
import { VerificationSheet } from '../verify/verification-sheet'
import { ProfileIcon } from '../profile-icon'
import { OPERATOR } from '@/lib/legal/operator'
import { faqList } from '@/lib/faq'
import styles from '../my.module.css'

/** 프로필 화면의 색 변수 — 메뉴 줄(my.module.css)이 이 값을 읽는다. */
const PROFILE_VARS = { '--profile-bg': '#1c1c1c', '--profile-surface': '#262626', '--profile-control': '#303030', '--profile-text': '#f7f7f7', '--profile-muted': '#aaa', '--profile-divider': '#ffffff0e' } as CSSProperties

/** 11/20 사용자: 프로필의 설정 버튼이 여는 페이지 — 프로필에 있던 '앱 설정'·'고객지원'·'자주 묻는 질문'을 그대로 옮겼다. */
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
        <MenuSection title={t('고객지원')}>
          <MenuRow href={`mailto:${OPERATOR.email}`} label={t('문의하기')} icon="help" />{/* 11/12 사용자: 이메일 주소는 표시하지 않음(누르면 메일 앱) */}
          <MenuRow href="/my/ai-data" label={t('AI 개선 참여')} icon="data" />
        </MenuSection>
        {/* 11/13 사용자: 홈에 있던 자주 묻는 질문을 프로필 섹션으로. 원문 한국어라 한국어 화면에서만. */}
        {language === 'ko' && <MenuSection title="자주 묻는 질문">
          {faqList().map(([q, a]) => (
            <details key={q} className={styles.faq}>
              <summary className={styles.row}><span className={styles.rowCopy}><span className={styles.rowLabel}>{q}</span></span><span className={styles.chevron}><ProfileIcon name="chevron" size={16} /></span></summary>
              <p>{a}</p>
            </details>
          ))}
        </MenuSection>}
      </div>
    </SettingsPage>
  )
}
