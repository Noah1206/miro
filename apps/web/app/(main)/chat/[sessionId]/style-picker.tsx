'use client'
import { useTransition } from 'react'
import { Segmented } from '@/components/ui'
import { setOutputStyle } from './actions'

const OPTIONS = [{ value: 'messenger', label: '메신저형' }, { value: 'balanced', label: '균형형' }, { value: 'narrative', label: '서사형' }]

export function StylePicker({ sessionId, current, label }: { sessionId: string; current: string; label?: string }) {
  const [, start] = useTransition()
  return <Segmented label={label} options={OPTIONS} value={current} onChange={(v) => start(async () => { await setOutputStyle(sessionId, v) })} />
}
