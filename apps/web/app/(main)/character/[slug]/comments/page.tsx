import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getCharacterByKey } from '@/lib/characters'
import { countComments, listComments } from '@/lib/social'
import { Back, Page } from '@/components/ui'
import { CommentThread } from './thread'

/**
 * 댓글 전체 페이지 (레퍼런스 UI): 인기순/최신순 탭, 답글 1단계, 좋아요, 입력창.
 * 정렬은 쿼리로 받아 서버에서 이미 정렬된 목록을 내려준다 — 클라이언트는 답글 펼침만 다룬다.
 */
export default async function CommentsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const user = await currentUser()
  const { slug } = await params
  const { sort } = await searchParams
  const c = await getCharacterByKey(slug, user?.id ?? null)
  if (!c) notFound()

  const activeSort = sort === 'recent' ? 'recent' : 'popular'
  const [items, count] = await Promise.all([
    listComments(c.id, user?.id ?? null, 200, activeSort),
    countComments(c.id),
  ])

  return (
    <Page style={{ paddingBottom: 'var(--space-8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Back href={`/character/${slug}`} />
      </div>
      <h1 className="t-title-1" style={{ marginBottom: 16 }}>{c.name}에게 남긴 댓글 ({count})</h1>
      <CommentThread slug={slug} items={items} sort={activeSort} signedIn={Boolean(user)} />
    </Page>
  )
}
