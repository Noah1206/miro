import Link from 'next/link'
import { redirect } from 'next/navigation'
import { bankAccount } from '@miro/config'
import { can } from '@miro/domain'
import { currentAdmin } from '@/lib/auth'
import { listBankOrders, type OrderStatus } from '@/lib/payments'
import { DecisionPanel } from './panel'

const STATUSES = ['awaiting', 'approved', 'rejected', 'expired', 'all'] as const
const money = (minor: number, currency: string) =>
  currency === 'KRW' ? `${minor.toLocaleString('ko-KR')}원` : `${(minor / 100).toLocaleString('en-US')} ${currency}`

/** 계좌이체 입금 확인. 승인하면 지급이 예약되고, web cron 이 실제 지급한다. */
export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'payments.view')) redirect('/login')
  const { status = 'awaiting' } = await searchParams
  const rows = await listBankOrders(status as OrderStatus | 'all')
  const canAct = can(admin.role, 'payments.act')

  let account: ReturnType<typeof bankAccount> = null
  let accountError = false
  try { account = bankAccount() } catch { accountError = true }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUSES.map((s) => <Link key={s} href={`/payments?status=${s}`} className="tag" style={{ borderColor: s === status ? 'var(--accent)' : undefined }}>{s}</Link>)}
      </div>

      {accountError
        ? <p className="card" data-account="invalid" style={{ color: '#E05A7A' }}>입금 계좌 설정이 잘못됐습니다. MIRO_BANK_ACCOUNT 를 확인하세요 — 주문을 받지 않습니다.</p>
        : account
          ? <p className="card" data-account="ready" style={{ color: 'var(--muted)', fontSize: 12.5 }}>입금 계좌 · {account.bank} {account.number} ({account.holder})</p>
          : <p className="card" data-account="none" style={{ color: 'var(--muted)' }}>입금 계좌가 설정되지 않아 주문을 받지 않습니다.</p>}

      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '12px 0' }}>
        통장에서 <b>금액</b>과 <b>입금자명 + 대조 코드</b>가 맞는지 확인한 뒤 승인하세요. 승인은 지급을 일으킵니다.
      </p>

      <table><thead><tr>
        <th>접수</th><th>계정</th><th>상품</th><th>금액</th><th>입금자명</th><th>대조 코드</th><th>기한</th><th>상태</th><th>처리</th>
      </tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} data-order-row data-order-status={r.status}>
            <td>{r.createdAt.toLocaleString('ko-KR')}</td>
            <td>{r.email}</td>
            <td>{r.kind === 'pass' ? '1개월 이용권' : `충전 ${r.productId}`}{r.units ? ` · ${r.units.toLocaleString('ko-KR')}` : ''}</td>
            <td><b>{money(r.amountMinor, r.currency)}</b></td>
            <td>{r.depositorName}</td>
            <td><code data-reference-code>{r.referenceCode}</code></td>
            <td>{r.expiresAt.toLocaleString('ko-KR')}</td>
            <td><span className="tag">{r.status}</span>{r.note && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.note}</div>}</td>
            <td>{r.status === 'awaiting' ? <DecisionPanel orderId={r.id} canAct={canAct} /> : (r.decidedAt?.toLocaleString('ko-KR') ?? '-')}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>주문이 없습니다.</td></tr>}
      </tbody></table>
    </>
  )
}
