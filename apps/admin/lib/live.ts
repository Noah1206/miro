import { sql } from 'drizzle-orm'
import { db } from '@miro/db'

/**
 * 11/18 실시간 현황(관리자 /live). 새 표 없이 이미 쌓이는 것만 읽는다:
 *  - 지금 접속 중: 운영 웹 서버 메모리의 접속 신호(GET /api/presence, CRON_SECRET) — 화면이 45초마다 보낸다.
 *  - 활동: analytics_events(로그인·화면 이동·대화·결제…) + ai_usage(대화 AI 응답·실패) + generated_media(사진) + bank_transfer_orders(입금 신청).
 * 운영자 계정(관리자 이메일 + MIRO_OPERATOR_EMAILS)은 어디서든 뺀다. 대화 본문·이메일 전체·토큰은 읽지 않는다.
 */

export type Category = 'auth' | 'page' | 'create' | 'chat' | 'payment' | 'error' | 'other'
export type LiveEvent = { id: string; at: string; userId: string | null; anonId: string | null; who: string | null; event: string; label: string; category: Category; detail: string | null }
export type Status = 'online' | 'idle' | 'offline'
export type LivePerson = {
  key: string; userId: string | null; anonId: string; who: string; status: Status; path: string; page: string; activity: string
  device: string | null; firstSeen: number; lastSeen: number; src: string | null; ref: string | null
}
export type Kpi = { online: number; visitorsToday: number; signupsToday: number; activeSessions: number; pageViewsToday: number; activityToday: number }

const ONLINE_MS = 100_000   // 신호 45초 간격 — 두 번 놓치면 비활성
const KST_TODAY = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`
const WHO = sql`coalesce(nullif(u.display_name, ''), left(split_part(u.email, '@', 1), 3) || '…')`
const uuidArray = (ids: Iterable<string>) => `{${[...ids].filter(id => /^[0-9a-f-]{36}$/.test(id)).join(',')}}`

/** 이벤트 이름 → 화면 문구·분류. 여기 없는 이름은 그대로 보인다. */
const EVENTS: Record<string, [string, Category]> = {
  login: ['로그인', 'auth'], logout: ['로그아웃', 'auth'], signup: ['가입', 'auth'], account_deleted: ['계정 삭제', 'auth'],
  page_viewed: ['화면 이동', 'page'], archive_opened: ['보관함 열기', 'page'], upgrade_viewed: ['요금제 보기', 'page'],
  character_created: ['캐릭터 만들기', 'create'], character_selected: ['캐릭터 선택', 'chat'], rp_started: ['채팅 시작', 'chat'],
  rp_message_sent: ['메시지 전송', 'chat'], ai_ok: ['AI 응답 수신', 'chat'], scene_changed: ['장면 전환', 'chat'], event_triggered: ['이야기 사건', 'chat'],
  story_ending: ['결말 도달', 'chat'], unveil_enabled: ['언베일 켜기', 'chat'], photo: ['사진 생성', 'create'],
  call_started: ['통화 시작', 'chat'], call_completed: ['통화 종료', 'chat'], call_unanswered: ['통화 못 받음', 'chat'],
  reality_contact_sent: ['캐릭터가 먼저 연락', 'chat'], reality_contact_opened: ['먼저 온 연락 열기', 'chat'],
  recharge_purchased: ['충전 완료', 'payment'], subscription_started: ['구독 시작', 'payment'], bank_requested: ['입금 신청', 'payment'],
  usage_limit_reached: ['이용 한도 도달', 'error'], ai_error: ['AI 오류', 'error'], report_submitted: ['신고', 'other'],
  session_archived: ['대화방 보관', 'other'], session_deleted: ['대화방 삭제', 'other'],
}

let opsCache: { at: number; ids: string[] } | null = null
/** 운영자·테스터 계정 id — 1분 캐시. */
export async function opsIds(): Promise<string[]> {
  if (opsCache && Date.now() - opsCache.at < 60_000) return opsCache.ids
  // 운영자 본인 계정은 MIRO_ADULT_TESTERS 에 있다(tooling/ops/live.py 와 같은 기준).
  const testers = [process.env.MIRO_OPERATOR_EMAILS, process.env.MIRO_ADULT_TESTERS].join(',').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const rows = await db.execute(sql`select u.id from public.users u where lower(u.email) in (select lower(email) from admin_users)
    or lower(u.email) = any(${`{${testers.map(t => `"${t.replace(/"/g, '')}"`).join(',')}}`}::text[])`)
  opsCache = { at: Date.now(), ids: [...rows].map(r => String((r as { id: string }).id)) }
  return opsCache.ids
}

