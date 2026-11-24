'use client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button, Switch } from '@/components/ui'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import { PACES, type Pace } from '@/lib/simulation/pace'
import { StepSlider } from '@/app/(main)/create/settings-controls'

/** 11/24 전개 설정 — 이 기기에서 고른 값(출력량·생각 강도와 같은 방식). 입력창이 턴마다 싣는다. */
const KEY = 'miro:chat-pace', EVENT = 'miro:chat-pace'
export type ChatPace = { pace: Pace; timeSkip: boolean }
const DEFAULT: ChatPace = { pace: 'balanced', timeSkip: false }
const read = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
const parse = (raw: string): ChatPace => {
  try { const v = JSON.parse(raw || 'null'); return { pace: PACES.includes(v?.pace) ? v.pace : 'balanced', timeSkip: v?.timeSkip === true } } catch { return DEFAULT }
}
const subscribe = (on: () => void) => { window.addEventListener(EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on) } }

export function useChatPace(): [ChatPace, (v: ChatPace) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  const value = useMemo(() => parse(raw), [raw])
  const set = (v: ChatPace) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* 이번 화면에서만 */ } window.dispatchEvent(new Event(EVENT)) }
  return [value, set]
}

const OPTIONS: Array<{ value: Pace; label: string; hint: string }> = [
  { value: 'follow', label: msg('내가 이끌기'), hint: msg('캐릭터는 내 말과 행동에 반응만 해요. 다음에 무슨 일이 일어날지는 내가 정해요.') },
  { value: 'balanced', label: msg('보통'), hint: msg('지금까지와 같아요. 따로 지시를 더하지 않아요.') },
  { value: 'lead', label: msg('캐릭터가 이끌기'), hint: msg('캐릭터가 사건을 일으키고 이야기를 앞으로 끌고 가요.') },
]

/** 채팅방 설정의 '전개 설정' 화면. */
export function PacePanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [saved, save] = useChatPace()
  const [pick, setPick] = useState(saved)
  useEffect(() => { setPick(saved) }, [saved])
  const option = OPTIONS.find(o => o.value === pick.pace)!
  return (
    <div className="stack" style={{ gap: 12, padding: '4px 0 var(--space-5)' }}>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('이야기를 누가 얼마나 끌고 갈지 정해요. 토큰은 더 들지 않아요.')}</p>
      <StepSlider label={t('전개 속도')} value={pick.pace} onChange={v => setPick({ ...pick, pace: v as Pace })} steps={OPTIONS.map(o => ({ value: o.value, label: t(o.label) }))} />
      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t(option.label)}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t(option.hint)}</span>
      </div>
      <Switch name="timeSkip" label={t('늘어지는 시간 건너뛰기')} hint={t('이동·기다림처럼 아무 일 없는 시간은 짧게 넘기고 다음 장면으로 가요.')} checked={pick.timeSkip} onChange={v => setPick({ ...pick, timeSkip: v })} />
      <Button variant="primary" full onClick={() => { save(pick); onClose() }}>{t('적용')}</Button>
    </div>
  )
}
