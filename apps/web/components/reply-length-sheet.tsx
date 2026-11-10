'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import { chatModelFamily, selectedChatChoice } from '@/lib/ai/model-presentation'
import { useChatModel } from '@/app/(main)/chat/[sessionId]/model-picker'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

type Length = 'scene' | 'long' | 'saga'
/** 11/10 출력량 — 베이비챗의 배수 표기와 크랙의 카드 고르기를 합쳤다. 글자 수는 엔진 지시(context.ts styleDirective)의 목표치. */
const OPTIONS: Array<{ value: Length; label: string; rate: string; chars: string; hint: string }> = [
  { value: 'scene', label: '기본', rate: '1.0x', chars: '약 1,000자', hint: '장면 하나를 충분히 — 대사가 4~6번 오가요' },
  { value: 'long', label: '길게', rate: '1.7x', chars: '약 1,800자', hint: '서술과 대사를 더 깊게 펼쳐요' },
  { value: 'saga', label: '아주 길게', rate: '2.5x', chars: '약 2,500자', hint: '한 턴을 웹소설 한 회처럼 길게' },
]

export type Thinking = 'auto' | 'low' | 'medium' | 'high'
const THINKING_KEY = 'miro:chat-thinking', THINKING_EVENT = 'miro:chat-thinking'
const THINKING: Array<{ value: Thinking; label: string }> = [{ value: 'auto', label: '작품 기본' }, { value: 'low', label: '낮음' }, { value: 'medium', label: '보통' }, { value: 'high', label: '높음' }]
const readThinking = (): Thinking => { try { const v = localStorage.getItem(THINKING_KEY); return v === 'low' || v === 'medium' || v === 'high' ? v : 'auto' } catch { return 'auto' } }
const subscribe = (on: () => void) => { window.addEventListener(THINKING_EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(THINKING_EVENT, on); window.removeEventListener('storage', on) } }
/** 11/10 생각 강도(effort) — 이 기기에서 고른 값. 입력창이 턴마다 싣고, 서버는 작품 권장값보다 이 값을 먼저 쓴다. */
export function useChatThinking(): [Thinking, (v: Thinking) => void] {
  const value = useSyncExternalStore(subscribe, readThinking, () => 'auto' as Thinking)
  const set = (v: Thinking) => { try { if (v === 'auto') localStorage.removeItem(THINKING_KEY); else localStorage.setItem(THINKING_KEY, v) } catch { /* 이번 화면에서만 */ } window.dispatchEvent(new Event(THINKING_EVENT)) }
  return [value, set]
}

/** 채팅방 메뉴의 '출력량 설정' 팝업. 고른 길이는 지금 모델의 같은 회사 길이 선택지로 바꿔 저장된다(모델 선택과 같은 저장소). */
export function ReplyLengthSheet({ open, onClose, choices }: { open: boolean; onClose: () => void; choices: ChatModelChoice[] }) {
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const { model, setModel } = useChatModel()
  const selected = selectedChatChoice(choices, model)
  const current = (selected?.length ?? 'scene') as Length
  const [pick, setPick] = useState<Length>(current)
  const [thinking, setThinking] = useChatThinking()
  const [think, setThink] = useState<Thinking>(thinking)
  useEffect(() => { if (open) { setPick(current); setThink(thinking) } }, [open, current, thinking])
  const variant = (value: Length) => selected ? choices.find(c => chatModelFamily(c) === chatModelFamily(selected) && c.length === value) : undefined
  const apply = () => { const choice = variant(pick); if (choice) setModel(choice.id); setThinking(think); onClose() }

  return <Sheet open={open} onClose={onClose} title={t('출력량 설정')} variant="choice" snap={{ half: 0.78, full: 0.92 }}>
    <div className="stack" style={{ gap: 12, padding: '0 var(--space-4) var(--space-5)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('캐릭터 답변 한 번의 길이예요. 길수록 토큰을 더 써요.')}</p>
      <div role="radiogroup" aria-label={t('출력량')} className="stack" style={{ gap: 8 }}>
        {OPTIONS.map(o => {
          const choice = variant(o.value), on = pick === o.value
          return <button key={o.value} type="button" role="radio" aria-checked={on} disabled={!choice} onClick={() => setPick(o.value)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', borderRadius: 'var(--radius-lg)', textAlign: 'left', font: 'inherit', cursor: choice ? 'pointer' : 'not-allowed', opacity: choice ? 1 : 0.45,
              border: `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-1))' : 'var(--color-surface-1)', color: 'var(--color-text-primary)' }}>
            <span style={{ flex: 'none', minWidth: 46, padding: '4px 0', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 800, background: on ? 'var(--color-accent)' : 'var(--color-surface-3)', color: on ? 'var(--color-white, #fff)' : 'var(--color-text-secondary)' }}>{o.rate}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><strong style={{ fontSize: 15, fontWeight: 700 }}>{t(o.label)}</strong><span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t(o.chars)}</span></span>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t(o.hint)}</span>
            </span>
            <span style={{ flex: 'none', display: 'grid', justifyItems: 'end', gap: 4 }}>
              {choice && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}><img src="/miro-token.svg" alt="" aria-hidden width={11} height={11} />{t('최대 {count}', { count: choice.maximumTokens.toLocaleString(locale) })}</span>}
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, display: 'grid', placeItems: 'center' }}>{on && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--color-accent)' }} />}</span>
            </span>
          </button>
        })}
      </div>
      {/* 생각 강도 — 높일수록 답을 더 깊게 다듬지만 느려지고 토큰을 더 쓴다(턴당 최대 토큰이 강도만큼 늘어난다). */}
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <strong style={{ fontSize: 15, fontWeight: 700 }}>{t('생각 강도')}</strong>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('높일수록 답을 더 깊게 다듬지만, 느려지고 토큰을 더 써요.')}</p>
        <div role="radiogroup" aria-label={t('생각 강도')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {THINKING.map(o => { const on = think === o.value
            return <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setThink(o.value)}
              style={{ minHeight: 40, borderRadius: 'var(--radius-md)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-1))' : 'var(--color-surface-1)', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{t(o.label)}</button> })}
        </div>
      </div>
      <Button variant="primary" full onClick={apply} disabled={!variant(pick)}>{t('적용')}</Button>
    </div>
  </Sheet>
}
