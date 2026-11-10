import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can } from '@miro/domain'
import { currentAdmin } from '@/lib/auth'
import { lastKstMonth, listPayouts, monthlyWithholding, type PayoutStatus } from '@/lib/payouts'
import { PayoutPanel } from './panel'

const STATUSES = ['requested', 'paid', 'rejected', 'all'] as const
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const kst = (d: Date) => d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })

/** 창작 보상 출금 신청. 실수령액을 계좌로 보낸 뒤 '송금 완료'. 원천징수 세액은 다음 달 10일까지 홈택스로 신고·납부한다. */
export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string; month?: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'payments.view')) redirect('/login')
  const { status = 'requested', month: rawMonth } = await searchParams
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth ?? '') ? rawMonth! : lastKstMonth()
  const [rows, tax] = await Promise.all([listPayouts(status as PayoutStatus | 'all'), monthlyWithholding(month)])
  const [y, m] = month.split('-').map(Number) as [number, number]
  const next = new Date(Date.UTC(y, m, 1)), nextLabel = `${next.getUTCFullYear()}년 ${next.getUTCMonth() + 1}월`
  const canAct = can(admin.role, 'payments.act')
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUSES.map(s => <Link key={s} href={`/payouts?status=${s}`} className="tag" style={{ borderColor: s === status ? 'var(--accent)' : undefined }}>{s}</Link>)}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '12px 0' }}>
        <b>실수령액</b>을 예금주 실명 계좌로 보낸 뒤 '송금 완료'를 누르세요. 원천징수(3.3%)는 지급한 달의 다음 달 10일까지 원천징수이행상황신고·납부, 지급명세서는 정해진 기한에 제출합니다.
      </p>
      <section className="card" style={{ marginBottom: 20 }}>
        <form style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <b>원천세 신고</b><input type="month" name="month" defaultValue={month} /><input type="hidden" name="status" value={status} /><button className="btn" type="submit">보기</button>
          <a className="btn" href={`/payouts/statement?month=${month}`} style={{ marginLeft: 'auto' }}>간이지급명세서 CSV</a>
        </form>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 8px' }}>{month} 에 '송금 완료'한 출금 기준. 귀속·지급 연월 = {month}.</p>
        <table><thead><tr><th>할 일</th><th>기한</th><th>어디서</th><th>적을 값</th></tr></thead><tbody>
          <tr><td>원천징수이행상황신고(사업소득 · 매월징수 <b>A25</b>)</td><td>{nextLabel} 10일</td><td>홈택스 › 신고/납부 › 원천세</td>
            <td>인원 <b>{tax.total.count}</b> · 총지급액 <b>{won(tax.total.gross)}</b> · 소득세 <b>{won(tax.total.incomeTax)}</b></td></tr>
          <tr><td>소득세 납부</td><td>{nextLabel} 10일</td><td>홈택스 신고 후 납부서(가상계좌·카드)</td><td><b>{won(tax.total.incomeTax)}</b></td></tr>
          <tr><td>지방소득세(특별징수) 신고·납부</td><td>{nextLabel} 10일</td><td>홈택스 신고 끝 화면 '지방소득세 신고 이어하기' → 위택스</td><td><b>{won(tax.total.localTax)}</b></td></tr>
          <tr><td>간이지급명세서(거주자의 사업소득) 제출</td><td>{nextLabel} 말일</td><td>홈택스 › 지급명세서 › 간이지급명세서(사업소득) — CSV 값을 옮겨 적거나 엑셀 양식에 붙여 넣기</td><td>사람별 {tax.total.count}명 (업종코드 940306)</td></tr>
        </tbody></table>
        {tax.total.count === 0 && <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '8px 0 0' }}>이 달 지급이 없으면 신고할 것도 없습니다(원천세는 무실적 신고 의무 없음).</p>}
        {tax.total.count > 0 && tax.total.incomeTax === 0 && <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '8px 0 0' }}>소득세가 0원(소액부징수)이어도 신고서의 인원·지급액과 간이지급명세서는 제출합니다.</p>}
      </section>

      <table><thead><tr>
        <th>신청</th><th>계정</th><th>토큰</th><th>세전</th><th>소득세</th><th>지방세</th><th>실수령</th><th>실명</th><th>주민등록번호</th><th>계좌</th><th>상태</th><th>처리</th>
      </tr></thead><tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>{kst(r.createdAt)}</td>
            <td>{r.email}</td>
            <td>{r.tokens.toLocaleString('ko-KR')}</td>
            <td>{won(r.grossKRW)}</td>
            <td>{won(r.incomeTaxKRW)}</td>
            <td>{won(r.localTaxKRW)}</td>
            <td><b>{won(r.netKRW)}</b></td>
            <td>{r.realName}</td>
            <td><details><summary>{r.rrn.slice(0, 8)}******</summary><code>{r.rrn}</code></details></td>
            <td>{r.bank} {r.accountNumber}</td>
            <td><span className="tag">{r.status}</span>{r.note && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.note}</div>}</td>
            <td>{r.status === 'requested' ? <PayoutPanel id={r.id} canAct={canAct} /> : (r.decidedAt ? kst(r.decidedAt) : '-')}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={12} style={{ color: 'var(--muted)' }}>신청이 없습니다.</td></tr>}
      </tbody></table>
    </>
  )
}
