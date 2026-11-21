import { TransitionLink } from '@/components/ui'
import type { AccountProfile } from '@/lib/account-profile'
import { getT } from '@/lib/i18n/server'
import { HomeUnveilToggle } from '@/app/(main)/home/unveil-toggle'
import { HeaderProfile } from '@/app/(main)/home/profile-link'
import { HeaderWallet } from '@/components/header-wallet'
import homeStyles from '@/app/(main)/home/home.module.css'
import styles from './chat.module.css'

/**
 * 11/10 사용자(크랙 참고): 대화방에서도 사이트 헤더가 보여야 한다 — 데스크톱에서만 대화방 위에 한 줄.
 * 왼쪽은 주요 메뉴, 오른쪽은 홈 헤더와 같은 도구(언베일·프로필, 알림 종은 11/22 사용자 요청으로 뺐다). 모바일은 화면이 좁아 그대로 둔다(chat.module.css).
 */
export async function ChatSiteHeader({ unveil, profile }: { unveil: boolean; profile: AccountProfile }) {
  const t = await getT()
  const links: Array<[string, string]> = [['/home', t('홈')], ['/explore', t('탐색')], ['/create', t('만들기')], ['/archive', t('대화')]]
  return (
    <div className={styles.siteHeader}>
      <nav aria-label={t('주요 메뉴')} className={styles.siteNav}>
        {links.map(([href, label]) => <TransitionLink key={href} href={href}>{label}</TransitionLink>)}
      </nav>
      <div className={homeStyles.headerTools} style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <HeaderWallet />
        <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn />
        <HeaderProfile initial={profile} />
      </div>
    </div>
  )
}
