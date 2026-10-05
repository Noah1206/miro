/**
 * 약관·처리방침 개정 대장(2026-10-05). 약관 제3조 ③·처리방침 16항이 약속한 고지 기간을 코드가 지키게 한다 —
 * 바뀌는 내용과 적용일을 적용일 7일 전(불리하거나 중요한 변경은 30일 전)부터 서비스 안에 알린다(전자상거래법 표준약관·약관규제법 제3조).
 *
 * 개정 절차: ① 여기에 항목을 추가(공지일 = 오늘, 시행일 = 공지일 + 고지 기간 이상) ② 본문은 `revisionEffective()` 로 시행일부터 바뀌게 쓴다
 * ③ 홈·'나' 화면의 LegalRevisionNotice 와 /terms/revisions 가 자동으로 알린다 ④ 시행일이 지나면 버전(= 시행일)도 자동으로 올라간다.
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
export const REVISIONS: Revision[] = []

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
