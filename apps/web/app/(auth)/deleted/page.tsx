import { Page, TransitionLink } from '@/components/ui'
export default function Deleted() {
  return (
    <Page style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <h1 data-account-deleted className="t-title-2 t-quote" style={{ marginBottom: 10 }}>계정이 삭제되었습니다</h1>
        <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>그동안 함께해 주셔서 감사합니다.</p>
        <TransitionLink href="/login" className="t-caption" style={{ textDecoration: 'underline' }}>처음으로</TransitionLink>
      </div>
    </Page>
  )
}
