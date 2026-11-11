/**
 * 약관·처리방침 개정 대장(2026-10-05). 약관 제3조 ③·처리방침 16항이 약속한 고지 기간을 코드가 지키게 한다 —
 * 바뀌는 내용과 적용일을 적용일 7일 전(불리하거나 중요한 변경은 30일 전)부터 서비스 안에 알린다(전자상거래법 표준약관·약관규제법 제3조).
 *
 * 개정 절차: ① 여기에 항목을 추가(공지일 = 오늘, 시행일 = 공지일 + 고지 기간 이상) ② 본문은 `revisionEffective()` 로 시행일부터 바뀌게 쓴다
 * ③ /terms/revisions(바닥글 '약관 개정 안내'·약관 화면의 '바뀌는 내용 보기')가 자동으로 보여 준다 — 11/12 사용자 결정: 홈 토스트·'나' 화면 띠는 없앰(유저가 헷갈려 함), 눌렀을 때만 본다 ④ 시행일이 지나면 버전(= 시행일)도 자동으로 올라간다.
 * 날짜는 모두 한국 날짜('YYYY-MM-DD')다.
 */
export type DocKey = 'service' | 'privacy'
export type Revision = {
  doc: DocKey
  /** 바뀌기 전 버전(= 그 버전의 시행일). */
  from: string
  /** 시행일 = 바뀐 뒤 버전. */
  to: string
  /** 서비스 안에 알리기 시작한 날. */
  announcedAt: string
  /** minor: 회원에게 불리하지 않은 단순 변경(7일 전) · major: 불리하거나 중요한 변경(30일 전, 전후 비교와 따로 알림). */
  kind: 'minor' | 'major'
  changes: Array<{ clause: string; before: string; after: string }>
}
export const NOTICE_DAYS: Record<Revision['kind'], number> = { minor: 7, major: 30 }

/**
 * 출시 전(이용자 = 운영자 계정뿐)에는 비워 두고 문서 본문을 바로 고친다(10/5 사용자 결정) — 고지 기간은 기존 이용자를 위한 절차다.
 * 출시 뒤 첫 개정부터 여기에 적는다. 예:
 * { doc: 'service', from: '2026-10-05', to: '2026-11-01', announcedAt: '2026-10-25', kind: 'minor', changes: [{ clause: '제3조 ①', before: '…', after: '…' }] }
 */
