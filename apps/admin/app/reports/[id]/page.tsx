import { notFound, redirect } from 'next/navigation'
import { currentAdmin } from '@/lib/auth'
import { reportDetail } from '@/lib/reports'
import { can } from '@miro/domain'
import { ActionPanel } from './panel'

/** n75/n76 — 신고 상세: 대상 스냅샷, 맥락, 처리 이력. 관계 수치는 보여주지 않는다. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin()
  if (!admin || !can(admin.role, 'reports.view')) redirect('/login')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const d = await reportDetail(id)
  if (!d) notFound()
  const r = d.report
  const snap = r.targetSnapshot as Record<string, unknown>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
      <section className="card">
        <h1 style={{ fontSize: 16, margin: '0 0 10px' }}>신고 <span className="tag" data-report-status>{r.status}</span> <span className="tag">v{r.version}</span></h1>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>{r.targetType} · {r.reason} · {r.createdAt.toLocaleString('ko-KR')} · 캐릭터 {d.characterName ?? '-'}{d.sessionRestricted && <> · <b style={{ color: '#E05A7A' }}>역할극 제한 중</b></>}</p>
        {r.detail && <p style={{ margin: '0 0 14px' }}>{r.detail}</p>}
        <h2 style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--muted)', margin: '0 0 6px' }}>신고 당시 대상</h2>
        <blockquote data-report-snapshot style={{ margin: '0 0 16px', padding: 12, background: 'var(--elevated)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{String(snap.content ?? `${snap.location ?? ''} · ${snap.time ?? ''}`)}</blockquote>
        <h2 style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--muted)', margin: '0 0 6px' }}>맥락 (앞뒤 턴)</h2>
        {d.context.length === 0 ? <p style={{ color: 'var(--muted)' }}>맥락을 불러올 수 없습니다 (대상이 삭제됨). 스냅샷으로 검토합니다.</p> :
          d.context.map((m) => <p key={m.id} style={{ margin: '4px 0', fontSize: 13, opacity: m.id === r.targetId ? 1 : .7 }}><span className="tag">{m.role}</span> {m.hiddenAt ? '[숨김 처리됨]' : m.content}</p>)}
      </section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {can(admin.role, 'reports.act') ? <ActionPanel reportId={id} version={r.version} status={r.status} /> : <p className="card" style={{ color: 'var(--muted)' }}>조회 전용 권한입니다.</p>}
        <section className="card">
          <h2 style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--muted)', margin: '0 0 8px' }}>처리 이력</h2>
          {d.history.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>아직 없음</p> :
            d.history.map((h, i) => <p key={i} data-history-row style={{ margin: '4px 0', fontSize: 12.5 }}>{h.createdAt.toLocaleString('ko-KR')} · {h.email} · <b>{h.action}</b> ({h.from}→{h.to}){h.note && <> — {h.note}</>}</p>)}
        </section>
      </div>
    </div>
  )
}
