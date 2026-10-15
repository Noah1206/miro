import { Black_Han_Sans } from 'next/font/google'
import { WELCOME_GRANT } from '@miro/config'
import { LoginTapArea } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import styles from './welcome-banner.module.css'

const display = Black_Han_Sans({ weight: '400', subsets: ['latin'], preload: false, display: 'swap' })

/** Public welcome offer. Copy and the actual one-time grant share WELCOME_GRANT. */
export async function HomeBanner({ signedIn }: { signedIn: boolean }) {
  const t = await getT()
  const tokens = WELCOME_GRANT.units.toLocaleString('en-US')
  return <section className={styles.banner} aria-label={t('첫 만남 선물')}>
    <picture>
      <source media="(min-width: 1024px)" srcSet="/banners/welcome-baek-v1-2172.webp" />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative, already optimized responsive artwork */}
      <img src="/banners/welcome-baek-v1-1080.webp" width={1080} height={360} alt="" aria-hidden
        fetchPriority="high" decoding="async" className={styles.art} />
    </picture>
    <div className={styles.copy}>
      <p className={styles.eyebrow}>MIRO <span>· {t('첫 만남 선물')}</span></p>
      <p className={styles.title} style={{ fontFamily: display.style.fontFamily }}>
        <span>{t('첫 대화는,')}</span><span>{t('내가 살게요.')}</span>
      </p>
      <p className={styles.offer}>{t('가입하면')} <strong>{t('{n}토큰 무료', { n: tokens })}</strong></p>
      <p className={styles.terms}>{t('신규 계정 1회 · 지급 후 {n}일 사용', { n: WELCOME_GRANT.validDays })}</p>
    </div>
    <svg className={styles.spark} aria-hidden viewBox="0 0 28 42" fill="none"><path d="M12 0c0 10-2 13-9 15 7 2 9 5 9 15 0-10 2-13 9-15C14 13 12 10 12 0Z" fill="#c8b7f5"/><path d="M24 27c0 5-1 7-4 8 3 1 4 3 4 7 0-4 1-6 4-7-3-1-4-3-4-8Z" fill="#202025"/></svg>
    {!signedIn && <LoginTapArea label={t('무료 {n}토큰 받고 시작하기', { n: tokens })} className={styles.tap} />}
  </section>
}
