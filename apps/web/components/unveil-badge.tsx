import { UnveilUnlock } from './unveil-unlock'

/**
 * 언베일 썸네일 표시(11/4) — 대표 사진이 언베일 수위인 캐릭터. veiled 면 사진을 흐리고 가운데에 크게, 아니면 모서리에 작게.
 * 사진을 감싼 position:relative 상자 안에 둔다.
 */
export function UnveilCover({ veiled, label, unlock, hideLabel }: { veiled?: boolean; label: string
  /** 11/6: 콘텐츠 카드에서는 '언베일' 글자 태그를 빼고 흐림만. */
  hideLabel?: boolean
  /** 11/4: 흐린 사진을 누르면 성인 본인인증 → 언베일 켜기(상세 화면). 카드처럼 링크 안이면 넘기지 않는다. */
  unlock?: { signedIn: boolean; returnTo: string } }) {
  const size = veiled ? 44 : 20
  return <>
    {veiled && <span aria-hidden style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(22px) saturate(1.1)', WebkitBackdropFilter: 'blur(22px) saturate(1.1)', background: 'rgb(0 0 0 / .25)', zIndex: 2 }} />}
    {veiled && unlock && <UnveilUnlock {...unlock} />}
    {/* 11/7 사용자: '언베일' 글자 대신 19 아이콘 — 홈 머리 스위치와 같은 청소년유해표시(빨간 테두리 원, 흰 바탕, 검은 19). */}
    {!hideLabel && <svg role="img" aria-label={label} viewBox="0 0 40 40" width={size} height={size} style={{
      position: 'absolute', zIndex: 3, ...(veiled ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } : { right: 8, top: 8 }), pointerEvents: 'none',
    }}>
      <circle cx="20" cy="20" r="17.5" fill="#fff" stroke="#e60012" strokeWidth="4" />
      <text x="20" y="26.5" textAnchor="middle" fontSize="18" fontWeight="900" fill="#000" style={{ fontFamily: 'Pretendard, system-ui, sans-serif', letterSpacing: '-0.5px' }}>19</text>
    </svg>}
  </>
}
