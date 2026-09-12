import Link from 'next/link'
/** n33 — 접수 완료. 접수 상태를 표시한다. */
export default async function ReportDone({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 data-report-done style={{ fontSize: 20, margin: '0 0 10px' }}>신고가 접수되었습니다</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 6px' }}>상태: 검토 대기</p>
        {id && <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 24px' }}>접수 번호 {id.slice(0, 8)}</p>}
        <Link href="/archive" style={{ fontSize: 13.5, textDecoration: 'underline', color: 'var(--text-secondary)' }}>돌아가기</Link>
      </div>
    </main>
  )
}
