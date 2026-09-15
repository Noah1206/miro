import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { usageStatus, type UsageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { Card, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { observe } from '@/lib/observe'

/** 잔액은 계정 상태다 — 빌드 시점에 굳히지 않는다. */
export const dynamic = 'force-dynamic'

/**
 * 충전소. 지금은 실제 월간 사용량을 읽어 보여주는 데까지만 한다.
 *
 * 충전 상품·가격·결제 연결은 아직 정해지지 않았고 구매 잔액을 담는 원장도 없다.
 * 그래서 가격표도, 구매 버튼도, 0 으로 찍은 가짜 잔액도 두지 않는다 — 준비 중이라고만 말한다.
 */
export default async function RechargePage() {
  const user = await currentUser()
  if (!user) redirect('/login')

  let usage: UsageStatus | null = null
  try { usage = await usageStatus(user.id) }
  catch (e) { observe('recharge.usage_unavailable', { userId: user.id, error: (e as Error).message }) }

  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my/subscription" title="충전소" lead="추가 사용량을 확인하고 채우는 곳이에요." />

      {usage ? <MonthlyAllowance usage={usage} /> : (
        <Notice tone="danger" style={{ marginBottom: 'var(--space-3)' }}>
          사용량을 불러오지 못했어요. 잠시 후 다시 열어 주세요.
        </Notice>
      )}

      <Card style={{ marginBottom: 'var(--space-3)' }}>
        <p className="t-title-3">충전 잔액</p>
        <p data-recharge-balance="unavailable" className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
          아직 충전 기능이 열리지 않아, 따로 쌓인 잔액이 없어요. 지금은 위의 월간 제공량으로만 이용해요.
        </p>
      </Card>

      <Card data-recharge-products="pending">
        <p className="t-title-3">충전 상품</p>
        <p className="t-caption" style={{ marginTop: 6, color: 'var(--color-text-secondary)' }}>
          준비 중이에요. 가격과 제공량이 정해지면 여기에서 안내하고, 그때부터 구매할 수 있어요.
        </p>
      </Card>

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
