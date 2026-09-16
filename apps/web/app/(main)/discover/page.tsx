import { redirect } from 'next/navigation'

/**
 * 예전 '발견' 주소. 일반 캐릭터 검색이었으므로 /home/search 로 보낸다 — /miro 로 보내면
 * 공유된 검색 링크의 뜻이 바뀐다. 검색어는 그대로 넘긴다.
 */
export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q ?? '').trim().slice(0, 40)
  redirect(query ? `/home/search?q=${encodeURIComponent(query)}` : '/home/search')
}