function toEvent(r: Record<string, unknown>): LiveEvent {
  const event = String(r.event)
  const [label, category] = EVENTS[event] ?? [event, 'other' as Category]
  return {
    id: String(r.id), at: new Date(r.at as string).toISOString(), userId: (r.user_id as string) ?? null, anonId: (r.anon as string) ?? null,
    who: (r.who as string) ?? null, event, label, category, detail: (r.detail as string) || null,
  }
}

/**
 * 활동 기록 — 최신순. since 이후(포함)만, 또는 한 사람(userId / 익명 ID 들)만.
 * home_viewed 는 퍼널용 중복(화면 이동 page_viewed 가 같은 일을 남긴다)이라 뺀다. 캐릭터 하루 생활 같은 뒤 작업(agency_*) AI 호출도 사람의 행동이 아니라 뺀다.
 */
export async function events(opts: { since?: Date; limit?: number; userId?: string; anonIds?: string[] } = {}): Promise<LiveEvent[]> {
  const ops = uuidArray(await opsIds())
  // raw sql 에 Date 를 넣으면 postgres 바인딩이 실패한다 — 문자열 + ::timestamptz.
  const since = sql`${(opts.since ?? new Date(Date.now() - 24 * 3600_000)).toISOString()}::timestamptz`
  const limit = Math.min(opts.limit ?? 200, 2000)
  const anons = uuidArray(opts.anonIds ?? [])
  const who = opts.userId
    ? sql`and (x.user_id = ${opts.userId}::uuid or x.anon = any(${anons}::text[]))`
    : opts.anonIds ? sql`and x.anon = any(${anons}::text[])` : sql``
  const rows = await db.execute(sql`with x as (
      select 'e:' || e.id as id, e.created_at as at, e.user_id, e.props->>'anonId' as anon, e.event,
        coalesce(e.props->>'path', c.name, e.props->>'provider', e.props->>'kind', e.props->>'title') as detail
      from analytics_events e left join characters c on c.id::text = e.props->>'characterId'
      where e.created_at >= ${since} and e.event <> 'home_viewed'
      union all
      select 'a:' || a.id, a.created_at, a.user_id, null, case when a.ok then 'ai_ok' else 'ai_error' end,
        a.task || ' · ' || a.model || ' · ' || round(a.latency_ms / 1000.0, 1) || '초'
      from ai_usage a where a.created_at >= ${since} and a.user_id is not null and a.task not like 'agency%'
      union all
      select 'g:' || g.id, g.created_at, s.user_id, null, 'photo', c.name
      from generated_media g join roleplay_sessions s on s.id = g.session_id left join characters c on c.id = s.character_id
      where g.created_at >= ${since}
      union all
      select 'b:' || b.id, b.created_at, b.user_id, null, 'bank_requested', b.amount_minor || '원'
      from bank_transfer_orders b where b.created_at >= ${since}
    )
    select x.*, ${WHO} as who from x left join public.users u on u.id = x.user_id
    where (x.user_id is null or not (x.user_id = any(${ops}::uuid[]))) ${who}
    order by x.at desc limit ${limit}`)
  return [...rows].map(r => toEvent(r as Record<string, unknown>))
}

export async function kpis(online: number, activeSessions: number): Promise<Kpi> {
  const ops = uuidArray(await opsIds())
  const notOps = sql`(user_id is null or not (user_id = any(${ops}::uuid[])))`
  const [r] = await db.execute(sql`select
    (select count(distinct props->>'anonId') from analytics_events where event in ('home_viewed', 'page_viewed') and created_at >= ${KST_TODAY} and ${notOps})::int as visitors,
    (select count(*) from public.users where created_at >= ${KST_TODAY} and deleted_at is null and not (id = any(${ops}::uuid[])))::int as signups,
    (select count(*) from analytics_events where event = 'page_viewed' and created_at >= ${KST_TODAY} and ${notOps})::int as views,
    (select count(*) from analytics_events where event not in ('home_viewed', 'page_viewed') and created_at >= ${KST_TODAY} and ${notOps})::int as acts`)
  const k = r as Record<string, number>
  return { online, activeSessions, visitorsToday: k.visitors ?? 0, signupsToday: k.signups ?? 0, pageViewsToday: k.views ?? 0, activityToday: k.acts ?? 0 }
}

