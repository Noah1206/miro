import { WELCOME_GRANT } from '@miro/config'
import { PromoBanner } from '@/components/promo-banner'
import { getT } from '@/lib/i18n/server'

/**
 * 홈 배너(2026-09-30 요청: 헤더 - 배너 - 캐릭터). 비로그인은 가입 선물(버튼 없이 글로만, 배너를 누르면 로그인 시트), 로그인했으면 선물은 이미 받았으니
 * 미로 캐릭터를 소개하고 미로로 보낸다. 그림은 선물 상자를 든 남자 / 빗속 창가에서 전화하는 남자(힉스필드).
 */
export async function HomeBanner({ signedIn }: { signedIn: boolean }) {
  const t = await getT()
  return signedIn
    ? <PromoBanner art="banner-contact" eyebrow={t('미로 캐릭터')} title={t('대화가 끝나도 캐릭터가 먼저 연락해요')}
        body={t('미로 캐릭터는 현실에 사는 것처럼 문자와 전화로 먼저 찾아와요.')} cta={{ href: '/miro', label: t('미로 보러 가기') }} />
    : <PromoBanner art="banner-gift" eyebrow={t('신규 가입 혜택')} title={t('가입하면 {n} 크레딧을 선물로 드려요', { n: WELCOME_GRANT.units })}
        body={t('가입하고 프로필을 만들면 바로 받아요. 선물 크레딧으로 ECHO의 긴 장면 대화와 캐릭터 통화를 {n}일 동안 즐겨 보세요.', { n: WELCOME_GRANT.validDays })}
        loginLabel={t('가입하고 선물 받기')} />
}
