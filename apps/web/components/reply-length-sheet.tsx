'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import { chatModelFamily, selectedChatChoice } from '@/lib/ai/model-presentation'
import { useChatModel } from '@/app/(main)/chat/[sessionId]/model-picker'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { StepSlider } from '@/app/(main)/create/settings-controls'

type Length = 'short' | 'scene' | 'plus' | 'long' | 'saga'
/** 11/10 출력량 — 베이비챗의 배수 표기와 크랙의 카드 고르기를 합쳤다. 글자 수는 엔진 지시(context.ts styleDirective)의 목표치. */
const OPTIONS: Array<{ value: Length; label: string; rate: string; chars: string; hint: string }> = [
  { value: 'short', label: '짧게', rate: '0.6x', chars: '약 600자', hint: '짧고 빠르게 — 대사가 2~3번 오가요' },
  { value: 'scene', label: '기본', rate: '1.0x', chars: '약 1,000자', hint: '장면 하나를 충분히 — 대사가 4~6번 오가요' },
  { value: 'plus', label: '조금 길게', rate: '1.4x', chars: '약 1,400자', hint: '기본보다 한두 박자 더 이어가요' },
  { value: 'long', label: '길게', rate: '1.7x', chars: '약 1,800자', hint: '서술과 대사를 더 깊게 펼쳐요' },
  { value: 'saga', label: '아주 길게', rate: '2.5x', chars: '약 2,500자', hint: '한 턴을 웹소설 한 회처럼 길게' },
]

export type Thinking = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const THINKING_KEY = 'miro:chat-thinking', THINKING_EVENT = 'miro:chat-thinking'
/** 11/10 사용자: 5단계 — 만들기 화면의 '생각' 막대와 같은 값·이름. 안 고르면 기본은 '보통'(high). */
const THINKING: Array<{ value: Thinking; label: string }> = [{ value: 'low', label: '빠름' }, { value: 'medium', label: '가볍게' }, { value: 'high', label: '보통' }, { value: 'xhigh', label: '깊게' }, { value: 'max', label: '최대' }]
const readThinking = (): Thinking => { try { const v = localStorage.getItem(THINKING_KEY); return THINKING.some(o => o.value === v) ? v as Thinking : 'high' } catch { return 'high' } }
const subscribe = (on: () => void) => { window.addEventListener(THINKING_EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(THINKING_EVENT, on); window.removeEventListener('storage', on) } }
/** 11/10 생각 강도(effort) — 이 기기에서 고른 값. 입력창이 턴마다 싣고, 서버는 작품 권장값보다 이 값을 먼저 쓴다. */
/** 사용자가 막대를 움직여 고른 값만 — 안 골랐으면 null(서버가 작품 권장값을 쓴다). 화면 표시용 기본값(high)과 구분한다. */
const readChosen = (): Thinking | null => { try { const v = localStorage.getItem(THINKING_KEY); return THINKING.some(o => o.value === v) ? v as Thinking : null } catch { return null } }
export function useChosenThinking(): Thinking | null { return useSyncExternalStore(subscribe, readChosen, () => null) }
export function useChatThinking(): [Thinking, (v: Thinking) => void] {
  const value = useSyncExternalStore(subscribe, readThinking, () => 'high' as Thinking)
  const set = (v: Thinking) => { try { localStorage.setItem(THINKING_KEY, v) } catch { /* 이번 화면에서만 */ } window.dispatchEvent(new Event(THINKING_EVENT)) }
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
      {/* 11/10 사용자: 출력량·생각 강도 모두 만들기 화면의 단계 막대로 — 막대로 고르고, 고른 단계의 설명·최대 토큰은 아래 한 줄로. */}
      <StepSlider label={t('출력량')} value={pick} onChange={v => setPick(v as Length)} steps={OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))} />
      {(() => { const o = OPTIONS.find(x => x.value === pick)!, choice = variant(pick)
        return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)' }}>
          <span style={{ flex: 'none', minWidth: 46, padding: '4px 0', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 800, background: 'var(--color-accent)', color: 'var(--color-white, #fff)' }}>{o.rate}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t(o.chars)}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t(o.hint)}</span>
          </span>
          {choice ? <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}><img src="/miro-token.svg" alt="" aria-hidden width={11} height={11} />{t('최대 {count}', { count: choice.maximumTokens.toLocaleString(locale) })}</span>
            : <span style={{ flex: 'none', fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('이 모델은 고를 수 없어요')}</span>}
        </div> })()}
      {/* 생각 강도 — 높일수록 답을 더 깊게 다듬지만 느려지고 토큰을 더 쓴다(턴당 최대 토큰이 강도만큼 늘어난다). */}
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        <strong style={{ fontSize: 15, fontWeight: 700 }}>{t('생각 강도')}</strong>
        <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('높일수록 답을 더 깊게 다듬지만, 느려지고 토큰을 더 써요.')}</p>
        <StepSlider label={t('생각 강도')} value={think} onChange={v => setThink(v as Thinking)} steps={THINKING.map(o => ({ value: o.value, label: t(o.label) }))} />
      </div>
      <Button variant="primary" full onClick={apply} disabled={!variant(pick)}>{t('적용')}</Button>
    </div>
  </Sheet>
}
