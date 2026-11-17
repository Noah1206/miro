"""실시간 현황·쿠폰(11/18) — 운영 DB 를 읽기 전용으로 읽어 지금 누가 무엇을 하는지 보여 주는 로컬 페이지. 10초마다 새로 고침.

  python3 tooling/ops/live.py [--port 8095]     # → http://localhost:8095

읽기는 `begin read only; …; commit;` 한 트랜잭션(직결 주소 DIRECT_DATABASE_URL). 운영자 계정(admin_users·MIRO_OPERATOR_EMAILS)은 뺀다.
'활동' = 보낸 대화·문자, 앱 이벤트(홈 방문·언베일 등), 사진 생성, 입금 신청이 남은 것. 그냥 둘러보기만 한 사람은 홈 방문으로만 잡힌다.
"""
import argparse, html, json, os, re, subprocess
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8095)
a = ap.parse_args()


def env(name):
    # 저장소 .env 다음 운영 서버 설정(맥 운영, 운영자 이메일 목록이 여기 있다).
    for f in (ROOT / '.env', Path.home() / 'miro-prod/apps/web/.env.production.local'):
        if not f.is_file():
            continue
        for line in f.read_text().splitlines():
            if line.startswith(name + '=') and line.split('=', 1)[1].strip().strip('"'):
                return line.split('=', 1)[1].strip().strip('"')
    return os.environ.get(name, '')


URL = env('DIRECT_DATABASE_URL')
# 운영자·테스터 계정(관리자 이메일 + 운영자·성인 테스터 목록)은 집계에서 뺀다.
TESTERS = [e.strip().lower() for k in ('MIRO_OPERATOR_EMAILS', 'MIRO_ADULT_TESTERS') for e in env(k).split(',') if e.strip()]

SQL = """
begin read only;
with ops as (
  select u.id from users u where lower(u.email) in (select lower(email) from admin_users) or lower(u.email) = any(:'testers'::text[])
),
acts as (
  select s.user_id, m.created_at as at, case when m.kind = 'messenger' then '문자' else '대화' end as what, c.name as target, s.id as sid
    from messages m join roleplay_sessions s on s.id = m.session_id join characters c on c.id = s.character_id
    where m.role = 'user' and m.created_at > now() - interval '1 day'
  union all
  select e.user_id, e.created_at, e.event, coalesce(c.name, e.props->>'src', ''), null from analytics_events e
    left join characters c on c.id::text = e.props->>'characterId'
    where e.user_id is not null and e.created_at > now() - interval '1 day'
  union all
  select s.user_id, g.created_at, '사진 생성', c.name, s.id from generated_media g join roleplay_sessions s on s.id = g.session_id join characters c on c.id = s.character_id
    where g.created_at > now() - interval '1 day'
  union all
  select b.user_id, b.created_at, '입금 신청', (b.amount_minor)::text || '원', null from bank_transfer_orders b where b.created_at > now() - interval '1 day'
  union all
  select u.id, u.created_at, '가입', '', null from users u where u.created_at > now() - interval '1 day' and u.deleted_at is null
),
live as (select * from acts where user_id not in (select id from ops)),
people as (
  select distinct on (l.user_id) l.user_id, l.at, l.what, l.target, l.sid from live l
  where l.at > now() - make_interval(mins => :mins) order by l.user_id, l.at desc
)
select json_build_object(
  'now', now(),
  'active5', (select count(distinct user_id) from live where at > now() - interval '5 minutes'),
  'active30', (select count(distinct user_id) from live where at > now() - interval '30 minutes'),
  'activeToday', (select count(distinct user_id) from live where at > date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
  'visitors5', (select count(distinct props->>'anonId') from analytics_events where event = 'home_viewed' and created_at > now() - interval '5 minutes' and (user_id is null or user_id not in (select id from ops))),
  'visitorsToday', (select count(distinct props->>'anonId') from analytics_events where event = 'home_viewed' and created_at > date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' and (user_id is null or user_id not in (select id from ops))),
  'signupsToday', (select count(*) from users where created_at > date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' and deleted_at is null and id not in (select id from ops)),
  'turnsToday', (select count(*) from live where what in ('대화', '문자') and at > date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
  'people', coalesce((select json_agg(json_build_object('user', coalesce(nullif(u.display_name, ''), left(split_part(u.email, '@', 1), 3) || '…'), 'at', p.at, 'what', p.what, 'target', p.target,
      'turns', s.turn_count, 'unveil', s.adult_since is not null, 'adult', u.adult_verified_at is not null, 'joined', u.created_at) order by p.at desc)
    from people p join users u on u.id = p.user_id left join roleplay_sessions s on s.id = p.sid), '[]'),
  'feed', coalesce((select json_agg(f order by f.at desc) from (
    select coalesce(nullif(u.display_name, ''), left(split_part(u.email, '@', 1), 3) || '…') as user, l.at, l.what, l.target
    from live l join users u on u.id = l.user_id order by l.at desc limit 40) f), '[]')
);
commit;
"""

