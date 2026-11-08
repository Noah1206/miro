'use client'
import { Button } from '@/components/ui'
import { useLoginSheet } from '@/components/ui/login-sheet'
import { useT } from '@/lib/i18n/client'

/**
 * 로그인 전 홈(11/8) — 성인 작품 제목·표지가 청소년에게 보이지 않게 목록 전체를 흐리고 막는다(청소년 보호법).
 * 흐린 목록은 누를 수도, 읽어 줄 수도 없다(inert). 로그인 → 가입 단계의 본인인증을 마치면 그대로 보인다.
 */
export function HomeAgeGate({ children }: { children: React.ReactNode }) {
  const t = useT()
  const ask = useLoginSheet()
  return (
    <div style={{ position: 'relative' }}>
      <div inert aria-hidden="true" style={{ filter: 'blur(22px)', pointerEvents: 'none', userSelect: 'none', maxHeight: '140vh', overflow: 'hidden' }}>{children}</div>
      <div role="region" aria-label={t('성인 인증 안내')} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 'min(28vh, 220px)' }}>
        <div style={{ maxWidth: 340, margin: '0 var(--gutter)', padding: '28px 24px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', textAlign: 'center', display: 'grid', gap: 12 }}>
          <span aria-hidden="true" style={{ justifySelf: 'center', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '2px solid var(--color-danger)', color: 'var(--color-danger)', fontWeight: 700 }}>19</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('19세 이상만 볼 수 있어요')}</h2>
          <p className="t-caption" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{t('청소년 유해 정보가 포함되어 있어요. 로그인하고 본인인증을 마치면 볼 수 있어요.')}</p>
          <Button type="button" variant="primary" full onClick={() => ask()}>{t('로그인하고 성인 인증하기')}</Button>
        </div>
      </div>
    </div>
  )
}
