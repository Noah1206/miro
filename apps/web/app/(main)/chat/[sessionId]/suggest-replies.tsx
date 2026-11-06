'use client'
import { useT } from '@/lib/i18n/client'
import { suggestReplies, type Suggestion } from './suggest-actions'
import styles from './chat.module.css'

export type SuggestState = Suggestion[] | 'loading' | null

/** 추천 답변 버튼(11/3) — 입력창 위 줄. 누르는 즉시 자리(빈 카드 3장)를 띄우고, 받으면 그 자리에 채운다. */
export function SuggestButton({ sessionId, disabled, loading, onChange, onError }: { sessionId: string; disabled?: boolean; loading: boolean; onChange: (s: SuggestState) => void; onError: (e: string) => void }) {
  const t = useT()
  return <button type="button" className={styles.suggestPill} disabled={disabled || loading} aria-busy={loading} aria-label={t('추천 답변')} title={t('추천 답변')}
    onClick={async () => {
      onChange('loading'); onError('')
      const r = await suggestReplies(sessionId)
      if ('error' in r) { onChange(null); onError(r.error) } else onChange(r.options)
    }}>
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />
    </svg>
    <span>{t('추천 답변')}</span>
  </button>
}

/** 후보 목록 — 카드를 누르면 바로 보내고, 연필은 입력칸에 넣어 고쳐 쓰게. 대사는 흰 글씨, 행동은 기울인 회색. 받는 동안은 빈 카드가 숨 쉰다. */
export function SuggestList({ state, onPick, onClose }: { state: Exclude<SuggestState, null>; onPick: (text: string, send: boolean) => void; onClose: () => void }) {
  const t = useT()
  const text = (o: Suggestion) => [o.say && `"${o.say}"`, o.act && `*${o.act}*`].filter(Boolean).join(' ')
  if (state === 'loading') return <div className={styles.suggest} role="status" aria-label={t('추천 답변을 만드는 중')}>
    {[0, 1, 2].map(i => <div key={i} className={styles.suggestRow}>
      <span className={styles.suggestEdit} aria-hidden />
      <span className={`${styles.suggestCard} ${styles.suggestSkeleton}`} style={{ animationDelay: `${i * 120}ms` }}><i /></span>
    </div>)}
  </div>
  return <div className={styles.suggest} role="group" aria-label={t('추천 답변')}>
    {state.map((o, i) => <div key={i} className={`${styles.suggestRow} ${styles.suggestIn}`} style={{ animationDelay: `${i * 60}ms` }}>
      <button type="button" className={styles.suggestEdit} aria-label={t('고쳐 쓰기')} onClick={() => onPick(text(o), false)}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
      </button>
      <button type="button" className={styles.suggestCard} onClick={() => onPick(text(o), true)}>
        {o.say && <span>&quot;{o.say}&quot;</span>}{o.say && o.act && ' '}{o.act && <em>{o.act}</em>}
      </button>
    </div>)}
    <button type="button" className={styles.suggestClose} onClick={onClose}>{t('닫기')}</button>
  </div>
}
