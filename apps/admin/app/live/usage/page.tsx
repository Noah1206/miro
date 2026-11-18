import { usageAnalytics } from '@/lib/live'
import { Bars } from '../live-client'
import s from '../live.module.css'

export const dynamic = 'force-dynamic'

const n = (v: unknown) => Number(v ?? 0)
const series = (rows: Array<Record<string, unknown>>, key: string) => rows.map(r => ({ label: String(r.label), value: n(r[key]) }))
const sec = (ms: unknown) => `${(n(ms) / 1000).toFixed(1)}초`

/** AI 요청·응답 시간·오류·토큰·비용(ai_usage)과 메시지 수. 운영자 호출도 비용이라 포함. */
export default async function UsageAnalytics() {
  const u = await usageAnalytics()
  const t = u.today
  return <>
    <h1 className={s.h1}>Usage Analytics</h1>
    <p className={s.sub}>AI 호출 기록(ai_usage) 기준 — 대화 응답과 캐릭터 뒤 작업(agency_*)을 모두 셉니다. 일반 웹 요청은 따로 기록하지 않아요(화면 조회는 User Analytics).</p>
    <div className={s.kpis}>
      <div className={s.kpi}><span>오늘 AI 요청</span><strong>{n(t.calls).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>오늘 오류</span><strong>{n(t.errors).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>평균 응답 시간</span><strong>{sec(t.avg_ms)}</strong></div>
      <div className={s.kpi}><span>p95 응답 시간</span><strong>{sec(t.p95_ms)}</strong></div>
      <div className={s.kpi}><span>오늘 토큰</span><strong>{n(t.tokens).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>오늘 비용</span><strong>${n(t.cost).toFixed(2)}</strong></div>
    </div>
    <div className={s.split}>
      <section className={s.panel}><h2 className={s.h2}>일별 AI 요청 <small>14일</small></h2><Bars data={series(u.daily, 'calls')} /></section>
      <section className={s.panel}><h2 className={s.h2}>일별 오류 <small>14일</small></h2><Bars data={series(u.daily, 'errors')} /></section>
      <section className={s.panel}><h2 className={s.h2}>일별 평균 응답 시간 <small>14일</small></h2><Bars data={series(u.daily, 'avg_ms')} unit="sec" /></section>
      <section className={s.panel}><h2 className={s.h2}>일별 토큰 <small>14일</small></h2><Bars data={series(u.daily, 'tokens')} unit="k" /></section>
      <section className={s.panel}><h2 className={s.h2}>일별 비용 <small>14일 · 달러</small></h2><Bars data={series(u.daily, 'cost')} unit="usd" /></section>
      <section className={s.panel}><h2 className={s.h2}>일별 보낸 메시지 <small>14일</small></h2><Bars data={series(u.messages, 'messages')} /></section>
    </div>
    <section className={s.panel}><h2 className={s.h2}>작업별 <small>최근 7일</small></h2>
      {u.tasks.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th>작업</th><th>요청</th><th>오류율</th><th>평균</th><th>p95</th><th>토큰</th><th>비용</th></tr></thead>
        <tbody>{u.tasks.map(r => <tr key={String(r.task)}><td className={s.mono}>{r.task}</td><td>{n(r.calls).toLocaleString()}</td>
          <td style={{ color: n(r.error_pct) >= 20 ? '#f7768e' : undefined }}>{n(r.error_pct)}%</td><td>{sec(r.avg_ms)}</td><td>{sec(r.p95_ms)}</td>
          <td>{n(r.tokens).toLocaleString()}</td><td>${n(r.cost).toFixed(3)}</td></tr>)}</tbody></table></div>
        : <div className={s.empty}>최근 7일 AI 호출이 없어요.</div>}
    </section>
  </>
}
