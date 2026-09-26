import { redirect } from 'next/navigation'
import { BANK_TRANSFER_WINDOW_HOURS, bankAccount, rechargeCatalog, type RechargeProduct } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { dailyUsage, rechargeHistory, usageStatus, type RechargeHistoryItem, type UsageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { Card, Notice, Page, PageHeader } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { observe } from '@/lib/observe'
import { orderByTransfer } from './actions'
import { TransferActions } from './transfer-actions'
import { bankOrderHistory, pendingBankOrder } from '@/lib/payments/bank-transfer'

/** 잔액은 계정 상태다 — 빌드 시점에 굳히지 않는다. */
export const dynamic = 'force-dynamic'

/** 실제 원장을 조회하고, 미정 제공량은 판매하지 않는다. */
export default async function RechargePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { order } = await searchParams

  let usage: UsageStatus | null = null
  let history: RechargeHistoryItem[] = []
  let days: Record<string, number> = {}
  const today = kstDate(new Date())
  const since = monthStart(today, MONTHS - 1)
  try { [usage, history, days] = await Promise.all([usageStatus(user.id), rechargeHistory(user.id), dailyUsage(user.id, new Date(`${since}T00:00:00+09:00`))]) }
  catch (e) { observe('recharge.usage_unavailable', { userId: user.id, error: (e as Error).message }) }

  // 상품이 설정되지 않았으면 아무것도 팔지 않는다. 가격을 코드가 지어내지 않는다.
  let products: RechargeProduct[] = []
  try { products = rechargeCatalog().products }
  catch (e) { observe('recharge.catalog_invalid', { error: (e as Error).message }) }

  // 계좌이체는 계좌가 설정돼야 열린다. 설정이 잘못됐으면 받지 않는다 — 입금부터 받고
  // 어디로 갔는지 모르는 상태를 만들지 않는다.
  let account: ReturnType<typeof bankAccount> = null
  try { account = bankAccount() }
  catch (e) { observe('recharge.bank_account_invalid', { error: (e as Error).message }) }
  const [awaiting, orders] = await Promise.all([pendingBankOrder(user.id), bankOrderHistory(user.id, 5)])

  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my/subscription" title="충전소" lead="추가 사용량을 확인하고 채우는 곳이에요." />

      {usage && (
        <Card style={{ marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p className="t-title-3">현재 남은 크레딧</p>
            <span data-recharge-balance={usage.rechargeRemaining} className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{usage.rechargeRemaining}</span>
          </div>
          <p className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
            {usage.rechargeRemaining > 0
              ? '월간 제공량을 다 쓰면 여기서 이어서 차감돼요. 월초에 초기화되지 않아요.'
              : '아직 충전한 크레딧이 없어요. 지금은 월간 제공량으로 이용해요.'}
          </p>
        </Card>
      )}

      {usage ? <MonthlyAllowance usage={usage} days={days} today={today} /> : (
        <Notice tone="danger" style={{ marginBottom: 'var(--space-3)' }}>
          사용량을 불러오지 못했어요. 잠시 후 다시 열어 주세요.
        </Notice>
      )}

      {order && <Notice data-order-result={order} tone={order === 'created' ? 'muted' : 'danger'} style={{ marginBottom: 'var(--space-3)' }}>
        {order === 'created' ? '입금 안내를 보냈어요. 아래 계좌로 보내 주시면 확인 후 반영해 드릴게요.'
          : order === 'pending' ? '이미 입금 대기 중인 주문이 있어요. 먼저 그 주문을 마쳐 주세요.'
          : order === 'name' ? '입금자명을 적어 주세요. 입금을 찾는 데 꼭 필요해요.'
          : order === 'unavailable' ? '지금은 계좌이체를 받지 않고 있어요.'
          : '주문을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.'}
      </Notice>}

      {awaiting && account && (
        <Card data-bank-order="awaiting" style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">입금 대기 중</p>
          <p className="t-body">{account.bank} <b>{account.number}</b> ({account.holder})</p>
          <p className="t-body">보낼 금액 · <b data-order-amount={awaiting.amountMinor}>{awaiting.amountMinor.toLocaleString('ko-KR')}원</b></p>
          {/* 같은 금액의 입금이 여럿일 때 이 코드가 어느 주문인지 가른다. */}
          <p className="t-body">입금자명 · <b>{depositName(awaiting)}</b></p>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
            보낼 때 입금자명(받는 분 통장 표시)을 <b>{depositName(awaiting)}</b>(으)로 꼭 바꿔 주세요. 확인되면 반영해 드려요 —
            보통 하루 안에 처리돼요. {new Date(awaiting.expiresAt).toLocaleString('ko-KR')}까지 입금이 없으면 주문이 취소돼요.
          </p>
          <TransferActions bank={account.bank} accountNumber={account.number} amount={awaiting.amountMinor}
            depositName={depositName(awaiting)} />
        </Card>
      )}

      {!awaiting && account && (
        <Card data-bank-order="open" style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">충전하기</p>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
            주문 후 {BANK_TRANSFER_WINDOW_HOURS}시간 안에 입금하면 확인 뒤 반영돼요.
          </p>
          {[{ kind: 'pass' as const, id: undefined, label: '1개월 이용권', sub: 'Pro · 9,900원' },
            ...products.map(p => ({ kind: 'recharge' as const, id: p.id, label: p.name, sub: `${p.units.toLocaleString('ko-KR')} 사용량` }))]
            .map(item => (
              <form key={item.id ?? 'pass'} action={orderByTransfer} data-order-kind={item.kind}
                style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <input type="hidden" name="kind" value={item.kind} />
                {item.id && <input type="hidden" name="productId" value={item.id} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-body">{item.label}</p>
                  <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.sub}</p>
                </div>
                <SubmitButton variant="secondary" size="sm">주문</SubmitButton>
              </form>
            ))}
          {/* 환불 조건은 사기 전에 보인다 — 숨기지 않는 것이 확정된 방침이다. */}
          <ul data-refund-terms style={{ margin: '28px 0 0', padding: '16px 0 0', listStyle: 'none', display: 'grid', gap: 6, borderTop: '1px solid var(--color-border)' }}>
            {[COPY.refund.recharge, COPY.refund.pass, COPY.refund.failure, COPY.refund.how].map((line) => (
              <li key={line} className="t-caption" style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: 'var(--color-text-secondary)' }}>
                <span aria-hidden style={{ width: 4, height: 4, flexShrink: 0, borderRadius: '50%', background: 'var(--color-text-tertiary)', transform: 'translateY(-2px)' }} />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {orders.length > 0 && (
        <Card data-bank-order-history style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">계좌이체 주문</p>
          {orders.map(o => (
            <div key={o.id} data-order-status={o.status} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ minWidth: 0 }}>
                <p className="t-body">{o.kind === 'pass' ? '1개월 이용권' : `충전 ${o.units?.toLocaleString('ko-KR') ?? ''}`}</p>
                <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{o.createdAt.toLocaleDateString('ko-KR')} · {o.referenceCode}</p>
              </div>
              <span className="t-caption">{o.status === 'awaiting' ? '입금 대기' : o.status === 'approved' ? '완료' : o.status === 'rejected' ? '취소됨' : '기한 지남'}</span>
            </div>
          ))}
        </Card>
      )}

      {history.length > 0 && (
        <Card data-recharge-history style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">구매 내역</p>
          {history.map((h) => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ minWidth: 0 }}>
                <p className="t-body">{h.amount} 사용량</p>
                <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {h.createdAt.toLocaleDateString('ko-KR')}
                  {h.expiresAt ? ` · ${h.expiresAt.toLocaleDateString('ko-KR')}까지` : ''}
                </p>
              </div>
              <span className="t-caption" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {h.status === 'revoked' ? '환불됨' : `${h.remaining} 남음`}
              </span>
            </div>
          ))}
        </Card>
      )}

    </Page>
  )
}

