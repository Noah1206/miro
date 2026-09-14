'use client'
import { useActionState, useId, useState } from 'react'
import { Button, Rows, Switch } from '@/components/ui'
import { saveSettings, type SettingsState } from './actions'

type Values = { pushEnabled: boolean; voiceCallEnabled: boolean; videoCallEnabled: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timeZone: string }

const ZONES = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles']

/**
 * 연락 설정. 두 덩이 — '받기' 와 '야간 연락 차단'.
 * 시간은 OS 위젯 대신 우리 톤: 30분 스텝퍼 + 24시 입력 + 한글 표기. 값은 그대로 HH:MM 이라 엔진이 읽는 형식이 바뀌지 않는다.
 */
export function SettingsForm({ initial }: { initial: Values }) {
  const [state, action, pending] = useActionState(saveSettings, { saved: false, error: null } satisfies SettingsState)
  const [push, setPush] = useState(initial.pushEnabled)
  const [voice, setVoice] = useState(initial.voiceCallEnabled)
  const [video, setVideo] = useState(initial.videoCallEnabled)
  const [quiet, setQuiet] = useState(initial.quietHoursEnabled)
  const [zone, setZone] = useState(ZONES.includes(initial.timeZone) ? initial.timeZone : 'Asia/Seoul')

  return (
    <form action={action} className="stack" style={{ gap: 'var(--space-5)' }}>
      <Section title="받기" subtitle="캐릭터가 먼저 다가오는 방법을 고릅니다.">
        <Card>
          <Rows>
            <Switch name="pushEnabled" label="먼저 연락 알림" hint="앱을 닫아도 캐릭터의 메시지·사진이 알림으로 와요." checked={push} onChange={setPush} />
            <Switch name="voiceCallEnabled" label="음성통화 수신" hint="캐릭터가 전화를 걸 수 있어요. 받지 않으면 부재중으로 남아요." checked={voice} onChange={setVoice} />
            <Switch name="videoCallEnabled" label="영상통화 수신" hint="캐릭터가 영상통화를 걸 수 있어요." checked={video} onChange={setVideo} />
          </Rows>
        </Card>
      </Section>

      <Section title="야간 연락 차단" subtitle="이 시간에는 알림과 수신 통화를 보내지 않습니다. 세계와 관계는 그대로 이어집니다.">
        <Card>
          <Rows>
            <Switch name="quietHoursEnabled" label="야간 연락 차단" hint="꺼 두면 밤에도 연락이 올 수 있어요." checked={quiet} onChange={setQuiet} />
            {/* 꺼져 있어도 값은 남긴다 — 다시 켰을 때 시간을 또 정하지 않게. 눌리지만 않게 흐린다. */}
            <div style={{ opacity: quiet ? 1 : 0.4, pointerEvents: quiet ? 'auto' : 'none', transition: 'opacity var(--motion-fast) var(--ease-standard)' }}>
              {/* 1fr 은 최소 폭이 입력 고유 폭에 잡혀 카드를 넘친다 — minmax(0,1fr) 로 눌러야 한다. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                <TimeStepper name="quietHoursStart" label="시작" defaultValue={initial.quietHoursStart} />
                <TimeStepper name="quietHoursEnd" label="종료" defaultValue={initial.quietHoursEnd} />
              </div>
            </div>
            <div style={{ opacity: quiet ? 1 : 0.4, pointerEvents: quiet ? 'auto' : 'none', transition: 'opacity var(--motion-fast) var(--ease-standard)' }}>
              <label className="stack" style={{ gap: 6 }}>
                <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>시간대</span>
                <span style={{ position: 'relative' }}>
                  <select name="timeZone" value={zone} onChange={(e) => setZone(e.target.value)}
                    style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', padding: '10px 32px 10px 0', background: 'none', border: 0, outline: 'none',
                      borderBottom: '1.5px solid var(--color-border-strong)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)', cursor: 'pointer' }}>
                    {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}><path d="M6 9l6 6 6-6" /></svg>
                </span>
                <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>야간 시간은 이 시간대 기준이에요.</span>
              </label>
            </div>
          </Rows>
        </Card>
      </Section>

      {state.error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{state.error}</p>}
      <Button type="submit" variant="primary" size="lg" full status={pending ? 'loading' : state.saved ? 'success' : 'idle'}>
        {pending ? '저장 중' : state.saved ? '저장됨' : '저장'}
      </Button>
    </form>
  )
}

/**
 * 시간 하나. ‹ › 로 30분씩, 가운데는 24시 HH:MM 텍스트 입력(직접 쳐도 된다), 밑에 '오후 11:00' 표기.
 * OS 시간 위젯을 쓰지 않는다 — 화면마다 다르게 생겨 톤이 깨진다.
 */
function TimeStepper({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [v, setV] = useState(defaultValue)
  const id = useId()
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  const mins = m ? ((Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2]))) : null
  const set = (total: number) => {
    const t = ((total % 1440) + 1440) % 1440
    setV(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  const korean = mins === null ? '' : `${mins < 720 ? '오전' : '오후'} ${String(((Math.floor(mins / 60) + 11) % 12) + 1).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  return (
    <div className="stack" style={{ gap: 6 }}>
      {/* 버튼 라벨에 '시작/종료' 를 넣지 않는다 — 입력의 라벨과 부분 일치해 접근성 이름이 셋으로 갈린다. */}
      <label htmlFor={id} className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 8px', borderBottom: '1.5px solid var(--color-border-strong)' }}>
        <StepBtn dir="prev" onClick={() => mins !== null && set(mins - 30)} label="30분 앞으로" />
        <input id={id} name={name} value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" pattern="\d{2}:\d{2}" placeholder="23:00" maxLength={5} size={5}
          style={{ flex: 1, width: 0, minWidth: 0, textAlign: 'center', background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-title-2)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }} />
        <StepBtn dir="next" onClick={() => mins !== null && set(mins + 30)} label="30분 뒤로" />
      </div>
      <span className="t-micro" style={{ textAlign: 'center', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', minHeight: 14 }}>{korean}</span>
    </div>
  )
}

function StepBtn({ dir, onClick, label }: { dir: 'prev' | 'next'; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      style={{ width: 32, height: 32, borderRadius: 16, border: 0, background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="t-title-3" style={{ marginBottom: subtitle ? 4 : 12 }}>{title}</h2>
      {subtitle && <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </section>
  )
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5) var(--space-4)' }}>{children}</div>
}
