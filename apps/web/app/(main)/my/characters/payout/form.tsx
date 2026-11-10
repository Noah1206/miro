'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { submitPayout, type PayoutState } from './actions'

const BANKS = ['KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국', 'SC제일은행', '부산은행', '대구은행(iM뱅크)']
const ERRORS: Record<string, string> = {
  agree: '두 가지 동의가 모두 필요해요.', below_minimum: '최소 출금 금액보다 적어요.', over_withdrawable: '출금할 수 있는 토큰보다 많아요.',
  invalid_rrn: '주민등록번호를 다시 확인해 주세요.', invalid_account: '계좌번호는 숫자 8~20자리로 적어 주세요.', invalid_input: '이름과 은행을 확인해 주세요.', invalid_request: '다시 시도해 주세요.',
}
const field = { width: '100%', height: 44, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', font: 'inherit', fontSize: 15 } as const

export function PayoutForm({ withdrawable, krwPerToken, minTokens }: { withdrawable: number; krwPerToken: number; minTokens: number }) {
  const t = useT()
  const [state, action, pending] = useActionState(submitPayout, { ok: false, error: null, requestId: crypto.randomUUID() } satisfies PayoutState)
  const [tokens, setTokens] = useState(withdrawable)
  if (withdrawable < minTokens) return <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('{n} 토큰이 모이면 신청할 수 있어요.', { n: minTokens.toLocaleString('ko-KR') })}</p>
  const label = (text: string, input: React.ReactNode) => <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>{text}{input}</label>
  return (
    <form action={action} style={{ display: 'grid', gap: 14 }}>
      {state.ok && <p role="status" style={{ margin: 0, color: 'var(--color-success, #2e9d5b)', fontSize: 14 }}>{t('신청했어요. 확인 후 영업일 기준 7일 안에 보내 드려요.')}</p>}
      {state.error && <p role="alert" style={{ margin: 0, color: 'var(--color-danger, #e05a5a)', fontSize: 14 }}>{t(ERRORS[state.error] ?? ERRORS.invalid_request!)}</p>}
      {label(t('출금할 토큰'), <input name="tokens" type="number" inputMode="numeric" min={minTokens} max={withdrawable} step={1} required value={tokens} onChange={e => setTokens(Number(e.target.value))} style={field} />)}
      <span className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: -8 }}>≈ {t('{n}원 (세전)', { n: (tokens * krwPerToken || 0).toLocaleString('ko-KR') })}</span>
      {label(t('예금주 실명'), <input name="realName" required maxLength={40} autoComplete="name" style={field} />)}
      {label(t('주민등록번호'), <input name="rrn" required inputMode="numeric" autoComplete="off" placeholder="000000-0000000" maxLength={14} pattern="\d{6}-?\d{7}" style={field} />)}
      {label(t('은행'), <><input name="bank" required list="payout-banks" maxLength={30} style={field} /><datalist id="payout-banks">{BANKS.map(b => <option key={b} value={b} />)}</datalist></>)}
      {label(t('계좌번호'), <input name="accountNumber" required inputMode="numeric" autoComplete="off" placeholder={t('- 없이 숫자만')} style={field} />)}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}><input type="checkbox" name="agreePrivacy" required style={{ marginTop: 3 }} />
        <span>{t('[필수] 출금 처리를 위해 실명·은행·계좌번호를 수집·이용하고, 세법에 따라 5년간 보관하는 데 동의해요.')}</span></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}><input type="checkbox" name="agreeRrn" required style={{ marginTop: 3 }} />
        <span>{t('[필수] 소득세법에 따른 원천징수·지급명세서 제출을 위해 주민등록번호를 수집해 암호화 보관하는 데 동의해요.')}</span></label>
      <Button type="submit" variant="primary" full disabled={pending}>{pending ? t('신청 중…') : t('출금 신청하기')}</Button>
    </form>
  )
}
