import { HomeUnveilToggle } from './unveil-toggle'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { currentUser } from '@/lib/auth'
import { homeSections } from '@/lib/home'
import { LogoMark, Page, TransitionLink } from '@/components/ui'
import { measured } from '@/lib/observe'
import { Row } from './row'
import { HomeBanner } from './banner'
import { NotificationBell } from './bell'
import { SiteFooter } from '@/components/site-footer'
import { LegalRevisionNotice } from '@/components/legal-revision-notice'
import { unreadContactCount } from '@/lib/ops/archive'
import styles from './home.module.css'
import { getT } from '@/lib/i18n/server'
import { OriginalStoriesRow } from '../stories/home-row'

/** 섹션 제목은 이모지 하나 + 문장(베베챗식, 10/19). 목록에 없는 장르는 기본 문장. */
const GENRE_TITLES: Record<string, string> = {
  '현대': '🌆 오늘 밤, 도시에서 마주친 남자',
  '현대 판타지': '🌙 평범한 하루에 끼어든 비밀',
  '동양 무협': '⚔️ 칼끝 위에서 피어난 인연',
  '가이드버스': '🔮 당신만이 그를 진정시킬 수 있어',
  '마교': '🩸 피의 교단, 그 안의 다정함',
  '수인': '🐾 귀와 꼬리를 숨긴 남자들',
  '오메가버스': '💫 운명의 향이 이끄는 관계',
  '시한': '⏳ 남은 시간이 얼마 없어',
}

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
    <Page immersive wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-3))' }}>
      {/* 위 4px·아래 8px — 홈 화면에 추가한 앱의 상태 표시줄 여백은 유지한다. */}
      {/* 내용 높이 40 = 홈·미로 공통 — 탭을 옮겨도 마크가 같은 자리에 있다. */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, boxSizing: 'content-box', padding: 'calc(var(--space-1) + env(safe-area-inset-top)) var(--gutter) var(--space-2)' }}>
        {/* 마크 하나만 — 글자 없이 마크가 이름을 맡는다. 오른쪽 아이콘 상자(34px)와 눈높이가 맞는 크기. */}
        <span className={`${styles.headerItem} ${styles.headerLogo}`} style={{ display: 'block' }}><LogoMark size={30} /></span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: -8, marginLeft: 'auto' }}>
          <HomeUnveilToggle key={String(unveil)} enabled={unveil} signedIn={!!user} />
          {/* 알림 종 — 빨간 숫자는 실제 안 읽은 연락 수(2026-09-30 요청). 로그인 전에는 누르면 로그인 시트가 뜬다. */}
          <NotificationBell unread={unread} signedIn={!!user} className={`hit ${styles.headerItem} ${styles.headerAction}`} />
          {/* 헤더에 로그인 버튼·내 정보 표시는 두지 않는다 — 로그인은 로그인이 필요한 곳(만들기·대화·나·알림)에 들어갈 때 시트로 묻는다(2026-09-30 요청). */}
        </div>
      </header>

      {/* 약관·처리방침 개정이 공지 중이면 초기화면에서 알린다(약관 제3조 ③). 평소엔 아무것도 그리지 않는다. */}
      <LegalRevisionNotice style={{ marginBottom: 'var(--space-3)' }} />
      {/* 컴퓨터에서만 보이는 배너 — 헤더 - 배너 - 캐릭터(2026-09-30 요청). */}
      <HomeBanner signedIn={!!user} />
      {/* 검색 — 헤더에서 배너 아래로 옮김(2026-10-19 요청). 오른쪽 끝, 헤더 아이콘과 같은 상자 크기. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: 'calc(-1 * var(--space-3)) var(--gutter) var(--space-3)' }}>
        <TransitionLink href="/search" aria-label={t('검색')} className={`hit ${styles.headerAction}`} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg>
        </TransitionLink>
      </div>
      <OriginalStoriesRow />
      {/* 섹션형 홈(10/19, 위프·베이비챗) — 인기 순위 + 장르별 줄. 전체 목록(필터·정렬)은 탐색 탭(/explore). */}
      <h1 className="sr-only">{t('홈')}</h1>
      {sections.ranking.length > 0 && <Row index={0} ranked row={{ key: 'ranking', title: t('🔥 지금 가장 많이 대화하는 남자들'), items: sections.ranking }} href="/explore" />}
      {sections.genres.map((row, i) => <Row key={row.key} index={i + 1} row={{ ...row, title: GENRE_TITLES[row.key] ? t(GENRE_TITLES[row.key]!) : t('✨ {genre} 이야기 모아 보기', { genre: row.title }) }} href={`/explore?genre=${encodeURIComponent(row.key)}`} />)}
      {/* 초기화면의 사업자 정보·약관·호스팅 제공자·고객문의(전자상거래법 제10조, 10/5). */}
      <SiteFooter />
    </Page>
  )
}
