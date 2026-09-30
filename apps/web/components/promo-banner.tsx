import { ButtonLink, LoginTapArea } from '@/components/ui'
import styles from './promo-banner.module.css'

/** 가입 선물 팝업의 '대화 시작하기' 와 같은 색 — 흰 바탕, 검은 글자, 양끝이 둥근 알약. 크기는 폭에 따라 .cta 가 정한다. */
const CTA = { background: 'var(--color-white)', color: 'var(--color-black)', border: 0, borderRadius: 999 } as const

/**
 * 힉스필드 그림이 꽉 채우는 배너 — 홈과 미로가 함께 쓴다(2026-09-30). 코드에 둔 고정 안내라 글은 번역된 채로 넘겨받는다.
 * 그림은 21:9 를 잘라 쓴다 — 폰은 3:1(`{art}-m.webp`), 컴퓨터는 6:1 띠(`{art}.webp`). <picture> 가 폭에 맞는 한 장만 받는다.
 */
export function PromoBanner({ art, eyebrow, title, body, cta, textWidth, artX, loginLabel }: {
  art: string; eyebrow: string; title: string; body: string; cta?: { href: string; label: string }
  /** 폰에서 글이 차지하는 폭(기본 52%) — 인물이 왼쪽 가까이 서 있는 그림은 좁혀서 얼굴과 겹치지 않게. */
  textWidth?: string
  /** 컴퓨터에서 폭이 줄 때 그림을 어디 기준으로 자를지(기본 0% = 왼쪽 기준, 오른쪽을 자름). */
  artX?: string
  /** 있으면 배너 어디를 눌러도 로그인 시트가 뜬다 — 값은 스크린 리더가 읽는 버튼 이름(로그인 전 가입 선물 배너). */
  loginLabel?: string
}) {
  const vars = { ...(textWidth && { '--banner-text-w': textWidth }), ...(artX && { '--banner-art-x': artX }) } as React.CSSProperties
  return (
    <section className={styles.banner} style={vars}>
      <picture>
        <source media="(min-width: 1024px)" srcSet={`/${art}.webp`} width={2304} height={384} />
        {/* 꾸밈이라 읽지 않는다. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 배너 한 장, next/image 최적화가 필요 없다 */}
        <img src={`/${art}-m.webp`} alt="" aria-hidden width={1152} height={384} decoding="async" className={styles.art} />
      </picture>
      <div className={styles.text}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{body}</p>
        {cta && <ButtonLink href={cta.href} className={styles.cta} style={CTA}>{cta.label}</ButtonLink>}
      </div>
      {loginLabel && <LoginTapArea label={loginLabel} className={styles.tap} />}
    </section>
  )
}
