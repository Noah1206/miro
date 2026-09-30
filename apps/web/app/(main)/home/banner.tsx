import { WELCOME_GRANT } from '@miro/config'
import { ButtonLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './home.module.css'

/** 가입 선물 팝업의 '대화 시작하기' 와 같은 색 — 흰 바탕, 검은 글자, 양끝이 둥근 알약. 크기는 폭에 따라 .bannerCta 가 정한다. */
const CTA = { background: 'var(--color-white)', color: 'var(--color-black)', border: 0, borderRadius: 999 } as const

/**
 * 홈 배너(2026-09-30 요청: 헤더 - 배너 - 캐릭터). 코드에 둔 고정 안내 한 장. 글은 번역되도록 그림 밖에 둔다.
 * 비로그인은 가입 선물(버튼 없이 글로만 — 9/30 요청), 로그인했으면 선물은 이미 받았으니 미로 캐릭터를 소개한다.
 * 그림은 힉스필드(GPT Image 2.5, 21:9)를 잘라 쓴다 — 폰은 2.4:1(banner-*-m.webp), 컴퓨터는 6:1 띠(banner-*.webp).
 */
export async function HomeBanner({ signedIn }: { signedIn: boolean }) {
  const t = await getT()
  const art = signedIn ? 'banner-contact' : 'banner-gift'
  return (
    <section className={styles.banner}>
      {/* 비로그인은 선물 상자를 든 남자, 로그인은 빗속 창가에서 전화하는 남자. 꾸밈이라 읽지 않는다. <picture> 가 폭에 맞는 한 장만 받는다. */}
      <picture>
        <source media="(min-width: 1024px)" srcSet={`/${art}.webp`} width={2304} height={384} />
        {/* eslint-disable-next-line @next/next/no-img-element -- 배너 한 장, next/image 최적화가 필요 없다 */}
        <img src={`/${art}-m.webp`} alt="" aria-hidden width={1152} height={480} decoding="async" className={styles.bannerArt} />
      </picture>
      <div className={styles.bannerText}>
        {signedIn ? <>
          <p className={styles.bannerEyebrow}>{t('미로 캐릭터')}</p>
          <p className={styles.bannerTitle}>{t('대화가 끝나도 캐릭터가 먼저 연락해요')}</p>
          <p className={styles.bannerBody}>{t('미로 캐릭터는 현실에 사는 것처럼 문자와 전화로 먼저 찾아와요.')}</p>
          {/* 미로 탭은 없앴다 — 누르면 홈의 R 스위치를 켠 채로 캐릭터 목록으로 내려간다(2026-09-30). */}
          <ButtonLink href="/home?r=1#stories" className={styles.bannerCta} style={CTA}>{t('미로 캐릭터 보기')}</ButtonLink>
        </> : <>
          <p className={styles.bannerEyebrow}>{t('신규 가입 혜택')}</p>
          <p className={styles.bannerTitle}>{t('가입하면 {n} 크레딧을 선물로 드려요', { n: WELCOME_GRANT.units })}</p>
          <p className={styles.bannerBody}>{t('가입하고 프로필을 만들면 바로 받아요. 선물 크레딧으로 ECHO의 긴 장면 대화와 캐릭터 통화를 {n}일 동안 즐겨 보세요.', { n: WELCOME_GRANT.validDays })}</p>
        </>}
      </div>
    </section>
  )
}
