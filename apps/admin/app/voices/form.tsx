'use client'
import { useActionState } from 'react'
import { createJob, type JobState } from './actions'

export function JobForm() {
  const [state, action, pending] = useActionState<JobState, FormData>(createJob, { message: null, ok: false })
  return (
    <form action={action} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
      <label style={{ gridColumn: '1 / -1', fontSize: 13 }}>유튜브 주소(줄바꿈이나 쉼표로 1~3개)
        <textarea name="urls" rows={3} required placeholder="https://www.youtube.com/watch?v=…" />
      </label>
      <label style={{ fontSize: 13 }}>목소리 ID<input name="voiceId" required pattern="[a-z0-9][a-z0-9-]{1,39}" placeholder="template-5" /></label>
      <label style={{ fontSize: 13 }}>화면에 보일 이름<input name="label" required maxLength={30} placeholder="템플릿 5 · 남성 부드러운 톤" /></label>
      <label style={{ fontSize: 13 }}>권리 근거
        <select name="basis" defaultValue="unverified">
          <option value="unverified">미확인(테스트용)</option><option value="own_voice">본인 목소리</option>
          <option value="written_consent">서면 동의</option><option value="license">라이선스</option>
        </select>
      </label>
      <label style={{ fontSize: 13 }}>목소리 주인<input name="holder" maxLength={200} placeholder="채널 이름 / 성우 이름" /></label>
      <label style={{ gridColumn: '1 / -1', fontSize: 13 }}>근거 메모<input name="evidence" maxLength={500} placeholder="동의 날짜·문서, 라이선스 종류 등" /></label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? '거는 중…' : '작업 걸기'}</button>
        {state.message && <span style={{ fontSize: 13, color: state.ok ? 'var(--text)' : '#E65A5A' }} data-job-message>{state.message}</span>}
      </div>
    </form>
  )
}
