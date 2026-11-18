'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Category, Kpi, LiveEvent, LivePerson } from '@/lib/live'
import s from './live.module.css'

type Conn = 'connecting' | 'open' | 'retrying'
type Live = { conn: Conn; people: LivePerson[]; kpi: Kpi | null; events: LiveEvent[]; presenceOk: boolean | null; problem: string | null; at: number | null; freshIds: Set<string> }
const Ctx = createContext<Live | null>(null)
export const useLive = () => useContext(Ctx)!

const MAX_EVENTS = 1000
const CATEGORY_LABEL: Record<Category | 'all', string> = {
  all: '전체', auth: '로그인/로그아웃', page: '화면 이동', create: '콘텐츠 생성', chat: '채팅·메시지', payment: '결제', error: '오류·예외', other: '기타',
}

/** /live 아래 모든 화면이 함께 쓰는 연결 하나 — 탭을 옮겨도 끊기지 않는다. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [state, set] = useState<Live>({ conn: 'connecting', people: [], kpi: null, events: [], presenceOk: null, problem: null, at: null, freshIds: new Set() })
  useEffect(() => {
    let es: EventSource | null = null, retry: ReturnType<typeof setTimeout> | null = null, stop = false
    const open = () => {
      es = new EventSource('/api/live/stream')
      es.onopen = () => set(v => ({ ...v, conn: 'open', problem: null }))
      es.addEventListener('events', e => {
        const added = JSON.parse((e as MessageEvent).data) as LiveEvent[]
        set(v => {
          const seen = new Set(v.events.map(x => x.id))
          const fresh = added.filter(x => !seen.has(x.id))
          return { ...v, events: [...fresh, ...v.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_EVENTS), freshIds: v.events.length ? new Set(fresh.map(x => x.id)) : new Set() }
        })
      })
      es.addEventListener('snapshot', e => {
        const d = JSON.parse((e as MessageEvent).data) as { at: number; presenceOk: boolean; people: LivePerson[]; kpi: Kpi }
        set(v => ({ ...v, conn: 'open', at: d.at, presenceOk: d.presenceOk, people: d.people, kpi: d.kpi }))
      })
      es.addEventListener('problem', e => set(v => ({ ...v, problem: (JSON.parse((e as MessageEvent).data) as { message: string }).message })))
      // 끊기면 EventSource 가 스스로 다시 붙는다. 아예 닫혔으면(서버 재시작·인증 실패) 5초 뒤 새로 연다.
      es.onerror = () => {
        set(v => ({ ...v, conn: 'retrying' }))
        if (es?.readyState === EventSource.CLOSED && !stop) { es.close(); retry = setTimeout(open, 5000) }
      }
    }
    open()
    return () => { stop = true; es?.close(); if (retry) clearTimeout(retry) }
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

/* ───────── 작은 조각 ───────── */

