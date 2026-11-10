import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can } from '@miro/domain'
import { currentAdmin } from '@/lib/auth'
import { listPayouts, type PayoutStatus } from '@/lib/payouts'
import { PayoutPanel } from './panel'

const STATUSES = ['requested', 'paid', 'rejected', 'all'] as const
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const kst = (d: Date) => d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })

/** 창작 보상 출금 신청. 실수령액을 계좌로 보낸 뒤 '송금 완료'. 원천징수 세액은 다음 달 10일까지 홈택스로 신고·납부한다. */
export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'payments.view')) redirect('/login')
  const { status = 'requested' } = await searchParams
  const rows = await listPayouts(status as PayoutStatus | 'all')
  const canAct = can(admin.role, 'payments.act')
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUSES.map(s => <Link key={s} href={`/payouts?status=${s}`} className="tag" style={{ borderColor: s === status ? 'var(--accent)' : undefined }}>{s}</Link>)}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '12px 0' }}>
        <b>실수령액</b>을 예금주 실명 계좌로 보낸 뒤 '송금 완료'를 누르세요. 원천징수(3.3%)는 지급한 달의 다음 달 10일까지 원천징수이행상황신고·납부, 지급명세서는 정해진 기한에 제출합니다.
      </p>
      <table><thead><tr>
        <th>신청</th><th>계정</th><th>토큰</th><th>세전</th><th>원천징수</th><th>실수령</th><th>실명</th><th>주민등록번호</th><th>계좌</th><th>상태</th><th>처리</th>
      </tr></thead><tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>{kst(r.createdAt)}</td>
            <td>{r.email}</td>
            <td>{r.tokens.toLocaleString('ko-KR')}</td>
            <td>{won(r.grossKRW)}</td>
            <td>{won(r.taxKRW)}</td>
            <td><b>{won(r.netKRW)}</b></td>
            <td>{r.realName}</td>
            <td><details><summary>{r.rrn.slice(0, 8)}******</summary><code>{r.rrn}</code></details></td>
            <td>{r.bank} {r.accountNumber}</td>
            <td><span className="tag">{r.status}</span>{r.note && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.note}</div>}</td>
            <td>{r.status === 'requested' ? <PayoutPanel id={r.id} canAct={canAct} /> : (r.decidedAt ? kst(r.decidedAt) : '-')}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={11} style={{ color: 'var(--muted)' }}>신청이 없습니다.</td></tr>}
      </tbody></table>
    </>
  )
}
