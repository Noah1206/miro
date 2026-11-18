import { userAnalytics } from '@/lib/live'
import { Bars } from '../live-client'
import s from '../live.module.css'

export const dynamic = 'force-dynamic'

const n = (v: unknown) => Number(v ?? 0)
const series = (rows: Array<Record<string, unknown>>, key: string) => rows.map(r => ({ label: String(r.label ?? r.hour ?? ''), value: n(r[key]) }))

/** 방문자·사용자 통계. 열 때마다 DB 에서 새로 계산한다(실시간은 Overview). */
export default async function UserAnalytics() {
  const a = await userAnalytics()
  const newN = n(a.newRet.new), retN = n(a.newRet.returning), visitorsTotal = newN + retN
  const hourly = Array.from({ length: 24 }, (_, h) => ({ label: `${h}`, value: n(a.hourly.find(r => n(r.hour) === h)?.visitors) }))
  return <>
    <h1 className={s.h1}>User Analytics</h1>
    <p className={s.sub}>방문자 = 홈 방문·화면 이동을 남긴 서로 다른 브라우저, 날짜는 한국 시간, 운영자 제외. 새로고침하면 다시 계산해요.</p>
    <div className={s.kpis}>
      <div className={s.kpi}><span>총 가입자</span><strong>{n(a.totals.total).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>활성 사용자 (7일)</span><strong>{n(a.totals.active7).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>재방문 사용자 (7일 중 2일+)</span><strong>{n(a.totals.returning7).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>이탈 사용자 (8~30일 전 활동, 최근 7일 없음)</span><strong>{n(a.totals.churned).toLocaleString()}</strong></div>
      <div className={s.kpi}><span>하루 평균 이용 시간 (7일)</span><strong>{a.dwell.minutes == null ? '—' : `${a.dwell.minutes}분`}</strong></div>
    </div>
    <section className={s.panel}><h2 className={s.h2}>일별 방문자 <small>최근 30일</small></h2><Bars data={series(a.daily, 'visitors')} /></section>
    <section className={s.panel}><h2 className={s.h2}>일별 신규 가입 <small>최근 30일</small></h2><Bars data={series(a.daily, 'signups')} /></section>
    <div className={s.split} style={{ marginTop: 16 }}>
      <section className={s.panel}><h2 className={s.h2}>주별 방문자 <small>12주</small></h2><Bars data={series(a.weekly, 'visitors')} /></section>
      <section className={s.panel}><h2 className={s.h2}>월별 방문자 <small>12개월</small></h2><Bars data={series(a.monthly, 'visitors')} /></section>
    </div>
    <div className={s.split}>
      <section className={s.panel}><h2 className={s.h2}>신규 vs 기존 방문자 <small>최근 30일</small></h2>
        {visitorsTotal ? <>
          <div className={s.ratio}><div style={{ width: `${(newN / visitorsTotal) * 100}%` }} /><div style={{ flex: 1 }} /></div>
          <p className={s.muted} style={{ margin: 0, fontSize: 13 }}>신규 {newN.toLocaleString()} ({Math.round((newN / visitorsTotal) * 100)}%) · 기존 {retN.toLocaleString()} ({Math.round((retN / visitorsTotal) * 100)}%)</p>
        </> : <div className={s.empty}>아직 데이터가 없어요.</div>}
      </section>
      <section className={s.panel}><h2 className={s.h2}>시간대별 활성 방문자 <small>최근 7일 · 한국 시간</small></h2><Bars data={hourly} /></section>
    </div>
    <section className={s.panel}><h2 className={s.h2}>페이지별 방문 <small>최근 7일 · id 는 :id 로 묶음</small></h2>
      {a.pages.length ? <table className={s.table}><thead><tr><th>주소</th><th>조회</th><th>사람</th></tr></thead>
        <tbody>{a.pages.map(p => <tr key={String(p.path)}><td className={s.mono}>{p.path}</td><td>{n(p.views).toLocaleString()}</td><td>{n(p.people).toLocaleString()}</td></tr>)}</tbody></table>
        : <div className={s.empty}>화면 이동 기록이 아직 없어요(웹 서버에 접속 신호 수정이 배포된 뒤부터 쌓여요).</div>}
    </section>
  </>
}
