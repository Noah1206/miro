import Link from 'next/link'
/** n71 — 삭제 완료. */
export default function Deleted() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 data-account-deleted style={{ fontSize: 20, margin: '0 0 10px' }}>계정이 삭제되었습니다</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 24px' }}>그동안 함께해 주셔서 감사합니다.</p>
        <Link href="/onboarding" style={{ fontSize: 13.5, textDecoration: 'underline', color: 'var(--text-secondary)' }}>처음으로</Link>
      </div>
    </main>
  )
}
