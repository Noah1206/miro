import { Page, Reveal, TransitionLink } from '@/components/ui'
export default async function Result({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'failed' } = await searchParams
  const copy: Record<string, [string, string]> = {
    success: ['이제 더 오래 머물 수 있어요', '지금부터 Pro 의 시간으로 이어집니다.'],
    restored: ['이용권이 돌아왔어요', '기존 구매의 자격이 이 계정에 연결되었습니다.'],
    nothing: ['복원할 이용권이 없어요', '이 계정으로 확인되는 유효한 구매가 없습니다.'],
    failed: ['결제가 완료되지 않았어요', 'Pro 자격은 적용되지 않았습니다. 다시 시도하거나 이용권 상태를 확인해 주세요.'],
  }
  const [title, body] = copy[status] ?? copy.failed!
  const ok = status === 'success' || status === 'restored'
  return (
    <Page style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Reveal>
        <h1 data-payment-result={status} className="t-title-2 t-quote" style={{ marginBottom: 10 }}>{title}</h1>
        <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>{body}</p>
        <TransitionLink href={ok ? '/my/subscription' : '/subscribe'} className="t-caption" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>{ok ? '이용권 상태 보기' : '다시 시도'}</TransitionLink>
      </Reveal>
    </Page>
  )
}