type RawPresence = { id: string; userId: string | null; path: string; src: string | null; ref: string | null; device?: string | null; firstSeen: number; lastSeen: number; leftAt?: number | null }

/** 운영 웹 서버에 지금 접속 중인 사람을 묻는다. 서버가 꺼졌거나 비밀값이 다르면 null(화면에 '연결 안 됨'). */
export async function fetchPresence(): Promise<{ now: number; people: RawPresence[] } | null> {
  const url = process.env.MIRO_PRESENCE_URL ?? 'http://127.0.0.1:3100/api/presence'
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(4000) })
    return res.ok ? await res.json() as { now: number; people: RawPresence[] } : null
  } catch { return null }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

/** 주소 → 화면 이름. 대화방·작품 주소의 id 는 캐릭터·작품 이름으로 바꾼다(names). */
export function pageName(path: string, names: Map<string, string> = new Map()): string {
  const seg = path.split('/').filter(Boolean)
  const name = (s: string | undefined) => (s && names.get(s)) || ''
  const with_ = (base: string, s?: string) => name(s) ? `${base} · ${name(s)}` : base
  switch (seg[0]) {
    case undefined: return '첫 화면'
    case 'home': return '홈'
    case 'explore': return '탐색'
    case 'search': return '검색'
    case 'genre': return `장르 · ${decodeURIComponent(seg[1] ?? '')}`
    case 'character': return with_(seg[2] === 'comments' ? '캐릭터 댓글' : '캐릭터 상세', seg[1])
    case 'chat': return with_(seg[2] === 'memory' ? '대화 기억' : seg[2] === 'note' ? '유저노트' : seg[2] === 'novel' ? '웹소설' : '채팅방', seg[1])
    case 'messages': return seg[1] === 'story' ? '스토리 문자' : with_(seg[1] ? '문자방' : '문자 목록', seg[1])
    case 'stories': return seg[1] === 'play' ? '오리지널 스토리 플레이' : with_(seg[1] ? '오리지널 스토리 소개' : '오리지널 스토리', seg[1])
    case 'live': return with_('장면 보기', seg[1])
    case 'call': return '통화'
    case 'create': return '캐릭터 만들기'
    case 'my': return seg[1] === 'characters' ? '내 캐릭터' : seg[1] ? `내 정보 · ${seg[1]}` : '내 정보'
    case 'recharge': return '충전'
    case 'earnings': return '창작 보상'
    case 'archive': return '보관함'
    case 'onboarding': return '가입 온보딩'
    case 'login': return '로그인'
    case 'terms': return '약관'
    case 'e': return '이벤트 페이지'
    case 'creator': case 'creators': return '창작자'
    case 'persona': return '페르소나'
    case 'report': return '신고'
    default: return path
  }
}

/** 화면 → 하고 있는 일. 최근 2분 안에 남은 활동(메시지 전송 등)이 있으면 그게 우선이다. */
function activityOf(path: string, recent: LiveEvent | undefined, now: number): string {
  if (recent && recent.event !== 'page_viewed' && now - Date.parse(recent.at) < 120_000) return recent.label
  const s = path.split('/')[1]
  return ({ chat: '채팅 중', messages: '문자 중', call: '통화 중', create: '캐릭터 만드는 중', recharge: '충전 화면', character: '캐릭터 보는 중',
    home: '둘러보는 중', explore: '둘러보는 중', search: '검색 중', stories: '스토리 보는 중', onboarding: '가입 중', login: '로그인 중' } as Record<string, string>)[s ?? ''] ?? '보는 중'
}

/** 주소 속 대화방 id·캐릭터 slug·스토리 slug → 이름. */
export async function namesFor(paths: string[]): Promise<Map<string, string>> {
  const ids = new Set<string>(), slugs = new Set<string>()
  for (const p of paths) {
    const seg = p.split('/').filter(Boolean)
    if (seg[1] && UUID.test(seg[1])) ids.add(seg[1])
    else if (seg[1] && (seg[0] === 'character' || seg[0] === 'stories')) slugs.add(decodeURIComponent(seg[1]))
  }
  const out = new Map<string, string>()
  if (!ids.size && !slugs.size) return out
  const idArr = uuidArray(ids), slugArr = `{${[...slugs].map(s => `"${s.replace(/["\\]/g, '')}"`).join(',')}}`
  const rows = await db.execute(sql`
    select s.id::text as k, c.name from roleplay_sessions s join characters c on c.id = s.character_id where s.id = any(${idArr}::uuid[])
    union all select c.id::text, c.name from characters c where c.id = any(${idArr}::uuid[])
    union all select c.slug, c.name from characters c where c.slug = any(${slugArr}::text[])`)
  for (const r of rows as unknown as Array<{ k: string; name: string }>) out.set(r.k, r.name)
  return out
}

