import { HomeUnveilToggle } from './unveil-toggle'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { currentUser } from '@/lib/auth'
import { homeSections } from '@/lib/home'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { measured } from '@/lib/observe'
import { Row } from './row'
import { AllCharacters } from './all-characters'
import { HomeBanner } from './banner'
import { NotificationBell } from './bell'
import { SiteFooter } from '@/components/site-footer'
import { LegalRevisionNotice } from '@/components/legal-revision-notice'
import { unreadContactCount } from '@/lib/ops/archive'
import styles from './home.module.css'
import { getT } from '@/lib/i18n/server'
import { OriginalStoriesRow } from '../stories/home-row'
import { AudienceSelect } from './audience-select'
import { InstallAppHint } from '@/components/pwa-install'

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home() {
  const user = await currentUser()
  // 목록과 안 읽은 연락 수를 함께 읽는다 — 알림 종 숫자가 목록을 기다리게 하지 않는다.
  const [sections, unread, unveil] = await Promise.all([
    measured('nav.home_data', () => homeSections(user?.id ?? null)),
    user ? unreadContactCount(user.id) : 0,
    homeUnveilEnabled(user?.id ?? null),
  ])
  const t = await getT()

  return (
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))', '--font-title-3': '16px' } as React.CSSProperties}>
      {/* 위 4px·아래 8px — 홈 화면에 추가한 앱의 상태 표시줄 여백은 유지한다. */}
      {/* 내용 높이 40 = 홈·미로 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header className="sticky-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-1) + env(safe-area-inset-top)) var(--gutter) var(--space-2)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <span className={`${styles.headerItem} ${styles.headerLogo}`} style={{ display: 'block' }}><LogoMark size={30} /></span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: -8, marginLeft: 'auto' }}>
          <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn={!!user} />
          {/* 알림 종 — 빨간 숫자는 실제 안 읽은 연락 수(2026-09-30 요청). 로그인 전에는 누르면 로그인 시트가 뜬다. */}
          <NotificationBell unread={unread} signedIn={!!user} className={`hit ${styles.headerItem} ${styles.headerAction}`} />
          {/* 헤더에 로그인 버튼·내 정보 표시는 두지 않는다 — 로그인은 로그인이 필요한 곳(만들기·대화·나·알림)에 들어갈 때 시트로 묻는다(2026-09-30 요청). */}
        </div>
      </header>

      <InstallAppHint />

      {/* 약관·처리방침 개정이 공지 중이면 초기화면에서 알린다(약관 제3조 ③). 평소엔 아무것도 그리지 않는다. */}
      <LegalRevisionNotice style={{ marginBottom: 'var(--space-3)' }} />
      {/* 컴퓨터에서만 보이는 배너 — 헤더 - 배너 - 캐릭터(2026-09-30 요청). */}
      <HomeBanner signedIn={!!user} />
      {/* 검색 — 배너 아래 전체 폭 입력창 모양(10/19). 누르면 검색 화면으로 가서 바로 입력. 모양은 검색 화면의 입력창과 같다. */}
      <div className={styles.searchRow}>
        <AudienceSelect groups={sections.filters} />
        <TransitionLink href="/search" prefetch={true} aria-label={t('검색')} className={styles.searchBar}>
          <span>{t('이름이나 키워드로 검색')}</span>
          <span className={styles.searchIcon} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg></span>
        </TransitionLink>
      </div>
      <OriginalStoriesRow />
      {/* 섹션형 홈(10/19, 위프·베이비챗) — 인기 순위 + 장르별 줄. 전체 목록(필터·정렬)은 탐색 탭(/explore). */}
      <h1 className="sr-only">{t('홈')}</h1>
      {sections.ranking.length > 0 && <Row index={0} row={{ key: 'ranking', title: t('🔥 지금 가장 많이 대화하는 남자들'), subtitle: t('요즘 가장 많은 사람이 말을 건 캐릭터'), items: sections.ranking }} href="/explore" />}
      {sections.forYou.length > 0 && <Row index={1} row={{ key: 'for-you', title: user?.displayName ? t('💘 {name}님에게 맞춘 캐릭터', { name: user.displayName }) : t('💘 당신에게 맞춘 캐릭터'), items: sections.forYou }} href="/explore" />}
      {sections.recommended.length > 0 && <Row index={2} row={{ key: 'recommended', title: t('⭐ 미로 추천 캐릭터'), items: sections.recommended }} href="/explore" />}
      {/* 10/28: 전체 캐릭터 격자 — 위 섹션에 나온 캐릭터도 포함. */}
      {sections.others.length > 0 && <AllCharacters items={sections.others} />}
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
