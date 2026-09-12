import { Page, Reveal, TransitionLink } from '@/components/ui'
export default async function ReportDone({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  return (
    <Page style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Reveal>
        <h1 data-report-done className="t-title-2 t-quote" style={{ marginBottom: 10 }}>신고가 접수되었습니다</h1>
        <p className="t-caption">상태: 검토 대기{id && <> · 접수 번호 {id.slice(0, 8)}</>}</p>
        <TransitionLink href="/archive" className="t-caption" style={{ display: 'inline-block', marginTop: 'var(--space-5)', textDecoration: 'underline', color: 'var(--color-text-primary)' }}>돌아가기</TransitionLink>
      </Reveal>
    </Page>
  )
}