/** 접속 신호 + 계정 이름 + 최근 활동 → 화면에 보일 사람 목록. 운영자는 뺀다. */
export async function people(raw: RawPresence[], recent: LiveEvent[], now = Date.now()): Promise<LivePerson[]> {
  const ops = new Set(await opsIds())
  const list = raw.filter(p => !p.userId || !ops.has(p.userId))
  const userIds = uuidArray(new Set(list.map(p => p.userId).filter((x): x is string => !!x)))
  const whoRows = userIds === '{}' ? [] : [...await db.execute(sql`select u.id::text as id, ${WHO} as who from public.users u where u.id = any(${userIds}::uuid[])`)] as Array<{ id: string; who: string }>
  const who = new Map(whoRows.map(r => [r.id, r.who]))
  const names = await namesFor(list.map(p => p.path))
  const lastOf = new Map<string, LiveEvent>()
  for (const e of recent) { const k = e.userId ?? e.anonId; if (k && !lastOf.has(k)) lastOf.set(k, e) }
  return list.map(p => {
    const status: Status = p.leftAt ? 'offline' : now - p.lastSeen < ONLINE_MS ? 'online' : 'idle'
    return {
      key: p.id, userId: p.userId, anonId: p.id, who: (p.userId && who.get(p.userId)) || `방문자 ${p.id.slice(0, 4)}`, status, path: p.path,
      page: pageName(p.path, names), activity: status === 'offline' ? '나감' : activityOf(p.path, lastOf.get(p.userId ?? '') ?? lastOf.get(p.id), now),
      device: p.device ?? null, firstSeen: p.firstSeen, lastSeen: p.leftAt ?? p.lastSeen, src: p.src, ref: p.ref,
    }
  })
}

/* ───────── 사용자 상세 ───────── */

export type UserDetail = {
  id: string; isUser: boolean; who: string; joinedAt: string | null; plan: string | null; adult: boolean; deleted: boolean
  anonIds: string[]; usage: { sessions: number; messages: number; aiCalls: number; tokens: number; cost: number; photos: number }
}

/** id 는 계정 id 이거나(로그인 사용자) 익명 ID(로그인 전 방문자). */
export async function userDetail(id: string): Promise<UserDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const [u] = await db.execute(sql`select u.id::text, ${WHO} as who, u.created_at, u.plan, u.adult_verified_at is not null as adult, u.deleted_at is not null as deleted
    from public.users u where u.id = ${id}::uuid`) as unknown as Array<{ id: string; who: string; created_at: string; plan: string; adult: boolean; deleted: boolean }>
  if (!u) {
    const [seen] = await db.execute(sql`select 1 from analytics_events where props->>'anonId' = ${id} limit 1`)
    return seen ? { id, isUser: false, who: `방문자 ${id.slice(0, 4)}`, joinedAt: null, plan: null, adult: false, deleted: false, anonIds: [id],
      usage: { sessions: 0, messages: 0, aiCalls: 0, tokens: 0, cost: 0, photos: 0 } } : null
  }
  const anon = await db.execute(sql`select distinct props->>'anonId' as a from analytics_events where user_id = ${id}::uuid and props ? 'anonId' limit 50`)
  const [usage] = await db.execute(sql`select
    (select count(*) from roleplay_sessions where user_id = ${id}::uuid)::int as sessions,
    (select count(*) from analytics_events where user_id = ${id}::uuid and event = 'rp_message_sent')::int as messages,
    (select count(*) from ai_usage where user_id = ${id}::uuid)::int as ai_calls,
    (select coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) from ai_usage where user_id = ${id}::uuid)::bigint as tokens,
    (select coalesce(sum(coalesce(actual_cost, estimated_cost, 0)), 0) from ai_usage where user_id = ${id}::uuid)::float8 as cost,
    (select count(*) from generated_media g join roleplay_sessions s on s.id = g.session_id where s.user_id = ${id}::uuid)::int as photos`) as unknown as Array<Record<string, number | string>>
  return {
    id, isUser: true, who: u.who, joinedAt: new Date(u.created_at).toISOString(), plan: u.plan, adult: u.adult, deleted: u.deleted,
    anonIds: [...anon].map(r => String((r as { a: string }).a)).filter(Boolean),
    usage: { sessions: Number(usage!.sessions), messages: Number(usage!.messages), aiCalls: Number(usage!.ai_calls), tokens: Number(usage!.tokens), cost: Number(usage!.cost), photos: Number(usage!.photos) },
  }
}

