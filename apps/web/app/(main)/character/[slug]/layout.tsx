import type { Metadata } from 'next'
import { getT } from '@/lib/i18n/server'
import { getCharacterByKey } from '@/lib/characters'
import { coverTitle } from '@/lib/editorial/cover-title'

/**
 * 11/13 검색 노출(베이비챗식): 탭 제목 고정 규칙(9/30)의 예외 — 캐릭터 상세만 '작품 제목 | MIRO'.
 * 성인 전용 작품은 Google 권장대로 rating=adult 를 붙여 나머지 페이지가 세이프서치에 같이 걸리지 않게 한다.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const c = await getCharacterByKey(slug, null)
  if (!c) { const t = await getT(); return { title: t('캐릭터') } }
  const title = `${coverTitle(c)} | MIRO`
  return {
    title: { absolute: title },
    alternates: { canonical: `/character/${slug}` },
    openGraph: { title, url: `/character/${slug}` },
    ...(c.adultOnly ? { other: { rating: 'adult' } } : {}),
  }
}
export default function L({ children }: { children: React.ReactNode }) { return children }
