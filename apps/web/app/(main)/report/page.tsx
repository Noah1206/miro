import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { resolveTarget } from '@/lib/ops/reports'
import { Page, PageHeader } from '@/components/ui'
import { ReportForm } from './form'

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { type, id } = await searchParams
  const t = (['message', 'photo', 'live_scene'] as const).find((x) => x === type)
  const target = t && id ? await resolveTarget(user.id, { type: t, id }) : null
  if (!t || !id || !target) return <Page style={{ textAlign: 'center' }}><p className="t-caption" style={{ paddingTop: 'var(--space-8)' }}>신고할 콘텐츠를 찾을 수 없습니다.</p></Page>
  const preview = typeof target.snapshot.content === 'string' ? target.snapshot.content : `${target.snapshot.location ?? ''} · ${target.snapshot.time ?? ''}`
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader title="이 내용을 신고합니다" lead="운영 검토에 필요한 범위만 함께 전달됩니다." />
      <blockquote className="t-caption t-quote" style={{ margin: '0 0 18px', padding: 14, background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap' }}>
        {t === 'photo' ? '[사진]' : t === 'live_scene' ? '[Live Scene] ' : ''}{preview}
      </blockquote>
      <ReportForm type={t} id={id} />
    </Page>
  )
}
