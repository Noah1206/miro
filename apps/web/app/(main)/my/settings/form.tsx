'use client'
import { useActionState } from 'react'
import { saveSettings, type SettingsState } from './actions'

type Values = { pushEnabled: boolean; voiceCallEnabled: boolean; videoCallEnabled: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timeZone: string }

export function SettingsForm({ initial }: { initial: Values }) {
  const [state, action, pending] = useActionState(saveSettings, { saved: false, error: null } satisfies SettingsState)
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Toggle name="pushEnabled" label="캐릭터 선연락 알림(Push)" on={initial.pushEnabled} />
      <Toggle name="voiceCallEnabled" label="음성통화 수신" on={initial.voiceCallEnabled} />
      <Toggle name="videoCallEnabled" label="영상통화 수신" on={initial.videoCallEnabled} />
      <Toggle name="quietHoursEnabled" label="야간 연락 차단 (Quiet Hours)" on={initial.quietHoursEnabled}
        hint="켜져 있으면 이 시간에는 알림과 수신 통화를 보내지 않습니다. 캐릭터의 세계와 관계는 계속 진행됩니다." />
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={lbl}>시작<input name="quietHoursStart" type="time" defaultValue={initial.quietHoursStart} style={inp} /></label>
        <label style={lbl}>종료<input name="quietHoursEnd" type="time" defaultValue={initial.quietHoursEnd} style={inp} /></label>
      </div>
      <label style={lbl}>시간대<input name="timeZone" defaultValue={initial.timeZone} list="tz" style={inp} />
        <datalist id="tz">{['Asia/Seoul','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles'].map((z) => <option key={z} value={z} />)}</datalist>
      </label>
      {state.error && <p role="alert" style={{ color: 'var(--accent-strong)', fontSize: 12.5, margin: 0 }}>{state.error}</p>}
      <button type="submit" disabled={pending} style={{ marginTop: 8, padding: 14, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>
        {pending ? '저장 중…' : state.saved ? '저장됨' : '저장'}
      </button>
    </form>
  )
}
function Toggle({ name, label, on, hint }: { name: string; label: string; on: boolean; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>{label}<input name={name} type="checkbox" defaultChecked={on} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} /></span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{hint}</span>}
    </label>
  )
}
const lbl: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }
const inp: React.CSSProperties = { padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, colorScheme: 'dark' }
