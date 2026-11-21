import { UnveilUnlock } from './unveil-unlock'

/**
 * 언베일 썸네일 표시(11/4) — 대표 사진이 언베일 수위인 캐릭터. veiled 면 사진을 흐리고 가운데에 크게, 아니면 모서리에 작게.
 * 사진을 감싼 position:relative 상자 안에 둔다.
 */
export function UnveilCover({ veiled, label, unlock, hideLabel, bleed }: { veiled?: boolean; label: string
  /** 11/21 사용자: 카드 아래 가장자리에 흐림이 덜 덮여 사진 줄이 비쳤다 — 넘치는 걸 잘라 주는 상자(카드) 안에서는 흐림을 8px 더 넓게 깐다. */
  bleed?: boolean
  /** 11/6: 콘텐츠 카드에서는 '언베일' 글자 태그를 빼고 흐림만. */
  hideLabel?: boolean
  /** 11/4: 흐린 사진을 누르면 성인 본인인증 → 언베일 켜기(상세 화면). 카드처럼 링크 안이면 넘기지 않는다. */
  unlock?: { signedIn: boolean; returnTo: string } }) {
  const size = veiled ? 44 : 20
  return <>
    {/* 11/13 사용자: 흐림을 더 세게 — 14px·.12(11/9)에서 36px·.38 로(몸 윤곽도 안 읽히게, 색 정도만). */}
    {veiled && <span aria-hidden style={{ position: 'absolute', inset: bleed ? -8 : 0, backdropFilter: 'blur(36px) saturate(1.1)', WebkitBackdropFilter: 'blur(36px) saturate(1.1)', background: 'rgb(0 0 0 / .38)', zIndex: 2 }} />}
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

/**
 * 11/21 사용자: 언베일 작품(언베일 전용 + 표지가 언베일 사진) 카드의 오른쪽 위 작은 표시 — 반투명 검은 동그라미에 분홍 하트 열쇠구멍.
 * 사진을 감싼 position:relative 상자 안에 둔다. 같은 그라데이션 정의가 여러 카드에 겹쳐도 모양이 같아 문제없다.
 */
export function UnveilHeart({ size = 30 }: { size?: number }) {
  return <svg role="img" aria-label="언베일" viewBox="0 0 40 40" width={size} height={size} style={{ position: 'absolute', top: 7, right: 7, zIndex: 3, pointerEvents: 'none' }}>
    <defs><linearGradient id="miro-unveil-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd0e3" /><stop offset=".55" stopColor="#ff7eb6" /><stop offset="1" stopColor="#e9478f" /></linearGradient></defs>
    {/* 11/21 사용자: 반투명 검은 바탕 위에 하트(어떤 사진 위에서도 잘 보이게). 같은 날 동그라미→정사각형, 바탕 40→26→30px·하트 약 18→17px. */}
    <rect x=".5" y=".5" width="39" height="39" rx="6" fill="#000" fillOpacity=".5" />
    <g transform="translate(20 20.4) scale(.84) translate(-20 -20.75)">
      <path d="M20 33.5S6.5 25.6 6.5 15.8C6.5 11.3 9.9 8 14 8c2.6 0 4.8 1.4 6 3.4C21.2 9.4 23.4 8 26 8c4.1 0 7.5 3.3 7.5 7.8 0 9.8-13.5 17.7-13.5 17.7z" fill="url(#miro-unveil-heart)" stroke="#ffffff66" strokeWidth="1" />
      <circle cx="20" cy="17.5" r="3" fill="#3a1528" />
      <path d="M18.6 19.5h2.8l.9 6h-4.6z" fill="#3a1528" />
    </g>
  </svg>
}
