'use client'
import { useActionState } from 'react'
import { Button, Field, Input, ToggleRow } from '@/components/ui'
import { saveSettings, type SettingsState } from './actions'

type Values = { pushEnabled: boolean; voiceCallEnabled: boolean; videoCallEnabled: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timeZone: string }

export function SettingsForm({ initial }: { initial: Values }) {
  const [state, action, pending] = useActionState(saveSettings, { saved: false, error: null } satisfies SettingsState)
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <ToggleRow name="pushEnabled" label="먼저 연락 알림(Push)" defaultChecked={initial.pushEnabled} />
      <ToggleRow name="voiceCallEnabled" label="음성통화 수신" defaultChecked={initial.voiceCallEnabled} />
      <ToggleRow name="videoCallEnabled" label="영상통화 수신" defaultChecked={initial.videoCallEnabled} />
      <ToggleRow name="quietHoursEnabled" label="야간 연락 차단 (Quiet Hours)" defaultChecked={initial.quietHoursEnabled} hint="이 시간에는 알림과 수신 통화를 보내지 않습니다. 세계와 관계는 그대로 이어집니다." />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">야간 연락 차단 시간</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="시작"><Input name="quietHoursStart" type="time" defaultValue={initial.quietHoursStart} /></Field>
          <Field label="종료"><Input name="quietHoursEnd" type="time" defaultValue={initial.quietHoursEnd} /></Field>
        </div>
      </fieldset>
      <Field label="시간대"><Input name="timeZone" defaultValue={initial.timeZone} list="tz" /><datalist id="tz">{['Asia/Seoul', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].map((z) => <option key={z} value={z} />)}</datalist></Field>
      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : state.saved ? 'success' : 'idle'} style={{ marginTop: 8 }}>{pending ? '저장 중' : state.saved ? '저장됨' : '저장'}</Button>
    </form>
  )
}
