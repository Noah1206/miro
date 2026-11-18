import Link from 'next/link'
import { FeedList, HourlyActivity, Kpis, PeopleTable, PresenceWarning } from './live-client'
import s from './live.module.css'

export default function Overview() {
  return <>
    <h1 className={s.h1}>Overview</h1>
    <p className={s.sub}>운영 중인 miroapp.app 의 실제 접속 신호와 DB 활동 — 3초마다 자동 갱신, 운영자 계정 제외.</p>
    <PresenceWarning />
    <Kpis />
    <div className={s.grid}>
      <div>
        <section className={s.panel}><h2 className={s.h2}>지금 접속 중 <small><Link href="/live/users">전체 보기 →</Link></small></h2><PeopleTable limit={10} /></section>
        <section className={s.panel} style={{ marginTop: 16 }}><h2 className={s.h2}>최근 24시간 활동 <small>시간별</small></h2><HourlyActivity /></section>
      </div>
      <section className={s.panel}><h2 className={s.h2}>실시간 활동 <small><Link href="/live/feed">전체 보기 →</Link></small></h2><FeedList limit={25} /></section>
    </div>
  </>
}