const TZ = { timeZone: 'Asia/Seoul', hour12: false } as const
export const hms = (t: string | number) => new Date(t).toLocaleTimeString('ko-KR', { ...TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const ymd = (t: string | number) => new Date(t).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' })
export function ago(t: number, now: number) {
  const sec = Math.max(0, Math.round((now - t) / 1000))
  return sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.floor(sec / 60)}분 전` : `${Math.floor(sec / 3600)}시간 전`
}
export function span(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`
}
const DEVICE: Record<string, string> = { pc: 'PC', mobile: '모바일', tablet: '태블릿' }
const STATUS: Record<string, string> = { online: '온라인', idle: '비활성', offline: '오프라인' }

/** 1초마다 다시 그려 '몇 초 전'·체류 시간이 흐르게. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return now
}

export function Tabs() {
  const path = usePathname()
  const { conn, at, problem } = useLive()
  const now = useNow()
  const tabs = [['/live', 'Overview'], ['/live/users', 'Live Users'], ['/live/feed', 'Activity Feed'], ['/live/analytics', 'User Analytics'], ['/live/usage', 'Usage Analytics']]
  return <nav className={s.top}>
    {tabs.map(([href, label]) => <Link key={href} href={href!} className={(href === '/live' ? path === href : path.startsWith(href!)) ? s.tabOn : s.tab}>{label}</Link>)}
    <span className={s.conn} title={problem ?? undefined}>
      <i className={`${s.dot} ${conn === 'open' && !problem ? s.online : conn === 'retrying' || problem ? s.idle : ''}`} />
      {conn === 'open' ? (problem ? `오류: ${problem.slice(0, 60)}` : `실시간 연결됨${at ? ` · ${ago(at, now)} 갱신` : ''}`) : conn === 'retrying' ? '다시 연결하는 중…' : '연결하는 중…'}
    </span>
  </nav>
}

function Num({ value }: { value: number | undefined }) {
  const prev = useRef(value), [bump, setBump] = useState(false)
  useEffect(() => {
    if (prev.current !== undefined && value !== prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 900); prev.current = value; return () => clearTimeout(t) }
    prev.current = value
  }, [value])
  return <strong className={bump ? s.bump : undefined}>{value === undefined ? '—' : value.toLocaleString()}</strong>
}

export function Kpis() {
  const { kpi } = useLive()
  const items: Array<[string, number | undefined]> = [
    ['지금 온라인', kpi?.online], ['오늘 방문자', kpi?.visitorsToday], ['오늘 신규 가입', kpi?.signupsToday],
    ['활성 세션', kpi?.activeSessions], ['오늘 페이지 조회', kpi?.pageViewsToday], ['오늘 활동', kpi?.activityToday],
  ]
  return <div className={s.kpis}>{items.map(([label, v]) => <div key={label} className={s.kpi}><span>{label}</span><Num value={v} /></div>)}</div>
}

export function PresenceWarning() {
  const { presenceOk } = useLive()
  return presenceOk === false ? <div className={s.warn}>운영 웹 서버(접속 신호)에 연결하지 못했어요. 지금 접속 중인 사람은 비어 보여요 — 활동·통계는 DB 에서 그대로 읽어요. (MIRO_PRESENCE_URL·CRON_SECRET 확인)</div> : null
}

export function PeopleTable({ limit, filter = 'all' }: { limit?: number; filter?: 'all' | 'members' | 'online' }) {
  const { people, presenceOk } = useLive()
  const now = useNow()
  const order = { online: 0, idle: 1, offline: 2 }
  const rows = people
    .filter(p => filter === 'all' || (filter === 'members' ? !!p.userId : p.status === 'online'))
    .sort((a, b) => order[a.status] - order[b.status] || b.lastSeen - a.lastSeen)
    .slice(0, limit)
  if (!rows.length) return <div className={s.empty}>{presenceOk === null ? '불러오는 중…' : '지금 접속 중인 사람이 없어요.'}</div>
  return <div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>사용자</th><th>상태</th><th>현재 페이지</th><th>현재 활동</th><th>접속 시간</th><th>마지막 활동</th><th>체류</th><th>기기</th>{!limit && <th>ID</th>}</tr></thead>
    <tbody>{rows.map(p => <tr key={p.key}>
      <td><Link className={s.who} href={`/live/u/${p.userId ?? p.anonId}`}><i className={`${s.dot} ${s[p.status]}`} />{p.who}{!p.userId && <span className={s.badge}>비회원</span>}</Link></td>
      <td className={s.muted}>{STATUS[p.status]}</td>
      <td title={p.path}>{p.page}</td>
      <td>{p.activity}</td>
      <td className={s.mono}>{hms(p.firstSeen)}</td>
      <td className={s.mono}>{ago(p.lastSeen, now)}</td>
      <td className={s.mono}>{span((p.status === 'offline' ? p.lastSeen : now) - p.firstSeen)}</td>
      <td className={s.muted}>{p.device ? DEVICE[p.device] ?? p.device : '—'}</td>
      {!limit && <td className={`${s.mono} ${s.muted}`}>{(p.userId ?? p.anonId).slice(0, 8)}</td>}
    </tr>)}</tbody>
  </table></div>
}

export function UsersPage() {
  const [filter, setFilter] = useState<'all' | 'members' | 'online'>('all')
  const { people } = useLive()
  const counts = { all: people.length, members: people.filter(p => p.userId).length, online: people.filter(p => p.status === 'online').length }
  return <>
    <h1 className={s.h1}>Live Users</h1>
    <p className={s.sub}>접속 신호(화면이 45초마다 보냄) 기준 — 100초 안에 신호가 있으면 온라인, 30분 안이면 비활성, 탭을 닫으면 오프라인. 운영자 계정은 빠져요.</p>
    <PresenceWarning />
    <div className={s.filters}>{(['all', 'members', 'online'] as const).map(k =>
      <button key={k} className={filter === k ? s.chipOn : s.chip} onClick={() => setFilter(k)}>{{ all: '전체', members: '회원만', online: '온라인만' }[k]} {counts[k]}</button>)}</div>
    <div className={s.panel}><PeopleTable filter={filter} /></div>
  </>
}

export function FeedList({ limit, category = 'all', userId, anonIds }: { limit?: number; category?: Category | 'all'; userId?: string; anonIds?: string[] }) {
  const { events, freshIds } = useLive()
  const mine = useMemo(() => new Set(anonIds ?? []), [anonIds])
  const rows = events
    .filter(e => category === 'all' || e.category === category)
    .filter(e => !userId || e.userId === userId || (!!e.anonId && mine.has(e.anonId)))
    .slice(0, limit ?? 300)
  if (!rows.length) return <div className={s.empty}>{events.length ? '이 조건의 활동이 없어요.' : '최근 24시간 활동이 없어요.'}</div>
  return <ul className={s.feed}>{rows.map(e => <li key={e.id} className={freshIds.has(e.id) ? s.new : undefined}>
    <time className={s.mono}>{hms(e.at)}</time>
    <span><i className={`${s.cat} ${s[`cat_${e.category}`]}`} />
      {!userId && (e.userId || e.anonId
        ? <Link href={`/live/u/${e.userId ?? e.anonId}`}><b>{e.who ?? `방문자 ${e.anonId!.slice(0, 4)}`}</b></Link>
        : <b className={s.muted}>알 수 없음</b>)}
      {!userId && ' · '}{e.label}{e.detail && <span className={s.muted}> · {e.detail}</span>}
    </span>
  </li>)}</ul>
}

export function FeedPage() {
  const [cat, setCat] = useState<Category | 'all'>('all')
  const { events } = useLive()
  const cats: Array<Category | 'all'> = ['all', 'auth', 'page', 'create', 'chat', 'payment', 'error', 'other']
  return <>
    <h1 className={s.h1}>Activity Feed</h1>
    <p className={s.sub}>최근 24시간부터 쌓이는 실제 활동 — 최신이 위. AI 응답·오류는 대화 AI 만(캐릭터 뒤 작업은 Usage 에서). 대화 본문은 남기지 않아요.</p>
    <div className={s.filters}>{cats.map(c => <button key={c} className={cat === c ? s.chipOn : s.chip} onClick={() => setCat(c)}>
      {CATEGORY_LABEL[c]} {c === 'all' ? events.length : events.filter(e => e.category === c).length}</button>)}</div>
    <div className={s.panel}><FeedList category={cat} limit={MAX_EVENTS} /></div>
  </>
}

/** 최근 24시간 시간대별 활동 수(받은 활동으로 바로 그린다). */
export function HourlyActivity() {
  const { events } = useLive()
  const now = useNow()
  const buckets = useMemo(() => {
    const out = Array.from({ length: 24 }, (_, i) => {
      const end = now - (23 - i) * 3600_000
      return { label: new Date(end).toLocaleTimeString('ko-KR', { ...TZ, hour: '2-digit' }).replace('시', ''), value: 0, end }
    })
    for (const e of events) {
      const idx = 23 - Math.floor((now - Date.parse(e.at)) / 3600_000)
      if (idx >= 0 && idx < 24) out[idx]!.value++
    }
    return out
  }, [events, Math.floor(now / 60_000)]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Bars data={buckets} />
}

const UNITS = { sec: (v: number) => `${(v / 1000).toFixed(1)}s`, k: (v: number) => `${Math.round(v / 1000)}k`, usd: (v: number) => v.toFixed(2) }

export function Bars({ data, unit }: { data: Array<{ label: string; value: number }>; unit?: keyof typeof UNITS }) {
  const format = unit ? UNITS[unit] : undefined
  // 막대에 올리면 위 숫자가 그 막대 값으로 바뀐다. 벗어나면 가장 최근(마지막) 막대.
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(d => d.value))
  if (!data.some(d => d.value)) return <div className={s.empty}>아직 데이터가 없어요.</div>
  const every = Math.ceil(data.length / 7)
  const shown = data[hover ?? data.length - 1]!
  return <>
  <div className={s.readout}><strong>{format ? format(shown.value) : shown.value.toLocaleString()}</strong><span>{shown.label}{hover === null ? ' · 최근' : ''}</span></div>
  <div className={s.bars} onMouseLeave={() => setHover(null)}>{data.map((d, i) => <div key={i} className={s.barCol} onMouseEnter={() => setHover(i)}>
    {data.length <= 12 && <span className={s.barVal}>{d.value ? (format ? format(d.value) : d.value) : ''}</span>}
    <div className={s.bar} style={{ height: `${(d.value / max) * 100}%` }} />
    <span className={s.barLabel}>{i % every === 0 ? d.label : ' '}</span>
  </div>)}</div>
  </>
}

/** 사용자 상세의 '지금' 칸 — 스트림에서 이 사람을 찾는다. */
export function UserNow({ userId, anonIds }: { userId: string; anonIds: string[] }) {
  const { people } = useLive()
  const now = useNow()
  const p = people.filter(x => x.userId === userId || anonIds.includes(x.anonId)).sort((a, b) => b.lastSeen - a.lastSeen)[0]
  if (!p) return <dl className={s.kv}><dt>상태</dt><dd><i className={`${s.dot} ${s.offline}`} /> 오프라인 <span className={s.muted}>(최근 30분 안 접속 신호 없음)</span></dd></dl>
  return <dl className={s.kv}>
    <dt>상태</dt><dd><i className={`${s.dot} ${s[p.status]}`} /> {STATUS[p.status]}</dd>
    <dt>현재 페이지</dt><dd title={p.path}>{p.page}</dd>
    <dt>현재 활동</dt><dd>{p.activity}</dd>
    <dt>접속 시작</dt><dd className={s.mono}>{hms(p.firstSeen)}</dd>
    <dt>체류 시간</dt><dd className={s.mono}>{span((p.status === 'offline' ? p.lastSeen : now) - p.firstSeen)}</dd>
    <dt>마지막 활동</dt><dd className={s.mono}>{ago(p.lastSeen, now)}</dd>
    <dt>기기</dt><dd>{p.device ? DEVICE[p.device] ?? p.device : '—'}</dd>
    {(p.src || p.ref) && <><dt>유입</dt><dd>{[p.src, p.ref].filter(Boolean).join(' · ')}</dd></>}
  </dl>
}
