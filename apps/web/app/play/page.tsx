import type { Metadata } from 'next'
import { currentUser } from '@/lib/auth'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { CARD_SETS } from '@/lib/play/cards'
import { CardGame, type ClientSet } from './card-game'

export const metadata: Metadata = {
  title: '캐릭터 사진 카드 뽑기 — 미로',
  description: '매일 무료 3번, 인기 캐릭터 사진 카드를 뽑아 도감을 채워 보세요.',
}

/**
 * 11/25 홍보 미니게임 '사진 카드 수집' — 로그인 없이 하루 3번 뽑기(브라우저에 저장), 도감 채우기, 공유하면 +1.
 * UR(언베일) 카드 주소는 언베일이 켜진 성인 인증 회원에게만 보낸다 — 그 밖엔 주소 없이 잠금 카드.
 */
export default async function PlayPage() {
  const user = await currentUser()
  const unveil = await homeUnveilEnabled(user?.id ?? null)
  const sets: ClientSet[] = CARD_SETS.map(s => ({
    ...s,
    cover: s.cards[0]!.img,
    cards: s.cards.map(c => c.rarity === 'UR' && !unveil ? { ...c, img: null, caption: '' } : c),
  }))
  return <CardGame sets={sets} signedIn={!!user} />
}
