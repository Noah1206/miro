'use client'
import { useTransition } from 'react'
import { useT } from '@/lib/i18n/client'
import { suggestReplies, type Suggestion } from './suggest-actions'
import styles from './chat.module.css'

/** 추천 답변 버튼(11/3) — 입력창 위 줄. 누르면 후보 3개를 받아 onReady 로 넘긴다. */
export function SuggestButton({ sessionId, disabled, onReady }: { sessionId: string; disabled?: boolean; onReady: (r: { options: Suggestion[] } | { error: string }) => void }) {
  const t = useT()
  const [pending, start] = useTransition()
  return <button type="button" className={styles.toolButton} disabled={disabled || pending} aria-busy={pending} aria-label={t('추천 답변')} title={t('추천 답변')}
    onClick={() => start(async () => onReady(await suggestReplies(sessionId)))}>
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={pending ? { opacity: .45 } : undefined}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />
    </svg>
  </button>
}

/** 후보 목록 — 카드를 누르면 바로 보내고, 연필은 입력칸에 넣어 고쳐 쓰게. 대사는 흰 글씨, 행동은 기울인 회색. */
export function SuggestList({ options, onPick, onClose }: { options: Suggestion[]; onPick: (text: string, send: boolean) => void; onClose: () => void }) {
  const t = useT()
  const text = (o: Suggestion) => [o.say && `"${o.say}"`, o.act && `*${o.act}*`].filter(Boolean).join(' ')
  return <div className={styles.suggest} role="group" aria-label={t('추천 답변')}>
    {options.map((o, i) => <div key={i} className={styles.suggestRow}>
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