/** 입금자명을 따로 받지 않은 주문은 대조 코드 자체가 입금자명이다. 예전 주문은 '이름 코드'. */
const depositName = (o: { depositorName: string; referenceCode: string }) =>
  o.depositorName === o.referenceCode ? o.referenceCode : `${o.depositorName} ${o.referenceCode}`

/** 칸 그림에 보이는 달 수 — 이번 달 포함. */
const MONTHS = 4
const kstDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
/** YYYY-MM-DD 에서 back 달 전의 1일. */
function monthStart(day: string, back: number): string {
  const [y, m] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1 - back, 1)).toISOString().slice(0, 10)
}

/** 날짜별 사용량을 GitHub 잔디처럼: 세로 7칸(일~토) × 주, 위에 달 이름. 진하기는 이 기간 최대치 대비 4단계. */
function UsageGrid({ days, today }: { days: Record<string, number>, today: string }) {
  const start = monthStart(today, MONTHS - 1)
  const first = new Date(`${start}T00:00:00Z`)
  const offset = first.getUTCDay()
  const cells: Array<{ day: string; amount: number } | null> = Array(offset).fill(null)
  for (let d = first; ; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.toISOString().slice(0, 10)
    if (day > today) break
    cells.push({ day, amount: days[day] ?? 0 })
  }
  const weeks = Math.ceil(cells.length / 7)
  const max = Math.max(0, ...cells.map((c) => c?.amount ?? 0))
  const level = (a: number) => (a === 0 || max === 0 ? 0 : Math.ceil((a / max) * 4))
  const months = cells.flatMap((c, i) => (c && c.day.endsWith('-01') ? [{ col: Math.floor(i / 7) + 1, label: `${Number(c.day.slice(5, 7))}월` }] : []))
  const total = cells.reduce((n, c) => n + (c?.amount ?? 0), 0)
  return (
    <div role="img" aria-label={`최근 ${MONTHS}개월 날짜별 사용량, 합계 ${total}`}>
      <div aria-hidden style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 4, marginBottom: 4 }}>
        {months.map((m) => <span key={m.col} className="t-caption" style={{ gridColumn: m.col, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{m.label}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, auto)', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gridAutoFlow: 'column', gap: 4 }}>
        {cells.map((c, i) => c
          ? <span key={c.day} data-usage-day={c.day} data-level={level(c.amount)} title={`${Number(c.day.slice(5, 7))}월 ${Number(c.day.slice(8))}일 · 사용량 ${c.amount}`}
              style={{ aspectRatio: '1', borderRadius: 4, background: level(c.amount) ? `rgb(59 110 220 / ${[0, .3, .5, .75, 1][level(c.amount)]})` : 'var(--color-surface-3)' }} />
          : <span key={`pad-${i}`} />)}
      </div>
    </div>
  )
}

function MonthlyAllowance({ usage, days, today }: { usage: UsageStatus, days: Record<string, number>, today: string }) {
  const spent = usage.remaining === 0
  return (
    <Card style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', marginBottom: 8 }}>
        <span data-usage-remaining={usage.remaining} className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{usage.usedPercent}% 사용</span>
      </div>
      <UsageGrid days={days} today={today} />
      {spent && (
        <p data-usage-spent className="t-body" style={{ marginTop: 12 }}>
          이번 달 제공량을 모두 썼어요. MIRO 기본 대화는 계속 이어갈 수 있어요.
        </p>
      )}
    </Card>
  )
}
