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
import { AudienceSelect } from './audience-select'
import { InstallAppHint } from '@/components/pwa-install'
import { accountProfile } from '@/lib/account-profile'
import { HeaderProfile } from './profile-link'
import { HomeViewBeacon } from './view-beacon'
import { HomeAgeGate } from './age-gate'
import type { HomeCard } from '@/lib/home'
import { discoveryTagLabel } from '@/lib/discovery-filters'

/** 로그인 전(11/8) — 흐린 카드에도 제목·소개 글이 HTML 에 실리지 않게 글자를 비운다. 사진만 흐리게 보인다. */
const veil = (c: HomeCard): HomeCard => ({ ...c, name: '', role: null, occupation: null, relationshipKeywords: [], genre: null, tagline: null, caption: null, startingContext: null })

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home({ searchParams }: { searchParams: Promise<{ audience?: string }> }) {
  const user = await currentUser()
  // 남성향/여성향(11/4) — '전체' 버튼 창에서 고른다. 없으면 전체.
  const raw = (await searchParams).audience
  const audience = raw === 'male' || raw === 'female' ? raw : undefined
  // 목록과 안 읽은 연락 수를 함께 읽는다 — 알림 종 숫자가 목록을 기다리게 하지 않는다.
  const [sections, unread, unveil, profile] = await Promise.all([
    measured('nav.home_data', () => homeSections(user?.id ?? null, audience)).then(s => user ? s : { ...s, rising: s.rising.map(veil), popularMale: s.popularMale.map(veil), popularFemale: s.popularFemale.map(veil), originals: s.originals.map(veil), forYou: s.forYou.map(veil), fresh: s.fresh.map(veil), safety: [], tags: [], others: s.others.map(veil), filters: [] }),
    user ? unreadContactCount(user.id) : 0,
    homeUnveilEnabled(user?.id ?? null),
    user ? accountProfile(user) : null,
  ])
  const t = await getT()

  return (
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))', '--font-title-3': '16px' } as React.CSSProperties}>
      {/* 위 4px·아래 8px — 홈 화면에 추가한 앱의 상태 표시줄 여백은 유지한다. */}
      {/* 내용 높이 40 = 홈·미로 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header className={`sticky-head ${styles.header}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-1) + env(safe-area-inset-top)) var(--gutter) var(--space-2)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <span className={`${styles.headerItem} ${styles.headerLogo}`} style={{ display: 'block' }}><LogoMark size={30} /></span>

        <div className={styles.headerTools} style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: -8, marginLeft: 'auto' }}>
          <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn={!!user} />
          {/* 알림 종 — 빨간 숫자는 실제 안 읽은 연락 수(2026-09-30 요청). 로그인 전에는 누르면 로그인 시트가 뜬다. */}
          <NotificationBell unread={unread} signedIn={!!user} className={`hit ${styles.headerItem} ${styles.headerAction}`} />
          {profile && <HeaderProfile initial={profile} />}
          {/* 헤더에 로그인 버튼·내 정보 표시는 두지 않는다 — 로그인은 로그인이 필요한 곳(만들기·대화·나·알림)에 들어갈 때 시트로 묻는다(2026-09-30 요청). */}
        </div>
      </header>

      <InstallAppHint />
      <HomeViewBeacon />

      {/* 약관·처리방침 개정이 공지 중이면 초기화면에서 알린다(약관 제3조 ③). 평소엔 아무것도 그리지 않는다. */}
      <LegalRevisionNotice style={{ marginBottom: 'var(--space-3)' }} />
      {/* 컴퓨터에서만 보이는 배너 — 헤더 - 배너 - 캐릭터(2026-09-30 요청). */}
      <HomeBanner signedIn={!!user} />
      {/* 검색 — 배너 아래 전체 폭 입력창 모양(10/19). 누르면 검색 화면으로 가서 바로 입력. 모양은 검색 화면의 입력창과 같다. */}
      {(() => { const content = <>
      <div className={styles.searchRow}>
        <AudienceSelect groups={sections.filters} audience={audience} />
        <TransitionLink href="/search" prefetch={true} aria-label={t('검색')} className={styles.searchBar}>
          <span>{t('이름이나 키워드로 검색')}</span>
          <span className={styles.searchIcon} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg></span>
        </TransitionLink>
      </div>
      {/* 섹션형 홈(10/19, 위프·베이비챗) — 인기 순위 + 장르별 줄. 전체 목록(필터·정렬)은 탐색 탭(/explore). */}
      <h1 className="sr-only">{t('홈')}</h1>
      {/* 11/8 베이비챗 홈 분석 반영 — 신작 상승 → 남/여 인기 TOP 10 → 오리지널 신작 → 맞춤 → 유저 신작 → 태그 → 세이프티. 계산은 lib/home.ts homeSections. */}
      {sections.rising.length > 0 && <Row index={0} row={{ key: 'rising', title: t('🆕 지금 뜨는 신작'), subtitle: t('최근 3주 안에 나온 이야기 중 요즘 대화가 몰리는 순서'), items: sections.rising }} href="/explore" />}
      {sections.popularMale.length > 0 && <Row index={1} row={{ key: 'popular-male', title: t('🔥 남심 저격! 인기 남성향 TOP 10'), items: sections.popularMale }} href="/explore" />}
      {sections.popularFemale.length > 0 && <Row index={2} row={{ key: 'popular-female', title: t('💗 여심 저격! 인기 여성향 TOP 10'), items: sections.popularFemale }} href="/explore" />}
      {sections.originals.length > 0 && <Row index={3} row={{ key: 'originals', title: t('⭐ 미로 오리지널 신작'), items: sections.originals }} href="/explore" />}
      {sections.forYou.length > 0 && <Row index={4} row={{ key: 'for-you', title: user?.displayName ? t('💘 {name}님에게 맞춘 캐릭터', { name: user.displayName }) : t('💘 당신에게 맞춘 캐릭터'), items: sections.forYou }} href="/explore" />}
      {sections.fresh.length > 0 && <Row index={5} row={{ key: 'fresh', title: t('🌱 따끈따끈한 유저 신작'), items: sections.fresh }} href="/explore" />}
      {sections.tags.length > 0 && <section aria-labelledby="row-tags" style={{ marginBottom: 'var(--space-7)', padding: '0 var(--gutter)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 id="row-tags" className="t-title-3">{t('🏷️ 취향은 숨겨도 태그는 못 숨겨')}</h2>
          <TransitionLink href="/explore" className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('전체 보기')}</TransitionLink>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{sections.tags.map(tag => <TransitionLink key={tag} href={`/explore?tag=${encodeURIComponent(tag)}`} className="t-caption" style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--color-surface-2, rgba(255,255,255,.06))', color: 'var(--color-text-primary)' }}>#{discoveryTagLabel(tag)}</TransitionLink>)}</div>
      </section>}
      {sections.safety.length > 0 && <Row index={6} row={{ key: 'safety', title: t('🛡️ 놓치면 아쉬운 세이프티 인기 TOP 10'), subtitle: t('언베일 없이도 재밌는 이야기'), items: sections.safety }} href="/explore" />}
      {/* 10/28: 전체 캐릭터 격자 — 위 섹션에 나온 캐릭터도 포함. */}
      {sections.others.length > 0 && <AllCharacters items={sections.others} />}
      </>; return user ? content : <HomeAgeGate>{content}</HomeAgeGate> })()}
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
