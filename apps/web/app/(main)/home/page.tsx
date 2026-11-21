import { HomeUnveilToggle } from './unveil-toggle'
import { HeaderSearch } from './header-search'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { currentUser } from '@/lib/auth'
import { homeSections } from '@/lib/home'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { measured } from '@/lib/observe'
import { Row } from './row'
import { AllCharacters } from './all-characters'
import { HomeHero } from './hero'
import { SiteFooter } from '@/components/site-footer'
import styles from './home.module.css'
import { getLanguage, getT } from '@/lib/i18n/server'
import { AudienceSelect } from './audience-select'
import { accountProfile } from '@/lib/account-profile'
import { HeaderProfile, HeaderProfileGuest } from './profile-link'
import { HeaderWallet } from '@/components/header-wallet'
import { HomeViewBeacon, HomeVoiceWake } from './view-beacon'
import { VoiceSoonSheet } from './voice-soon-sheet'
import { feature, voicePaused } from '@miro/config'
import { discoveryTagLabel } from '@/lib/discovery-filters'
import { AfterMount } from '@/components/after-mount'

const SITE = 'https://miroapp.app'
const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/home`, name: '미로 AI 캐릭터챗', alternateName: ['미로', 'MIRO', 'miroapp.app'], inLanguage: 'ko-KR', publisher: { '@id': `${SITE}/#org` } },
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'MIRO', legalName: '스터플', url: SITE, logo: `${SITE}/icon-512.png` },
    {
      '@type': 'WebApplication', name: '미로 AI 캐릭터챗', alternateName: 'MIRO', url: `${SITE}/home`, applicationCategory: 'EntertainmentApplication', operatingSystem: 'Web, iOS, Android',
      inLanguage: ['ko', 'en', 'ja', 'zh'], image: `${SITE}/miro-share-v3.png`,
      description: '성격과 세계관을 가진 AI 캐릭터와 1:1로 대화하고 문자를 주고받는 AI 캐릭터챗. 나만의 캐릭터도 직접 만들 수 있다.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
  ],
}

