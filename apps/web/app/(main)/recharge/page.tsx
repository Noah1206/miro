import { redirect } from 'next/navigation'
import { productionRuntime, rechargeCatalog, type RechargeProduct } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { rechargeHistory, usageStatus, type RechargeHistoryItem, type UsageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { Button, Card, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { observe } from '@/lib/observe'
import { beginRecharge, simulateRecharge } from './actions'

/** 잔액은 계정 상태다 — 빌드 시점에 굳히지 않는다. */
export const dynamic = 'force-dynamic'

/**
 * 충전소. 지금은 실제 월간 사용량을 읽어 보여주는 데까지만 한다.
 *
 * 충전 상품·가격·결제 연결은 아직 정해지지 않았고 구매 잔액을 담는 원장도 없다.
 * 그래서 가격표도, 구매 버튼도, 0 으로 찍은 가짜 잔액도 두지 않는다 — 준비 중이라고만 말한다.
 */
export default async function RechargePage({ searchParams }: { searchParams: Promise<{ checkout?: string; result?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { checkout, result } = await searchParams

  let usage: UsageStatus | null = null
  let history: RechargeHistoryItem[] = []
  try { [usage, history] = await Promise.all([usageStatus(user.id), rechargeHistory(user.id)]) }
  catch (e) { observe('recharge.usage_unavailable', { userId: user.id, error: (e as Error).message }) }

  // 상품이 설정되지 않았으면 아무것도 팔지 않는다. 가격을 코드가 지어내지 않는다.
  let products: RechargeProduct[] = []
  try { products = rechargeCatalog().products }
  catch (e) { observe('recharge.catalog_invalid', { error: (e as Error).message }) }
  const sellable = products.length > 0 && !productionRuntime()

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
              <Button type="submit" variant="primary" size="sm">{formatPrice(p)}</Button>
            </form>
          ))}
        </Card>
      ) : (
        <Card data-recharge-products="pending" style={{ marginBottom: 'var(--space-3)' }}>
          <p className="t-title-3">충전 상품</p>
          <p className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
            준비 중이에요. 가격과 제공량이 정해지면 여기에서 안내하고, 그때부터 구매할 수 있어요.
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
