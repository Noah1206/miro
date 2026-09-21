import { redirect } from 'next/navigation'
import { BANK_TRANSFER_WINDOW_HOURS, PLANNED_RECHARGE_TIERS, bankAccount, productionRuntime, rechargeCatalog, type RechargeProduct } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { rechargeHistory, usageStatus, type RechargeHistoryItem, type UsageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { Button, Card, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { observe } from '@/lib/observe'
import { beginRecharge, orderByTransfer, simulateRecharge } from './actions'
import { TransferActions } from './transfer-actions'
import { bankOrderHistory, pendingBankOrder } from '@/lib/payments/bank-transfer'

/** 잔액은 계정 상태다 — 빌드 시점에 굳히지 않는다. */
export const dynamic = 'force-dynamic'

/** 실제 원장을 조회하고, 미정 제공량은 판매하지 않는다. */
export default async function RechargePage({ searchParams }: { searchParams: Promise<{ checkout?: string; result?: string; order?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { checkout, result, order } = await searchParams

  let usage: UsageStatus | null = null
  let history: RechargeHistoryItem[] = []
  try { [usage, history] = await Promise.all([usageStatus(user.id), rechargeHistory(user.id)]) }
  catch (e) { observe('recharge.usage_unavailable', { userId: user.id, error: (e as Error).message }) }

  // 상품이 설정되지 않았으면 아무것도 팔지 않는다. 가격을 코드가 지어내지 않는다.
  let products: RechargeProduct[] = []
  try { products = rechargeCatalog().products }
  catch (e) { observe('recharge.catalog_invalid', { error: (e as Error).message }) }
  const sellable = products.length > 0 && !productionRuntime()

  // 계좌이체는 계좌가 설정돼야 열린다. 설정이 잘못됐으면 받지 않는다 — 입금부터 받고
  // 어디로 갔는지 모르는 상태를 만들지 않는다.
  let account: ReturnType<typeof bankAccount> = null
  try { account = bankAccount() }
  catch (e) { observe('recharge.bank_account_invalid', { error: (e as Error).message }) }
  const [awaiting, orders] = await Promise.all([pendingBankOrder(user.id), bankOrderHistory(user.id, 5)])

  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my/subscription" title="충전소" lead="추가 사용량을 확인하고 채우는 곳이에요." />

      {usage ? <MonthlyAllowance usage={usage} /> : (
        <Notice tone="danger" style={{ marginBottom: 'var(--space-3)' }}>
          사용량을 불러오지 못했어요. 잠시 후 다시 열어 주세요.
        </Notice>
      )}

      {usage && (
        <Card style={{ marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p className="t-title-3">충전 잔액</p>
            <span data-recharge-balance={usage.rechargeRemaining} className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{usage.rechargeRemaining}</span>
          </div>
          <p className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
            {usage.rechargeRemaining > 0
              ? '월간 제공량을 다 쓰면 이 잔액에서 이어서 차감돼요. 월초에 초기화되지 않아요.'
              : '아직 충전한 잔액이 없어요. 지금은 위의 월간 제공량으로 이용해요.'}
          </p>
        </Card>
      )}

      {result && (
        <Notice data-recharge-result={result} tone={result === 'success' ? 'muted' : 'danger'} style={{ marginBottom: 'var(--space-3)' }}>
          {result === 'success' ? '충전이 완료됐어요. 잔액에 반영됐습니다.' : '결제가 완료되지 않았어요. 잔액은 그대로예요.'}
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
          <p className="t-body">입금자명 · <b>{awaiting.depositorName} {awaiting.referenceCode}</b></p>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
            입금자명 뒤에 <b>{awaiting.referenceCode}</b> 를 꼭 붙여 주세요. 확인되면 반영해 드려요 —
            보통 하루 안에 처리돼요. {new Date(awaiting.expiresAt).toLocaleString('ko-KR')}까지 입금이 없으면 주문이 취소돼요.
          </p>
          <TransferActions bank={account.bank} accountNumber={account.number} amount={awaiting.amountMinor}
            depositName={`${awaiting.depositorName} ${awaiting.referenceCode}`} />
        </Card>
      )}

      {!awaiting && account && (
        <Card data-bank-order="open" style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">계좌이체로 받기</p>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
            주문하면 입금 계좌를 알려드려요. 입금을 확인한 뒤 반영되고, {BANK_TRANSFER_WINDOW_HOURS}시간 안에 입금하지 않으면 주문이 취소돼요.
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
                <input name="depositorName" placeholder="입금자명" required maxLength={40} aria-label="입금자명"
                  style={{ width: 110, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }} />
                <Button type="submit" variant="secondary" size="sm">주문</Button>
              </form>
            ))}
          {/* 환불 조건은 사기 전에 보인다 — 숨기지 않는 것이 확정된 방침이다. */}
          <div data-refund-terms style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{COPY.refund.recharge}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>{COPY.refund.pass}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>{COPY.refund.failure} {COPY.refund.how}</p>
          </div>
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

      {checkout && sellable ? (
        <Card data-mock-recharge-checkout style={{ marginBottom: 'var(--space-3)' }}>
          <p className="t-caption" style={{ marginBottom: 14 }}>결제 시뮬레이션 — 실제 PG 에서는 결제창으로 이동하고 결과는 webhook 으로 들어옵니다.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <form action={simulateRecharge.bind(null, checkout, 'success')} style={{ flex: 1 }}><Button type="submit" variant="primary" full>결제 성공</Button></form>
            <form action={simulateRecharge.bind(null, checkout, 'failed')} style={{ flex: 1 }}><Button type="submit" variant="danger" full>결제 실패</Button></form>
          </div>
        </Card>
      ) : sellable ? (
        <Card data-recharge-products="open" style={{ marginBottom: 'var(--space-3)' }} className="stack">
          <p className="t-title-3">충전 상품</p>
          {products.map((p) => (
            <form key={p.id} action={beginRecharge} data-product={p.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <input type="hidden" name="productId" value={p.id} />
              <div style={{ minWidth: 0 }}>
                <p className="t-body">{p.name}</p>
                <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {p.units} 사용량{p.validDays ? ` · ${p.validDays}일 유효` : ' · 만료 없음'}
                </p>
              </div>
              <Button type="submit" variant="secondary" size="sm">{formatPrice(p)}</Button>
            </form>
          ))}
        </Card>
      ) : (
        <Card data-recharge-products="pending" style={{ marginBottom: 'var(--space-3)' }}>
          <p className="t-title-3">충전 상품</p>
          {PLANNED_RECHARGE_TIERS.map(tier => <div key={tier.priceKRW} data-planned-price={tier.priceKRW} data-planned-units={tier.units} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span className="t-body">{tier.priceKRW.toLocaleString('ko-KR')}원</span>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{tier.units.toLocaleString('ko-KR')} 사용량</span>
          </div>)}
          <p className="t-caption" style={{ marginTop: 12 }}>충전 잔액은 만료 없이 이용하는 정책으로 준비 중이에요.</p>
          <p className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
            계좌이체 충전을 준비 중이에요. 결제가 열리면 구매할 수 있어요.
          </p>
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

      <section className="stack" style={{ marginTop: 'var(--space-5)', gap: 6 }}>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
          MIRO 기본 대화는 사용량과 무관하게 이어갈 수 있어요. ECHO 대화와 사진·통화 같은 추가 인터랙션이 사용량을 씁니다.
        </p>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
          사용량을 다 써도 기존 대화·관계·기억은 그대로 남아요.
        </p>
      </section>
    </Page>
  )
}

function MonthlyAllowance({ usage }: { usage: UsageStatus }) {
  const reset = usage.resetsAt
    ? `${usage.resetsAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })}에 초기화`
    : '매월 1일에 초기화'
  const spent = usage.remaining === 0
  return (
    <Card style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>이번 달 제공량 · MIRO {usage.plan === 'pro' ? 'Pro' : 'Free'}</span>
        <span data-usage-remaining={usage.remaining} className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{usage.usedPercent}% 사용</span>
      </div>
      <div role="meter" aria-label={COPY.a11y.usageMeter} aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage.usedPercent} aria-valuetext={`${usage.usedPercent}% 사용`}
        style={{ height: 3, background: 'var(--color-surface-3)', overflow: 'hidden', borderRadius: 2 }}>
        <div style={{ width: `${usage.usedPercent}%`, height: '100%', background: 'var(--color-white)' }} />
      </div>
      <p className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>{reset}</p>
      {spent && (
        <p data-usage-spent className="t-body" style={{ marginTop: 12 }}>
          이번 달 제공량을 모두 썼어요. MIRO 기본 대화는 계속 이어갈 수 있어요.
        </p>
      )}
      <TransitionLink href="/my/subscription" className="t-caption" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'underline', color: 'var(--color-text-primary)' }}>내 요금제</TransitionLink>
    </Card>
  )
}

/**
 * 최소 화폐 단위를 사용자에게 보이는 금액으로. 금액을 코드가 만들지 않고 받은 값만 옮긴다.
 *
 * KRW 는 보조 단위가 없어 그대로지만 USD 는 100 으로 나눠야 한다 —
 * 통화별 소수 자릿수를 Intl 에서 읽어 나눈다. 여기서 틀리면 가격이 100 배로 보인다.
 */
function formatPrice(p: RechargeProduct): string {
  try {
    const fmt = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: p.currency })
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 0
    return fmt.format(p.priceMinor / 10 ** digits)
  } catch { return `${p.priceMinor} ${p.currency}` }
}