/** 홈은 캐릭터 목록이 아니라 세계로 들어가는 입구다 — 주제를 가진 행으로 훑는다 (명세서 2.1). */
export default async function Home({ searchParams }: { searchParams: Promise<{ audience?: string }> }) {
  const user = await currentUser()
  // 남성향/여성향(11/4) — '전체' 버튼 창에서 고른다. 없으면 전체.
  const raw = (await searchParams).audience
  // 11/20 사용자: 여성향(남자 캐릭터)은 다시 홈에서 뺀다(11/13 뺌 → 11/15 되살림 → 11/20 뺌) — 공식 여성향 38개 비공개(목록 output/ads/hidden-female-2026-11-20.txt). 유저는 여성향을 계속 만들어 올릴 수 있다.
  const audience = raw === 'male' ? raw : undefined
  // 11/20 사용자: 알림 종을 뺐다 — 안 읽은 연락 수도 더는 읽지 않는다.
  const [sections, unveil, profile] = await Promise.all([
    measured('nav.home_data', () => homeSections(user?.id ?? null, audience)),  // 11/12: 로그인 전에도 이름·소개 그대로(19세 막 시절의 글자 비우기 삭제)
    homeUnveilEnabled(user?.id ?? null),
    user ? accountProfile(user) : null,
  ])
  const [t, language] = await Promise.all([getT(), getLanguage()])
  // 11/13 사용자: 인증 직후(하루)와 로그인 전에는 안내 시트(음성 예고·제작자 모집)를 띄우지 않는다 — 인증한 10명 중 9명이 홈에서 대화를 시작하지 않았다.
  const settled = !!user && (!user.adultVerifiedAt || Date.now() - new Date(user.adultVerifiedAt).getTime() > 86_400_000)

  return (
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))', '--font-title-3': '16px' } as React.CSSProperties}>
      {/* 위 4px·아래 8px — 홈 화면에 추가한 앱의 상태 표시줄 여백은 유지한다. */}
      {/* 내용 높이 40 = 홈·미로 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header className={`sticky-head ${styles.header}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-1) + env(safe-area-inset-top)) var(--gutter) var(--space-2)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <span className={`${styles.headerItem} ${styles.headerLogo}`} style={{ display: 'block' }}><LogoMark size={30} /></span>

        <div className={styles.headerTools} style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: -8, marginLeft: 'auto' }}>
          {user && <HeaderWallet />}
          {/* 11/20 사용자: 알림 종 삭제, 19 토글은 프로필 사진 옆, 그 왼쪽에 흰 검색 아이콘 — 누르면 검색 화면(최근 검색어·입력칸 포커스). */}
          <HeaderSearch signedIn={!!user} label={t('검색')} className={`hit ${styles.headerItem} ${styles.headerAction}`} />
          <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn={!!user} />
          {profile ? <HeaderProfile initial={profile} /> : !user && <HeaderProfileGuest />}
          {/* 헤더에 로그인 버튼·내 정보 표시는 두지 않는다 — 로그인은 로그인이 필요한 곳(만들기·대화·나·알림)에 들어갈 때 시트로 묻는다(2026-09-30 요청). */}
        </div>
      </header>

      <HomeViewBeacon signedIn={!!user} />
      {user && feature('characterVoice') && !voicePaused() && <HomeVoiceWake />}

      {/* 11/12 음성 서버가 멈춘 동안: 음성 모드 예고 시트(이 기기에 한 번, 로그인한 사람만). */}
      {settled && voicePaused() && <VoiceSoonSheet />}
      {/* 컴퓨터에서만 보이는 배너 — 헤더 - 배너 - 캐릭터(2026-09-30 요청). */}
      {/* 11/10 사용자: 로그인한 사람에겐 배너 대신 크랙식 추천(들어올 때마다 랜덤 6작품, 표지가 언베일인 작품은 뺀다). 로그인 전엔 가입 선물 배너 그대로. */}
      {/* 11/12 사용자: 로그인 전에도 크랙식 추천(데스크톱 소개 카드의 흐린 배경 포함) — 가입 선물 안내는 로그인 팝업의 선물 카드가 맡는다. */}
      {<HomeHero items={(() => {
        // 11/13 사용자: 여성향을 빼서 남성향 6, 순서는 섞는다.
        const all = [...new Map([...sections.originals, ...sections.rising, ...sections.popularMale, ...sections.forYou, ...sections.others].map(c => [c.id, c])).values()]
          .filter(c => c.images.length > 0 && !c.coverUnveil && (c.isPublic || c.isOfficial)).sort(() => Math.random() - 0.5)  /* 11/21 사용자: 내 비공개 작품은 추천 배너에서 뺀다 */
        return all.filter(c => c.audience === 'male').slice(0, 6)
      })()} />}
      {/* 검색 — 배너 아래 전체 폭 입력창 모양(10/19). 누르면 검색 화면으로 가서 바로 입력. 모양은 검색 화면의 입력창과 같다. */}
      {(() => { const content = <>
      <div className={styles.searchRow}>
        <AudienceSelect groups={sections.filters} audience={audience} />
        <TransitionLink href="/search" prefetch={true} aria-label={t('검색')} className={styles.searchBar}>
          <span>{t('이름이나 키워드로 검색')}</span>
          <span className={styles.searchIcon} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg></span>
        </TransitionLink>
      </div>
      {/* 10/28: 오리지널 작품 줄은 일단 가린다(사용자 요청). 다시 보이려면 <OriginalStoriesRow /> 를 되살린다. */}
      {/* 섹션형 홈(10/19, 위프·베이비챗) — 인기 순위 + 장르별 줄. 전체 목록(필터·정렬)은 탐색 탭(/explore). */}
      <h1 className="sr-only">{t('미로 AI 캐릭터챗')}</h1>
      {/* 11/13 SEO·AEO: 검색엔진·AI 답변용 구조화 데이터(사이트·운영 주체·앱). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }} />
      {/* 11/8 베이비챗 홈 분석 반영 — 신작 상승 → 남/여 인기 TOP 10 → 오리지널 신작 → 맞춤 → 유저 신작 → 태그 → 세이프티. 계산은 lib/home.ts homeSections. */}
      {sections.rising.length > 0 && <Row index={0} row={{ key: 'rising', title: t('🆕 지금 뜨는 신작'), subtitle: t('최근 3주 안에 나온 이야기 중 요즘 대화가 몰리는 순서'), items: sections.rising }} href="/explore" />}
      {sections.popularMale.length > 0 && <Row index={1} row={{ key: 'popular-male', title: t('🔥 남심 저격! 인기 남성향 TOP 10'), items: sections.popularMale }} href="/explore" />}
      {sections.originals.length > 0 && <Row index={3} row={{ key: 'originals', title: t('⭐ 미로 오리지널 신작'), items: sections.originals }} href="/explore" />}
      {sections.forYou.length > 0 && <Row index={4} row={{ key: 'for-you', title: user?.displayName ? t('💘 {name}님에게 맞춘 캐릭터', { name: user.displayName }) : t('💘 당신에게 맞춘 캐릭터'), items: sections.forYou }} href="/explore" />}
      {sections.fresh.length > 0 && <Row index={5} row={{ key: 'fresh', title: t('🌱 따끈따끈한 유저 신작'), items: sections.fresh }} href="/explore" />}
      {sections.tags.length > 0 && <section aria-labelledby="row-tags" style={{ marginBottom: 'var(--space-7)', padding: '0 var(--gutter)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 id="row-tags" className="t-title-3">{t('🏷️ 취향은 숨겨도 태그는 못 숨겨')}</h2>
          <TransitionLink href="/explore" className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('전체 보기')}</TransitionLink>
        </div>
        {/* 11/13 베이비챗식: 태그 글자(유부녀·NTR 등)는 브라우저에서만 그려 검색엔진이 사이트를 성인물로 분류하지 않게. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 30 }}><AfterMount>{sections.tags.map(tag => <TransitionLink key={tag} href={`/explore?tag=${encodeURIComponent(tag)}`} className="t-caption" style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--color-surface-2, rgba(255,255,255,.06))', color: 'var(--color-text-primary)' }}>#{discoveryTagLabel(tag)}</TransitionLink>)}</AfterMount></div>
      </section>}
      {sections.safety.length > 0 && <Row index={6} row={{ key: 'safety', title: t('🛡️ 놓치면 아쉬운 세이프티 인기 TOP 10'), subtitle: t('언베일 없이도 재밌는 이야기'), items: sections.safety }} href="/explore" />}
      {/* 10/28: 전체 캐릭터 격자 — 위 섹션에 나온 캐릭터도 포함. */}
      {sections.all.length > 0 && <AllCharacters items={sections.all} />}
      </>; return content })()}  {/* 11/12 사용자: 로그인 전 홈 전체를 가리던 19세 막 삭제 — 성인 표지·인트로는 언베일이 꺼진 동안 이미 가려진다. */}
      {/* 11/13 처음 온 사람에게 제작자 모집을 한 번 알린다(브라우저당 한 번, 다른 시트가 닫힌 뒤). */}
      {/* 11/21 사용자: 제작자 모집 시트(CreatorInvite)는 띄우지 않는다. */}
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
