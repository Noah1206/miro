import Link from 'next/link'
import { notFound } from 'next/navigation'
import { events, namesFor, pageName, sessionsOf, userDetail } from '@/lib/live'
import { FeedList, UserNow } from '../../live-client'
import s from '../../live.module.css'

export const dynamic = 'force-dynamic'

const KST = { timeZone: 'Asia/Seoul', hour12: false } as const
const time = (t: string) => new Date(t).toLocaleTimeString('ko-KR', { ...KST, hour: '2-digit', minute: '2-digit', second: '2-digit' })
const day = (t: string) => new Date(t).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' })
const full = (t: string) => new Date(t).toLocaleString('ko-KR', { ...KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 사용자 한 명(계정 id 또는 로그인 전 익명 ID)의 접속·활동 기록. 위쪽은 실시간, 아래는 최근 30일 기록. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await userDetail(id)
  if (!u) notFound()
  const evs = await events({ since: new Date(Date.now() - 30 * 86400_000), limit: 1500, ...(u.isUser ? { userId: u.id, anonIds: u.anonIds } : { anonIds: u.anonIds }) })
  const names = await namesFor(evs.filter(e => e.event === 'page_viewed' && e.detail).map(e => e.detail!))
  const sessions = sessionsOf(evs)
  const pages = evs.filter(e => e.event === 'page_viewed')
  let lastDay = ''
  return <>
    <p className={s.sub}><Link href="/live/users">← Live Users</Link></p>
    <h1 className={s.h1}>{u.who} {!u.isUser && <span className={s.badge}>비회원</span>}{u.deleted && <span className={s.badge}>삭제된 계정</span>}</h1>
    <p className={`${s.sub} ${s.mono}`}>{u.id}</p>

    <div className={s.split}>
      <section className={s.panel}><h2 className={s.h2}>지금</h2><UserNow userId={u.id} anonIds={u.anonIds} /></section>
      <section className={s.panel}><h2 className={s.h2}>기본 정보 · 이용량</h2>
        <dl className={s.kv}>
          {u.isUser && <><dt>가입</dt><dd>{full(u.joinedAt!)}</dd><dt>요금제</dt><dd>{u.plan}{u.adult ? ' · 성인 인증' : ''}</dd></>}
          <dt>대화방</dt><dd>{u.usage.sessions.toLocaleString()}개</dd>
          <dt>보낸 메시지</dt><dd>{u.usage.messages.toLocaleString()}개</dd>
          <dt>AI 호출</dt><dd>{u.usage.aiCalls.toLocaleString()}회 · 토큰 {u.usage.tokens.toLocaleString()} · ${u.usage.cost.toFixed(3)}</dd>
          <dt>사진 생성</dt><dd>{u.usage.photos.toLocaleString()}장</dd>
          <dt>최근 30일</dt><dd>접속 {sessions.length}번 · 총 {sessions.reduce((n, x) => n + x.minutes, 0)}분 · 화면 {pages.length}번</dd>
        </dl>
      </section>
    </div>

    <section className={s.panel}><h2 className={s.h2}>실시간 활동 <small>최근 24시간 · 새 활동이 위에 붙어요</small></h2><FeedList userId={u.id} anonIds={u.anonIds} limit={50} /></section>

    <div className={s.split} style={{ marginTop: 16 }}>
      <section className={s.panel}><h2 className={s.h2}>접속 기록 <small>30분 넘게 쉬면 새 접속</small></h2>
        {sessions.length ? <table className={s.table}><thead><tr><th>시작</th><th>끝</th><th>머문 시간</th><th>활동</th><th>화면</th></tr></thead>
          <tbody>{sessions.slice(0, 30).map(x => <tr key={x.start}><td className={s.mono}>{full(x.start)}</td><td className={s.mono}>{time(x.end)}</td><td>{x.minutes}분</td><td>{x.count}</td><td>{x.pages}</td></tr>)}</tbody></table>
          : <div className={s.empty}>기록이 없어요.</div>}
      </section>
      <section className={s.panel}><h2 className={s.h2}>페이지 이동 기록</h2>
        {pages.length ? <ul className={s.feed}>{pages.slice(0, 40).map(e => <li key={e.id}><time className={s.mono}>{time(e.at)}</time><span>{pageName(e.detail ?? '/', names)} <span className={s.muted}>{e.detail}</span></span></li>)}</ul>
          : <div className={s.empty}>화면 이동 기록이 없어요(접속 신호 배포 이후부터 쌓여요).</div>}
      </section>
    </div>

    <section className={s.panel} style={{ marginTop: 16 }}><h2 className={s.h2}>활동 타임라인 <small>최근 30일 · {evs.length}건</small></h2>
      {evs.length ? <ul className={s.timeline}>{evs.map(e => {
        const d = day(e.at), head = d !== lastDay ? (lastDay = d) : null
        return <li key={e.id}>{head && <div className={s.dayHead}>{head}</div>}<time className={s.mono}>{time(e.at)}</time>
          <i className={`${s.cat} ${s[`cat_${e.category}`]}`} />{e.event === 'page_viewed' ? `${pageName(e.detail ?? '/', names)} 접속` : e.label}
          {e.detail && e.event !== 'page_viewed' && <span className={s.muted}> · {e.detail}</span>}</li>
      })}</ul> : <div className={s.empty}>최근 30일 활동이 없어요.</div>}
    </section>
  </>
}
