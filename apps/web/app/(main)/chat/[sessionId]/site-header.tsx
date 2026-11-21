import type { AccountProfile } from '@/lib/account-profile'
import { HomeUnveilToggle } from '@/app/(main)/home/unveil-toggle'
import { HeaderProfile } from '@/app/(main)/home/profile-link'
import { HeaderWallet } from '@/components/header-wallet'
import homeStyles from '@/app/(main)/home/home.module.css'
import styles from './chat.module.css'

/**
 * 11/10 사용자(크랙 참고): 대화방에서도 사이트 헤더가 보여야 한다 — 데스크톱에서만 대화방 위에 한 줄.
 * 오른쪽은 홈 헤더와 같은 도구(언베일·프로필, 알림 종은 11/22 사용자 요청으로 뺐다). 왼쪽 주요 메뉴(홈·탐색·만들기·대화)도 11/22 사용자 요청으로 뺐다. 모바일은 화면이 좁아 그대로 둔다(chat.module.css).
 */
export function ChatSiteHeader({ unveil, profile }: { unveil: boolean; profile: AccountProfile }) {
  return (
    <div className={styles.siteHeader}>
      <div className={homeStyles.headerTools} style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <HeaderWallet />
        <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn />
        <HeaderProfile initial={profile} />
      </div>
    </div>
  )
}
