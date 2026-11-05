import { Black_Han_Sans } from 'next/font/google'
import { UnveilUnlock } from './unveil-unlock'

/** 홈 언베일 마크와 같은 글꼴·그라데이션. */
const markFont = Black_Han_Sans({ weight: '400', subsets: ['latin'], display: 'swap', preload: false })

/**
 * 언베일 썸네일 표시(11/4) — 대표 사진이 언베일 수위인 캐릭터. veiled 면 사진을 흐리고 가운데에 크게, 아니면 모서리에 작게.
 * 사진을 감싼 position:relative 상자 안에 둔다.
 */
export function UnveilCover({ veiled, label, unlock, hideLabel }: { veiled?: boolean; label: string
  /** 11/6: 콘텐츠 카드에서는 '언베일' 글자 태그를 빼고 흐림만. */
  hideLabel?: boolean
  /** 11/4: 흐린 사진을 누르면 성인 본인인증 → 언베일 켜기(상세 화면). 카드처럼 링크 안이면 넘기지 않는다. */
  unlock?: { signedIn: boolean; returnTo: string } }) {
  return <>
    {veiled && <span aria-hidden style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(22px) saturate(1.1)', WebkitBackdropFilter: 'blur(22px) saturate(1.1)', background: 'rgb(0 0 0 / .25)', zIndex: 2 }} />}
    {veiled && unlock && <UnveilUnlock {...unlock} />}
    {!hideLabel && <span className={markFont.className} style={{
      position: 'absolute', zIndex: 3, ...(veiled ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 22, padding: '4px 12px' } : { right: 8, top: 8, fontSize: 12, padding: '2px 8px' }),
      borderRadius: 999, background: 'rgb(0 0 0 / .45)', color: '#ff6a5c', backgroundImage: 'none', letterSpacing: '.02em', pointerEvents: 'none',
    }}>
      <span style={{ background: 'linear-gradient(90deg, #ff3d7f, #ff9a3d)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{label}</span>
    </span>}
  </>
}
