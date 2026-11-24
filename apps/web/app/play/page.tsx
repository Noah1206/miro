import type { Metadata } from 'next'
import { and, eq, isNull, like } from 'drizzle-orm'
import { characters, db } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { homeUnveilEnabled } from '@/lib/home-mode'
import { playCounts } from '@/lib/home'
import { workAssets } from '@/lib/play/assets'
import { CardGame } from './card-game'

export const metadata: Metadata = {
  title: '캐릭터 사진 카드 뽑기 — 미로',
  description: '로그인하면 매일 무료 5번, 인기 캐릭터 사진 카드를 뽑아 도감을 채워 보세요.',
}

/**
 * 11/25 홍보 미니게임 '사진 카드 수집' — 로그인한 회원이 하루 5번 뽑기(브라우저에 저장), 도감, 공유하면 +1.
 * 11/25 사용자: 작품의 모든 사진이 카드 — 남성향 공식 작품을 인기순(최근 7일 대화 인원) 탭으로, 고른 작품만 카드를 싣는다.
 * UR(언베일) 주소는 언베일 켠 성인 인증 회원에게만 — 그 밖엔 19 흐림 카드(lib/play/assets).
 */
export default async function PlayPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const [user, { w }] = await Promise.all([currentUser(), searchParams])
  const [unveil, rows] = await Promise.all([
    homeUnveilEnabled(user?.id ?? null),
    db.select({ id: characters.id, slug: characters.slug, name: characters.name, images: characters.images, situationImages: characters.situationImages })
      .from(characters).where(and(eq(characters.isPublic, true), like(characters.slug, 'official-m-%'), eq(characters.audience, 'male'), isNull(characters.deletedAt))),
  ])
  const works = rows.filter(r => r.slug && r.situationImages.length >= 5)
  const plays = await playCounts(works.map(r => r.id), 7)
  works.sort((a, b) => (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0) || b.situationImages.length - a.situationImages.length)
  const pick = works.find(r => r.slug === w) ?? works[0]
  if (!pick) return null
  const cards = workAssets(pick.situationImages, unveil)
  const cover = cards.find(c => c.rarity === 'N' && c.img)?.img ?? cards.find(c => c.img)?.img ?? pick.images[0] ?? ''
  return <CardGame tabs={works.map(r => ({ slug: r.slug!, title: r.name.replace(/\.$/, '') }))} set={{ slug: pick.slug!, title: pick.name.replace(/\.$/, ''), cover, cards }} signedIn={!!user} />
}
