import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { listReports } from '@/lib/reports'
import { can } from '@miro/domain'

/** n72/n73 — 신고 목록. */
export default async function Reports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'reports.view')) redirect('/login')
  const { status = 'pending' } = await searchParams
  const rows = await listReports(status as never)
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['pending', 'reviewing', 'resolved', 'dismissed', 'all'].map((s) => <Link key={s} href={`/reports?status=${s}`} className="tag" style={{ borderColor: s === status ? 'var(--accent)' : undefined }}>{s}</Link>)}
      </div>
      <table><thead><tr><th>접수</th><th>대상</th><th>사유</th><th>캐릭터</th><th>상태</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} data-report-row>
            <td>{r.createdAt.toLocaleString('ko-KR')}</td>
            <td><Link href={`/reports/${r.id}`} style={{ textDecoration: 'underline' }}>{r.targetType}</Link></td>
            <td>{r.reason}</td><td>{r.characterName ?? '-'}</td><td><span className="tag">{r.status}</span></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>신고가 없습니다.</td></tr>}
      </tbody></table>
    </>
  )
}
