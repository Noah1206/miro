import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { resolveTarget } from '@/lib/ops/reports'
import { Page, PageHeader } from '@/components/ui'
import { ReportForm } from './form'
import { getT } from '@/lib/i18n/server'

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { type, id } = await searchParams
  const t = await getT()
  const kind = (['message', 'photo', 'live_scene'] as const).find((x) => x === type)
  const target = kind && id ? await resolveTarget(user.id, { type: kind, id }) : null
  if (!kind || !id || !target) return <Page><p className="empty-state empty-state--fill">{t('신고할 콘텐츠를 찾을 수 없습니다.')}</p></Page>
  const preview = typeof target.snapshot.content === 'string' ? target.snapshot.content : `${target.snapshot.location ?? ''} · ${target.snapshot.time ?? ''}`
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader title={t('이 내용을 신고합니다')} lead={t('운영 검토에 필요한 범위만 함께 전달됩니다.')} />
      <blockquote className="t-caption t-quote" style={{ margin: '0 0 18px', padding: 14, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap' }}>
        {kind === 'photo' ? t('[사진]') : kind === 'live_scene' ? '[Live Scene] ' : ''}{preview}
      </blockquote>
      <ReportForm type={kind} id={id} />
    </Page>
  )
}
