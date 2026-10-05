import { currentUser } from '@/lib/auth'
import { homePage } from '@/lib/home'
import { LogoMark, Page } from '@/components/ui'
import { measured } from '@/lib/observe'
import { HomeFeed } from './feed'
import { HomeBanner } from './banner'
import { NotificationBell } from './bell'
import { SiteFooter } from '@/components/site-footer'
import { LegalRevisionNotice } from '@/components/legal-revision-notice'
import { unreadContactCount } from '@/lib/ops/archive'
import styles from './home.module.css'
import { getT } from '@/lib/i18n/server'

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home() {
  const user = await currentUser()
  // 목록과 안 읽은 연락 수를 함께 읽는다 — 알림 종 숫자가 목록을 기다리게 하지 않는다.
  const [page, unread] = await Promise.all([
    measured('nav.home_data', () => homePage(user?.id ?? null)),
    user ? unreadContactCount(user.id) : 0,
  ])
  const t = await getT()

  return (
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))' }}>
      {/* 위 여백은 8px 만 — 홈 화면에 추가한 앱에서는 상태 표시줄(safe-area)만큼 더 내린다. */}
      {/* 내용 높이 40 = 홈·미로 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) var(--space-5)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <span className={styles.headerItem} style={{ display: 'block' }}><LogoMark size={30} /></span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: -8 }}>
          {/* 알림 종 — 빨간 숫자는 실제 안 읽은 연락 수(2026-09-30 요청). 로그인 전에는 누르면 로그인 시트가 뜬다. */}
          <NotificationBell unread={unread} signedIn={!!user} className={`hit ${styles.headerItem} ${styles.headerAction}`} />
          {/* 헤더에 로그인 버튼·내 정보 표시는 두지 않는다 — 로그인은 로그인이 필요한 곳(만들기·대화·나·알림)에 들어갈 때 시트로 묻는다(2026-09-30 요청). */}
        </div>
      </header>

      {/* 약관·처리방침 개정이 공지 중이면 초기화면에서 알린다(약관 제3조 ③). 평소엔 아무것도 그리지 않는다. */}
      <LegalRevisionNotice style={{ marginBottom: 'var(--space-3)' }} />
      {/* 컴퓨터에서만 보이는 배너 — 헤더 - 배너 - 캐릭터(2026-09-30 요청). */}
      <HomeBanner signedIn={!!user} />
      <HomeFeed key={crypto.randomUUID()} initial={page} />
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
