import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { gameOf } from '@/lib/play/games'
import { PlayGameView } from './game'

/** 11/25 홍보용 미니게임 — 로그인 없이, AI 없이. 끝나면 결과 공유 + 작품 상세로. */
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const game = gameOf((await params).key)
  if (!game) return {}
  return { title: `${game.title} — 미로`, description: game.intro, openGraph: { title: game.title, description: game.intro, images: [game.hero] } }
}

export default async function PlayPage({ params }: { params: Promise<{ key: string }> }) {
  const game = gameOf((await params).key)
  if (!game) notFound()
  return <PlayGameView game={game} />
}