/** 활동을 접속 단위로 묶는다 — 30분 넘게 아무 일이 없으면 새 접속. events 는 최신순. */
export function sessionsOf(evs: LiveEvent[]): Array<{ start: string; end: string; minutes: number; count: number; pages: number }> {
  const asc = [...evs].reverse(), out: Array<{ start: string; end: string; minutes: number; count: number; pages: number }> = []
  for (const e of asc) {
    const last = out[out.length - 1]
    if (last && Date.parse(e.at) - Date.parse(last.end) < 30 * 60_000) { last.end = e.at; last.count++; if (e.event === 'page_viewed') last.pages++ }
    else out.push({ start: e.at, end: e.at, minutes: 0, count: 1, pages: e.event === 'page_viewed' ? 1 : 0 })
  }
  for (const s of out) s.minutes = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000)
  return out.reverse()
}

/* ───────── 통계 ───────── */

type Row = Record<string, string | number | null>
const rowsOf = async (q: ReturnType<typeof sql>) => [...await db.execute(q)] as Row[]

/** 사용자·방문자 통계. 방문자 = 홈 방문·화면 이동을 남긴 서로 다른 브라우저(익명 ID). 날짜는 한국 시간. */
export async function userAnalytics() {
  const ops = uuidArray(await opsIds())
  const notOps = sql`(user_id is null or not (user_id = any(${ops}::uuid[])))`
  const visits = sql`(select props->>'anonId' as anon, user_id, created_at, (created_at at time zone 'Asia/Seoul') as kst from analytics_events
    where event in ('home_viewed', 'page_viewed') and props ? 'anonId' and ${notOps})`
  const [daily, weekly, monthly, newRet, hourly, pages, totals, dwell] = await Promise.all([
    rowsOf(sql`with d as (select generate_series((now() at time zone 'Asia/Seoul')::date - 29, (now() at time zone 'Asia/Seoul')::date, '1 day')::date as day)
      select to_char(d.day, 'MM-DD') as label,
        (select count(distinct anon) from ${visits} v where v.kst::date = d.day)::int as visitors,
        (select count(*) from public.users u where (u.created_at at time zone 'Asia/Seoul')::date = d.day and u.deleted_at is null and not (u.id = any(${ops}::uuid[])))::int as signups
      from d order by d.day`),
    rowsOf(sql`select to_char(date_trunc('week', kst), 'MM-DD') || '주' as label, count(distinct anon)::int as visitors
      from ${visits} v where kst > (now() at time zone 'Asia/Seoul') - interval '12 weeks' group by date_trunc('week', kst) order by date_trunc('week', kst)`),
    rowsOf(sql`select to_char(date_trunc('month', kst), 'YYYY-MM') as label, count(distinct anon)::int as visitors
      from ${visits} v where kst > (now() at time zone 'Asia/Seoul') - interval '12 months' group by date_trunc('month', kst) order by date_trunc('month', kst)`),
    // 최근 30일 방문자 중 그 30일 전에도 온 적 있으면 기존, 아니면 신규.
    rowsOf(sql`with recent as (select distinct anon from ${visits} v where created_at > now() - interval '30 days'),
      old as (select distinct anon from ${visits} v where created_at <= now() - interval '30 days')
      select (select count(*) from recent where anon not in (select anon from old))::int as new, (select count(*) from recent where anon in (select anon from old))::int as returning`),
    rowsOf(sql`select extract(hour from kst)::int as hour, count(distinct anon)::int as visitors from ${visits} v
      where created_at > now() - interval '7 days' group by 1 order by 1`),
    rowsOf(sql`select regexp_replace(props->>'path', '[0-9a-f]{8}-[0-9a-f-]{27}', ':id', 'g') as path, count(*)::int as views, count(distinct props->>'anonId')::int as people
      from analytics_events where event = 'page_viewed' and created_at > now() - interval '7 days' and ${notOps} group by 1 order by 2 desc limit 25`),
    rowsOf(sql`select
      (select count(*) from public.users where deleted_at is null and not is_guest and not (id = any(${ops}::uuid[])))::int as total,
      (select count(distinct e.user_id) from analytics_events e join public.users u on u.id = e.user_id and u.deleted_at is null and not u.is_guest
        where e.created_at > now() - interval '7 days' and not (e.user_id = any(${ops}::uuid[])))::int as active7,
      (select count(*) from (select user_id from analytics_events where created_at > now() - interval '7 days' and user_id is not null and ${notOps}
        group by user_id having count(distinct (created_at at time zone 'Asia/Seoul')::date) >= 2) r)::int as returning7,
      (select count(*) from (select distinct user_id from analytics_events where created_at between now() - interval '30 days' and now() - interval '7 days' and user_id is not null and ${notOps}
        except select distinct user_id from analytics_events where created_at > now() - interval '7 days' and user_id is not null) c)::int as churned`),
    // 하루 이용 시간 = 그날 첫 화면~마지막 화면(화면 이동 page_viewed 만 — 홈 방문은 탭을 다시 열 때마다 남아 부풀려진다), 한 번만 본 사람은 빼고 평균.
    // ponytail: 아침·밤 두 번 들어오면 그 사이도 센다. 정확히 하려면 30분 쉼으로 접속을 나눠 더할 것.
    rowsOf(sql`select round(avg(extract(epoch from mx - mn)) / 60, 1)::float8 as minutes, count(*)::int as samples from (
      select props->>'anonId' as anon, (created_at at time zone 'Asia/Seoul')::date, min(created_at) as mn, max(created_at) as mx from analytics_events
      where event = 'page_viewed' and created_at > now() - interval '7 days' and ${notOps} group by 1, 2 having count(*) > 1) t`),
  ])
  return { daily, weekly, monthly, newRet: newRet[0] ?? {}, hourly, pages, totals: totals[0] ?? {}, dwell: dwell[0] ?? {} }
}