export const REVISIONS: Revision[] = [
  // 11/11 창작 보상·응원·출금 조항 추가 — 회원에게 새 혜택을 주는 변경이라 7일 전 공지. 출금 자체는 처리방침 시행일(12/11)부터.
  { doc: 'service', from: '2026-11-08', to: '2026-11-18', announcedAt: '2026-11-11', kind: 'minor', changes: [
    { clause: '제10조의2 (신설)', before: '없음', after: '창작 보상(다른 회원이 쓴 미로의 10%), 응원(70%), 부정 이용 방지(하루 상한 300미로·가입 3일 미만 제외), 충전 미로에서 생긴 몫은 "수익"에 따로 쌓여 지갑으로 옮기거나(단방향) 현금 출금(1미로 5원, 3만 원 이상, 3.3% 원천징수, 2026-12-11부터)' },
    { clause: '제10조 ⑦', before: '제11조의 환불 말고는 현금으로 바꿀 수 없음', after: '제11조의 환불과 제10조의2의 창작 보상 출금 말고는 현금으로 바꿀 수 없음' },
  ] },
  // 11/12 목소리 보상 — 목소리만 올리는 회원도 보상을 받는다. 회원에게 새 혜택을 주는 변경이라 7일 전 공지.
  { doc: 'service', from: '2026-11-18', to: '2026-11-19', announcedAt: '2026-11-12', kind: 'minor', changes: [
    { clause: '제10조의2 ①의2 (신설)', before: '없음', after: '목소리 보상: 다른 회원이 내가 녹음해 공개한 목소리로 답을 들으면 그 대화에 쓴 미로의 3%(여러 목소리면 나눔, 하루 상한 100미로, 운영자 목소리·자기 목소리·게스트·가입 3일 미만 제외). 수익·출금은 창작 보상과 같음' },
  ] },
  // 11/11 창작 보상 출금 — 출금을 신청한 크리에이터에게서만 실명·계좌·주민등록번호를 받는다. 수집 항목이 늘어 처리방침 16항대로 30일 전 공지.
  { doc: 'privacy', from: '2026-11-08', to: '2026-12-11', announcedAt: '2026-11-11', kind: 'major', changes: [
    { clause: '한눈에 보기·2항(처리 항목)', before: '창작 보상 출금 관련 항목 없음', after: '창작 보상 출금을 신청한 경우: 예금주 실명, 은행·계좌번호, 주민등록번호(암호화 저장), 출금 신청·지급 내역' },
    { clause: '1항(처리 목적)', before: '창작 보상 출금 목적 없음', after: '창작 보상 출금: 송금, 「소득세법」에 따른 원천징수와 지급명세서 제출' },
    { clause: '3항(보유 기간)', before: '해당 없음', after: '출금 신청·지급 기록과 실명·계좌·주민등록번호: 지급한 해의 다음 해부터 5년(「국세기본법」 제85조의3), 반려된 신청은 반려 후 1년' },
    { clause: '5항(제3자 제공)', before: '법령에 따른 경우 제외하고 제공하지 않음', after: '같음 — 원천징수 신고·지급명세서 제출 때 국세청·지방자치단체에 법령에 따라 제공함을 명시' },
    { clause: '9항(안전성 확보 조치)', before: '주민등록번호 처리 없음', after: '주민등록번호는 AES-256 으로 암호화해 저장하고 출금 처리 화면에서만 복호화' },
  ] },
]

/** 한국 날짜 'YYYY-MM-DD'. 약관의 날짜 기준은 모두 한국 시간이다. */
export const kstDate = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

/** 날짜 문자열에 일수를 더한다(UTC 자정 기준 — 한국 날짜 문자열끼리의 셈이라 시간대가 끼어들지 않는다). */
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

// 고지 기간을 지키지 않은 항목은 서버가 뜨지 못한다 — 실수로 짧게 공지하는 일이 없게.
for (const r of REVISIONS) {
  if (addDays(r.announcedAt, NOTICE_DAYS[r.kind]) > r.to) throw new Error(`legal revision ${r.doc} ${r.to}: notice shorter than ${NOTICE_DAYS[r.kind]} days`)
  if (r.from >= r.to) throw new Error(`legal revision ${r.doc}: 'to' must be after 'from'`)
}

/** 그 문서의 그 개정(시행일 = to)이 지금 시행 중인가. */
export function revisionEffective(doc: DocKey, to: string, now = new Date()): boolean {
  const r = REVISIONS.find((x) => x.doc === doc && x.to === to)
  return !!r && kstDate(now) >= r.to
}

/** 지금 시행 중인 버전 — 시행일이 지난 개정 중 가장 늦은 것, 없으면 기준 버전. */
export function effectiveVersion(doc: DocKey, base: string, now = new Date()): string {
  const today = kstDate(now)
  return REVISIONS.filter((r) => r.doc === doc && r.to <= today).reduce((v, r) => (r.to > v ? r.to : v), base)
}

/** 공지는 시작됐고 아직 시행 전인 개정. */
export function pendingRevisions(now = new Date(), doc?: DocKey): Revision[] {
  const today = kstDate(now)
  return REVISIONS.filter((r) => (!doc || r.doc === doc) && r.announcedAt <= today && r.to > today)
}

/** 서비스 안에 띄울 개정 — 공지 시작부터 시행 뒤 30일까지(바뀐 사실도 한동안 보인다). */
export function noticedRevisions(now = new Date()): Revision[] {
  const today = kstDate(now)
  return REVISIONS.filter((r) => r.announcedAt <= today && today <= addDays(r.to, 30))
}
