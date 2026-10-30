import { redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { listVoiceJobs, listVoices } from '@/lib/voices'
import { can } from '@miro/domain'
import { JobForm } from './form'
import { retireVoice } from './actions'

/**
 * 목소리(10/20): 유튜브 링크 → 맥북 워커가 데이터셋·파인튜닝·등록까지 → 제작기 목소리 목록에 뜬다.
 * 미리 듣기는 /api/voices/preview 가 운영 음성 서버(MIRO_TTS_URL)로 한 문장을 합성해 돌려준다.
 */
export default async function Voices() {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'characters.manage')) redirect('/login')
  const [jobs, voices] = await Promise.all([listVoiceJobs(), listVoices()])
  return (
    <>
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>유튜브 링크로 목소리 만들기</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
          배경음이 적고 한 사람만 말하는 영상 1~3개. 남의 목소리를 허락 없이 복제해 서비스에 쓰면 퍼블리시티권 침해이고 유튜브 약관 위반입니다. 권리 근거를 사실대로 적으세요.
        </p>
        <JobForm />
      </section>

      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>작업</h3>
      <table style={{ marginBottom: 24 }}><thead><tr><th>건 시각</th><th>ID</th><th>이름</th><th>상태</th><th>단계</th><th>로그</th></tr></thead><tbody>
        {jobs.map((j) => (
          <tr key={j.id} data-voice-job>
            <td>{j.createdAt.toLocaleString('ko-KR')}</td>
            <td>{j.voiceId}</td><td>{j.label}</td>
            <td><span className="tag" style={{ borderColor: j.status === 'done' ? 'var(--accent)' : j.status === 'failed' ? '#E65A5A' : undefined }}>{j.status}</span></td>
            <td>{j.stage || '-'}{j.error ? <div style={{ color: '#E65A5A', fontSize: 12 }}>{j.error}</div> : null}</td>
            <td>{j.log ? <details><summary style={{ cursor: 'pointer', fontSize: 12 }}>보기</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 240, overflow: 'auto' }}>{j.log.slice(-4000)}</pre></details> : '-'}</td>
          </tr>
        ))}
        {jobs.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>작업이 없습니다.</td></tr>}
      </tbody></table>

      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>라이브러리</h3>
      <table><thead><tr><th>ID</th><th>이름</th><th>상태</th><th>권리</th><th>미리 듣기</th><th>회원 목소리</th></tr></thead><tbody>
        {voices.map((v) => (
          <tr key={v.id} data-voice-row>
            <td>{v.id}</td><td>{v.label}</td><td><span className="tag">{v.status}</span></td>
            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{String((v.rights as { basis?: string })?.basis ?? '-')}</td>
            <td>{v.status === 'active' ? <audio controls preload="none" src={`/api/voices/preview?voice=${encodeURIComponent(v.providerVoiceId)}`} style={{ height: 32, width: 240 }} /> : '-'}</td>
            <td>{v.ownerId ? <>{v.shared ? '공개 ' : '비공개 '}{v.status !== 'retired' && <form action={retireVoice.bind(null, v.id)} style={{ display: 'inline' }}><button type="submit">내리기</button></form>}</> : '-'}</td>
          </tr>
        ))}
      </tbody></table>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>미리 듣기는 운영 음성 서버가 켜져 있을 때만 납니다(첫 재생은 10~20초).</p>
    </>
  )
}