/** 서비스 사용량 — AI 호출(ai_usage)·메시지. 운영자 호출도 비용이라 여기서는 빼지 않는다. */
export async function usageAnalytics() {
  const [daily, tasks, messages, today] = await Promise.all([
    rowsOf(sql`with d as (select generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, '1 day')::date as day)
      select to_char(d.day, 'MM-DD') as label, count(a.id)::int as calls, count(a.id) filter (where not a.ok)::int as errors,
        coalesce(sum(coalesce(a.input_tokens, 0) + coalesce(a.output_tokens, 0)), 0)::bigint as tokens,
        coalesce(round(avg(a.latency_ms)), 0)::int as avg_ms,
        coalesce(sum(coalesce(a.actual_cost, a.estimated_cost, 0)), 0)::float8 as cost
      from d left join ai_usage a on a.created_at > now() - interval '15 days' and (a.created_at at time zone 'Asia/Seoul')::date = d.day group by d.day order by d.day`),
    rowsOf(sql`select task, count(*)::int as calls, round(100.0 * count(*) filter (where not ok) / count(*), 1)::float8 as error_pct,
        round(avg(latency_ms))::int as avg_ms, (percentile_cont(0.95) within group (order by latency_ms))::int as p95_ms,
        coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint as tokens,
        coalesce(sum(coalesce(actual_cost, estimated_cost, 0)), 0)::float8 as cost
      from ai_usage where created_at > now() - interval '7 days' group by task order by calls desc`),
    rowsOf(sql`with d as (select generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, '1 day')::date as day)
      select to_char(d.day, 'MM-DD') as label, count(e.id)::int as messages from d
      left join analytics_events e on e.event = 'rp_message_sent' and e.created_at > now() - interval '15 days' and (e.created_at at time zone 'Asia/Seoul')::date = d.day group by d.day order by d.day`),
    rowsOf(sql`select count(*)::int as calls, count(*) filter (where not ok)::int as errors, coalesce(round(avg(latency_ms)), 0)::int as avg_ms,
        coalesce((percentile_cont(0.95) within group (order by latency_ms)), 0)::int as p95_ms,
        coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint as tokens,
        coalesce(sum(coalesce(actual_cost, estimated_cost, 0)), 0)::float8 as cost
      from ai_usage where created_at >= ${KST_TODAY}`),
  ])
  return { daily, tasks, messages, today: today[0] ?? {} }
}
