import { createHash } from 'node:crypto'
import { isUnveilPhoto } from '@/lib/unveil-photo'

/**
 * 11/25 작품 에셋(상황 사진) 등급 — 카드 뽑기와 상세 '에셋' 칸이 같이 쓴다.
 * UR = 언베일(알몸·성행위·adult 표시·unveil 파일) → 언베일 켠 성인 인증 회원에게만 주소를 보낸다.
 * SR = 속옷, R = 유혹·달아오름, N = 그 밖의 옷 입은 사진.
 */
export type Rarity = 'N' | 'R' | 'SR' | 'UR'
export type Asset = { id: string; img: string | null; rarity: Rarity }
type Raw = { image: string; tags?: string[]; outfit?: 'dressed' | 'bare'; adult?: true }

const SAFE = new Set(['유혹 포즈', '달아오름', '미소', '부끄러움', '데이트', '요리', '웨딩', '당황', '셀카', '속옷 차림', '평소', '고민', '비웃음', '삐짐', '운동', '쓰다듬기', '포옹', '화남', '슬픔', '눈물', '통화 중', '휴대폰'])

export function rarityOf(p: Raw): Rarity {
  const tags = p.tags ?? []
  if (p.outfit === 'bare' || p.adult || isUnveilPhoto(p.image) || tags.some(t => !SAFE.has(t))) return 'UR'
  if (tags.includes('속옷 차림')) return 'SR'
  if (tags.includes('유혹 포즈') || tags.includes('달아오름')) return 'R'
  return 'N'
}

/** 잠긴 카드에도 같은 id 가 있어야 도감에 쌓인다 — 주소 대신 해시(파일 이름에서 주소를 짐작 못 하게). */
const idOf = (src: string) => createHash('sha1').update(src.split('?')[0]!).digest('hex').slice(0, 12)

export function workAssets(raw: Raw[] | null | undefined, unveil: boolean): Asset[] {
  return (raw ?? []).filter(p => p?.image).map(p => {
    const rarity = rarityOf(p)
    return { id: idOf(p.image), img: rarity === 'UR' && !unveil ? null : p.image, rarity }
  })
}

if (process.argv[1]?.endsWith('assets.ts')) {
  console.assert(rarityOf({ image: '/a.jpg', outfit: 'bare' }) === 'UR')
  console.assert(rarityOf({ image: '/a.jpg', outfit: 'dressed', tags: ['기승위'] }) === 'UR')
  console.assert(rarityOf({ image: '/a.jpg', outfit: 'dressed', tags: ['속옷 차림'] }) === 'SR')
  console.assert(rarityOf({ image: '/a.jpg', outfit: 'dressed', tags: ['유혹 포즈'] }) === 'R')
  console.assert(rarityOf({ image: '/a.jpg', outfit: 'dressed', tags: ['미소'] }) === 'N')
  console.assert(workAssets([{ image: '/x/u.jpg', outfit: 'bare' }], false)[0]!.img === null)
}
