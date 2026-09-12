import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { resolveTarget } from '@/lib/ops/reports'
import { ReportForm } from './form'

/** n31 — 신고 양식. 신고 대상과 사유 입력 영역을 표시한다. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { type, id } = await searchParams
  const t = (['message', 'photo', 'live_scene'] as const).find((x) => x === type)
  const target = t && id ? await resolveTarget(user.id, { type: t, id }) : null
  if (!t || !id || !target) {
    return <main style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>신고할 콘텐츠를 찾을 수 없습니다.</main>
  }
  const preview = typeof target.snapshot.content === 'string' ? target.snapshot.content : `${target.snapshot.location ?? ''} · ${target.snapshot.time ?? ''}`
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 14px' }}>콘텐츠 신고</h1>
      <blockquote style={{ margin: '0 0 18px', padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
        {t === 'photo' ? '[사진]' : t === 'live_scene' ? '[Live Scene] ' : ''}{preview}
      </blockquote>
      <ReportForm type={t} id={id} />
    </main>
  )
}