COUPONS_SQL = """
begin read only;
select coalesce(json_agg(x order by x.created_at desc), '[]') from (
  select c.code, c.units, c.valid_days, c.max_uses, c.uses, c.ends_at, c.note, c.created_at,
    (select count(*) from recharge_grants g join roleplay_sessions s on s.user_id = g.user_id and s.created_at > g.created_at and s.turn_count >= 5
      where g.provider = 'coupon' and g.external_ref = g.user_id::text || ':' || c.code) as turn5,
    (select coalesce(sum(g.consumed), 0) from recharge_grants g where g.provider = 'coupon' and g.external_ref like '%:' || c.code) as spent
  from coupons c) x;
commit;
"""


def coupons() -> list:
    out = subprocess.run(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', URL], input=COUPONS_SQL, capture_output=True, text=True, timeout=30)
    if out.returncode:
        raise RuntimeError(out.stderr.strip()[:300])
    body = out.stdout.strip()
    return json.loads(body[body.index('['):body.rindex(']') + 1])


def create_coupon(f: dict) -> str:
    code = re.sub(r'\s+', '', f.get('code', '')).upper()[:40]
    if not re.fullmatch(r'[A-Z0-9_-]{3,40}', code):
        return '코드는 영문·숫자·_- 3~40자로 써 주세요.'
    try:
        units, days = int(f.get('units') or 0), int(f.get('days') or 7)
        mx = int(f['max']) if f.get('max') else None
    except ValueError:
        return '숫자 칸을 확인해 주세요.'
    if units <= 0 or days <= 0 or (mx is not None and mx <= 0):
        return '토큰·유효기간·인원은 1 이상이어야 해요.'
    until = f.get('until') or ''   # YYYY-MM-DD → 그날 KST 자정 끝까지
    args = ['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', f'code={code}', '-v', f'units={units}', '-v', f'days={days}',
            '-v', f'mx={mx if mx else ""}', '-v', f'until={until}', '-v', f"note={f.get('note', '')[:120]}", URL]
    sql = """insert into coupons (code, units, valid_days, max_uses, ends_at, note)
      values (:'code', :units, :days, nullif(:'mx', '')::int, (nullif(:'until', '')::date + 1)::timestamp at time zone 'Asia/Seoul', nullif(:'note', ''));"""
    out = subprocess.run(args, input=sql, capture_output=True, text=True, timeout=30)
    if out.returncode:
        return '이미 있는 코드예요.' if 'duplicate' in out.stderr else out.stderr.strip()[:200]
    return f'{code} 쿠폰을 만들었어요.'


WHAT = {'home_viewed': '홈 방문', 'signup': '가입 완료', 'unveil_enabled': '언베일 켜기', 'rp_started': '대화 시작', 'character_created': '캐릭터 만들기',
        'character_selected': '캐릭터 고르기', 'rp_message_sent': '메시지', 'report_submitted': '신고', 'session_deleted': '대화방 삭제',
        'account_deleted': '탈퇴', 'reality_message_seen': '문자 읽음', 'landing_view': '랜딩 방문'}


def query(mins: int) -> dict:
    testers = '{' + ','.join('"' + t.replace('"', '') + '"' for t in TESTERS) + '}'
    out = subprocess.run(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', f'mins={mins}', '-v', f'testers={testers}', URL],
                         input=SQL, capture_output=True, text=True, timeout=30)
    if out.returncode:
        raise RuntimeError(out.stderr.strip()[:300])
    body = out.stdout.strip()
    return json.loads(body[body.index('{'):body.rindex('}') + 1])


KST = timezone(timedelta(hours=9))


def ago(ts: str, now: datetime) -> str:
    s = int((now - datetime.fromisoformat(ts)).total_seconds())
    return f'{s}초 전' if s < 60 else f'{s // 60}분 전' if s < 3600 else f'{s // 3600}시간 전'


def coupon_section(msg: str = '') -> str:
    e = html.escape
    try:
        rows = coupons()
    except Exception as err:   # noqa: BLE001 — 표가 아직 없으면(마이그레이션 전) 그 오류를 그대로
        return f'<h2>쿠폰</h2><p class="empty">{e(str(err))}</p>'
    def row(c):
        ends = f"{datetime.fromisoformat(c['ends_at']).astimezone(KST):%m-%d %H:%M} 까지" if c['ends_at'] else '마감 없음'
        note = f"<br><small>{e(c['note'])}</small>" if c['note'] else ''
        cap = f" / {c['max_uses']:,}" if c['max_uses'] else ''
        return (f"<tr><td><b>{e(c['code'])}</b>{note}</td><td>{c['units']:,}</td><td>{c['valid_days']}일</td>"
                f"<td>{c['uses']:,}{cap}</td><td>{c['turn5']:,}</td><td>{c['spent']:,}</td><td>{ends}</td></tr>")
    trs = ''.join(row(c) for c in rows) or '<tr><td colspan="7" class="empty">아직 쿠폰이 없어요</td></tr>'
    return f'''<h2 id="coupons">쿠폰</h2>{f'<p class="msg">{e(msg)}</p>' if msg else ''}
<form method="post" action="/coupon" class="cf"><input name="code" placeholder="코드 (예: ARCA1118)" required><input name="units" type="number" min="1" placeholder="토큰" required>
<input name="days" type="number" min="1" value="7" title="받은 뒤 유효기간(일)"><input name="max" type="number" min="1" placeholder="선착순 인원(비우면 무제한)">
<input name="until" type="date" title="이 날까지 받을 수 있음(비우면 마감 없음)"><input name="note" placeholder="메모 (예: 아카 공식 이벤트)"><button>만들기</button></form>
<table><tr><th>코드</th><th>토큰</th><th>유효</th><th>받은 사람</th><th>그중 5턴 대화</th><th>쓴 토큰</th><th>마감</th></tr>{trs}</table>'''


def page(mins: int, msg: str = '') -> str:
    e = html.escape
    try:
        d = query(mins)
    except Exception as err:   # noqa: BLE001 — 화면에 그대로 보여 준다
        return f'<meta charset="utf-8"><meta http-equiv="refresh" content="10"><pre style="color:#f88">{e(str(err))}</pre>'
    now = datetime.fromisoformat(d['now'])
    card = lambda label, n, sub='': f'<div class="card"><b>{n}</b><span>{label}</span><small>{sub}</small></div>'
    people = ''.join(
        f"<tr><td>{e(p['user'])}{' 🆕' if (now - datetime.fromisoformat(p['joined'])).days < 1 else ''}</td>"
        f"<td>{e(WHAT.get(p['what'], p['what']))}</td><td>{e(p['target'] or '')}</td>"
        f"<td>{'' if p['turns'] is None else p['turns']}</td><td>{'🔞' if p['unveil'] else ''}{' ✅' if p['adult'] else ''}</td><td>{ago(p['at'], now)}</td></tr>"
        for p in d['people']) or '<tr><td colspan="6" class="empty">지금 활동 중인 사람이 없어요</td></tr>'
    feed = ''.join(
        f"<li><time>{datetime.fromisoformat(f['at']).astimezone(KST):%H:%M:%S}</time> <b>{e(f['user'])}</b> · {e(WHAT.get(f['what'], f['what']))}"
        f"{' → ' + e(f['target']) if f['target'] else ''}</li>" for f in d['feed']) or '<li class="empty">오늘 기록이 없어요</li>'
    tabs = ' '.join(f'<a class="{"on" if m == mins else ""}" href="?m={m}">{m}분</a>' for m in (5, 30, 60, 1440))
    return f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>미로 실시간</title>
<style>body{{margin:0;background:#0f1012;color:#e8e8ea;font:14px -apple-system,"Apple SD Gothic Neo",sans-serif;padding:20px;max-width:1100px;margin:auto}}
h1{{font-size:20px;margin:0 0 4px}}.sub{{color:#888;font-size:12px;margin-bottom:16px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:22px}}
.card{{background:#1a1c20;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:2px}}.card b{{font-size:28px}}.card span{{color:#bbb}}.card small{{color:#666;font-size:11px}}
.card:first-child b{{color:#5ee08a}}h2{{font-size:15px;margin:18px 0 8px;display:flex;gap:10px;align-items:center}}
h2 a{{font-size:12px;color:#888;text-decoration:none;padding:2px 8px;border-radius:6px;background:#1a1c20}}h2 a.on{{color:#0f1012;background:#e2621b}}
table{{width:100%;border-collapse:collapse}}td,th{{padding:8px 6px;border-bottom:1px solid #222;text-align:left}}th{{color:#888;font-weight:500;font-size:12px}}
ul{{list-style:none;padding:0;margin:0}}li{{padding:6px 0;border-bottom:1px solid #1d1f23}}time{{color:#777;font-variant-numeric:tabular-nums;margin-right:6px}}.empty{{color:#666}}.msg{{color:#5ee08a}}
.cf{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}}.cf input,.cf button{{background:#1a1c20;color:#e8e8ea;border:1px solid #2a2c31;border-radius:8px;padding:8px 10px;font:inherit}}
.cf button{{background:#e2621b;border:0;color:#0f1012;font-weight:700;cursor:pointer}}small{{color:#888}}</style>
<h1>미로 실시간</h1><div class="sub">{now.astimezone(KST):%Y-%m-%d %H:%M:%S} 기준 · 10초마다 새로 고침 · 운영자 계정 제외 · 둘러보기만 한 사람은 홈 방문으로만 잡힘</div>
<div class="cards">{card('지금 활동 (5분)', d['active5'])}{card('최근 30분 활동', d['active30'])}{card('오늘 활동한 사람', d['activeToday'])}
{card('지금 홈 방문 (5분)', d['visitors5'], '로그인 안 한 사람 포함')}{card('오늘 홈 방문', d['visitorsToday'])}{card('오늘 가입', d['signupsToday'])}{card('오늘 보낸 대화·문자', d['turnsToday'])}</div>
<h2>지금 무엇을 하고 있나 {tabs}</h2>
<table><tr><th>사람</th><th>마지막 행동</th><th>대상</th><th>턴</th><th>언베일·인증</th><th>언제</th></tr>{people}</table>
<h2>최근 기록</h2><ul>{feed}</ul>{coupon_section(msg)}</html>'''


class H(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def do_GET(self):
        if urlparse(self.path).path != '/':
            return self.send_error(404)
        try:
            mins = max(1, min(1440, int(parse_qs(urlparse(self.path).query).get('m', ['5'])[0])))
        except ValueError:
            mins = 5
        body = page(mins, parse_qs(urlparse(self.path).query).get('msg', [''])[0]).encode()
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if self.path != '/coupon':
            return self.send_error(404)
        n = int(self.headers.get('Content-Length') or 0)
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(n).decode()).items()}
        from urllib.parse import quote
        self.send_response(303); self.send_header('Location', '/?m=1440&msg=' + quote(create_coupon(form)) + '#coupons'); self.end_headers()


if __name__ == '__main__':
    print(f'http://localhost:{a.port}')
    ThreadingHTTPServer(('127.0.0.1', a.port), H).serve_forever()
