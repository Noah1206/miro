import Link from 'next/link'
/** n57/n58 — 성공/실패/복원 결과. */
export default async function Result({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'failed' } = await searchParams
  const copy: Record<string, [string, string]> = {
    success: ['Pro 가 적용되었습니다', '지금부터 Pro 사용량으로 이어갈 수 있습니다.'],
    restored: ['구독이 복원되었습니다', '기존 구매의 자격이 이 계정에 연결되었습니다.'],
    nothing: ['복원할 구독이 없습니다', '이 계정으로 확인되는 유효한 구매 내역이 없습니다.'],
    failed: ['결제가 완료되지 않았습니다', 'Pro 자격은 적용되지 않았습니다. 다시 시도하거나 구독 상태를 확인해 주세요.'],
  }
  const [title, body] = copy[status] ?? copy.failed!
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 data-payment-result={status} style={{ fontSize: 20, margin: '0 0 10px' }}>{title}</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 24px' }}>{body}</p>
        <Link href={status === 'success' || status === 'restored' ? '/my/subscription' : '/subscribe'} style={{ fontSize: 13.5, textDecoration: 'underline', color: 'var(--text-secondary)' }}>
          {status === 'success' || status === 'restored' ? '구독 상태 보기' : '다시 시도'}
        </Link>
      </div>
    </main>
  )
}
