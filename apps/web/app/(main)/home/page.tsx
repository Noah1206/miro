import { HomeUnveilToggle } from './unveil-toggle'
import { HeaderSearch } from './header-search'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { currentUser } from '@/lib/auth'
import { homeSections, hotCounts, mixAudience, type HomeCard } from '@/lib/home'
import { HotRanking, type HotTab } from './hot-ranking'
import { CharacterCard } from '@/components/character-card'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { measured } from '@/lib/observe'
import { SiteFooter } from '@/components/site-footer'
import styles from './home.module.css'
import { getLanguage, getT } from '@/lib/i18n/server'
import { accountProfile } from '@/lib/account-profile'
import { HeaderProfile, HeaderProfileGuest } from './profile-link'
import { HeaderWallet } from '@/components/header-wallet'
import { ThemeToggle } from '@/components/theme-toggle'
import { BannerSlider } from './banner-slider'
import { HomeViewBeacon, HomeVoiceWake } from './view-beacon'
import { VoiceSoonSheet } from './voice-soon-sheet'
import { feature, voicePaused } from '@miro/config'

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
  // 11/27 사용자: 비공개했던 여성향(남자 캐릭터)을 다시 연다(11/13 뺌 → 11/15 되살림 → 11/20 뺌 → 11/24 되살렸다 뺌 → 11/27 되살림) — 공식 여성향 38개 재공개(목록 output/ads/hidden-female-2026-11-20.txt).
  const audience = raw === 'male' || raw === 'female' ? raw : undefined
  // 11/20 사용자: 알림 종을 뺐다 — 안 읽은 연락 수도 더는 읽지 않는다.
  const [sections, unveil, profile] = await Promise.all([
    measured('nav.home_data', () => homeSections(user?.id ?? null, audience)),  // 11/12: 로그인 전에도 이름·소개 그대로(19세 막 시절의 글자 비우기 삭제)
    homeUnveilEnabled(user?.id ?? null),
    user ? accountProfile(user) : null,
  ])
  const [t, language] = await Promise.all([getT(), getLanguage()])
  // 11/25 사용자: 배너 아래 '지금 가장 핫한' — 기간별 대화한 사람 수 순, 탭마다 12개.
  const pool = sections.all.filter(c => c.isPublic || c.isOfficial)
  const hot = await hotCounts(pool.map(c => c.id))
  const cutoff = new Date(Date.now() - 21 * 864e5).toISOString()
  const rank = (key: 'live' | 'day' | 'month' | 'all', pick: (c: HomeCard) => boolean = c => (hot.get(c.id)?.[key] ?? 0) > 0) =>
    pool.filter(pick).sort((a, b) => (hot.get(b.id)?.[key] ?? 0) - (hot.get(a.id)?.[key] ?? 0) || (hot.get(b.id)?.all ?? 0) - (hot.get(a.id)?.all ?? 0) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 12)
  // 11/26 사용자: 탭은 신작·전체 두 개만. 신작 = 올리면 바로 1위(최근 3주 작품을 최신순), 전체 = 누적 인원 순.
  const hotLists: Record<HotTab, HomeCard[]> = { new: mixAudience(pool.filter(c => (c.createdAt ?? '') >= cutoff).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))).slice(0, 12), all: rank('all') }
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
          <ThemeToggle className={`hit ${styles.headerItem}`} />
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
      {/* 11/23 뺐다가 11/24 사용자 "배너 있어야 해" 로 되살림 — 좌우로 넘기는 작품 카드(휴대폰은 가운데 카드만). */}
      {/* 11/25 사용자: 배너는 한 장 — 창작자 아르곤 무료 이벤트(11/27~12/7). 누르면 만들기. 예전 작품 카드 배너(HomeHero)는 hero.tsx 에 그대로 있다. */}
      {/* 11/27 사용자: 배너가 3초마다 옆으로 자동으로 넘어간다 — 이벤트 배너 + 인기 작품 4개(언베일 표지는 뺀다). */}
      <BannerSlider eventLabel={t('제작자 이벤트: 작품을 공개하면 아르곤 무료')} works={hotLists.all.filter(c => !c.coverUnveil).slice(0, 4)} />
      <HotRanking lists={hotLists} />
      {/* 11/26 사용자: 그 밑은 탐색 탭처럼 작품 카드 격자(대화량 순). */}
      <div className={styles.grid} style={{ padding: '0 var(--gutter)' }}>{/* 11/27 사용자: 남성향 무리·여성향 무리로 나뉘지 않게 고르게 섞는다(각 쪽 안의 순서는 그대로). */mixAudience([...sections.all].filter(c => c.isPublic || c.isOfficial).sort((a, b) => b.plays - a.plays)).map(c => <CharacterCard key={c.id} c={c} />)}</div>
      {/* 11/25 사용자: 휴대폰·컴퓨터 모두 검색칸·전체 버튼·섹션 줄·작품 격자 없이 배너·지금 가장 핫한·신작만. 검색은 헤더 아이콘, 전체 목록은 탐색 탭. */}
      <h1 className="sr-only">{t('미로 AI 캐릭터챗')}</h1>
      {/* 11/13 SEO·AEO: 검색엔진·AI 답변용 구조화 데이터(사이트·운영 주체·앱). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }} />
      {/* 11/13 처음 온 사람에게 제작자 모집을 한 번 알린다(브라우저당 한 번, 다른 시트가 닫힌 뒤). */}
      {/* 11/21 사용자: 제작자 모집 시트(CreatorInvite)는 띄우지 않는다. */}
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
