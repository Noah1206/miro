import { styleFor } from '@/lib/ai/modal-image'

/**
 * 11/12 사용자: 작품마다 크리에이터 이름이 보이게 — 카드와 상세 화면의 해시태그 아래.
 * 회원이 만든 작품은 그 회원의 닉네임. 운영 계정이 올린 작품(slug official-*)은 그림체마다 다른 필명으로 보인다(그림체 = 한 작가라는 느낌).
 * 필명은 운영 계정의 필명일 뿐 별도 계정이 아니다 — 응원·보상은 지금처럼 운영 계정으로 간다.
 */
const PEN_NAMES: Record<string, string> = {
  'itim-noob': '달무리', 'kdh-noob': '새벽잉크', 'fa-noob': '모카', 'acdm-noob': '유리온실', 'isg-noob': '밤편지',
  'syh-noob': '설화담', srn: '먹빛', mojz: '청람', gda: '라일락', whif: '물망초',
}
export function creatorName(c: { slug?: string | null; audience?: 'male' | 'female' | null }, ownerName?: string | null): string {
  if (c.slug?.startsWith('official-')) return PEN_NAMES[styleFor(c.audience ?? 'male', c.slug)] ?? '라일락'
  return ownerName?.trim() ?? ''
}
