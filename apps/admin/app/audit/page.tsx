import { redirect } from 'next/navigation'
import Link from 'next/link'
import { currentAdmin } from '@/lib/auth'
import { auditLog } from '@/lib/reports'
import { can } from '@miro/domain'
export default async function Audit() {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'audit.view')) redirect('/login')
  const rows = await auditLog()
  return (
    <table><thead><tr><th>시각</th><th>운영자</th><th>조치</th><th>상태</th><th>메모</th><th>신고</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id} data-audit-row><td>{r.createdAt.toLocaleString('ko-KR')}</td><td>{r.email}</td><td>{r.action}</td><td>{r.from}→{r.to}</td><td>{r.note}</td><td>{r.reportId && <Link href={`/reports/${r.reportId}`} style={{ textDecoration: 'underline' }}>보기</Link>}</td></tr>)}
    </tbody></table>
  )
}
