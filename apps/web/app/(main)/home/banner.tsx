import { WELCOME_GRANT } from '@miro/config'
import { ButtonLink, LoginButton } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './home.module.css'

/** 가입 선물 팝업의 '대화 시작하기' 와 같은 버튼 — 흰 바탕, 검은 14px 글자, 양끝이 둥근 알약. */
const CTA = { minHeight: 44, padding: '4px 24px', fontSize: 14, background: 'var(--color-white)', color: 'var(--color-black)', border: 0, borderRadius: 999 } as const

/**
 * 컴퓨터 홈의 배너(2026-09-30 요청: 헤더 - 배너 - 캐릭터). 코드에 둔 고정 안내 한 장이고 폰에서는 보이지 않는다.
 * 비로그인은 가입 선물, 로그인했으면 선물은 이미 받았으니 미로 캐릭터를 소개한다. 글은 번역되도록 그림 밖에 둔다.
 */
export async function HomeBanner({ signedIn }: { signedIn: boolean }) {
  const t = await getT()
  return (
    <section className={styles.banner}>
      <div className={styles.bannerText}>
        {signedIn ? <>
          <p className={styles.bannerEyebrow}>{t('미로 캐릭터')}</p>
          <p className={styles.bannerTitle}>{t('대화가 끝나도 캐릭터가 먼저 연락해요')}</p>
          <p className={styles.bannerBody}>{t('미로 캐릭터는 현실에 사는 것처럼 문자와 전화로 먼저 찾아와요.')}</p>
          <ButtonLink href="/miro" style={CTA}>{t('미로 보러 가기')}</ButtonLink>
        </> : <>
          <p className={styles.bannerEyebrow}>{t('신규 가입 혜택')}</p>
          <p className={styles.bannerTitle}>{t('가입하면 {n} 크레딧을 선물로 드려요', { n: WELCOME_GRANT.units })}</p>
          <p className={styles.bannerBody}>{t('선물 크레딧은 ECHO 대화와 통화에 {n}일 동안 쓸 수 있어요.', { n: WELCOME_GRANT.validDays })}</p>
          <LoginButton variant="secondary" style={CTA}>{t('가입하고 선물 받기')}</LoginButton>
        </>}
      </div>
      {/* 선물 상자는 가입 선물 팝업의 힉스필드 그림, 미로 소개는 로고 마크. 꾸밈이라 읽지 않는다. 폰에서는 배너가 숨으므로 lazy. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 꾸밈 그림 한 장, next/image 최적화가 필요 없다 */}
      <img src={signedIn ? '/logo-mark.png' : '/welcome-gift.png'} alt="" aria-hidden width={200} height={200} loading="lazy" decoding="async" className={styles.bannerArt} />
    </section>
  )
}
