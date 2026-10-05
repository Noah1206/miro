import { describe, it, expect } from 'vitest'
import { NOTICE_DAYS, REVISIONS, addDays, effectiveVersion, kstDate, noticedRevisions, pendingRevisions, revisionEffective } from './revisions'
import { businessInfo } from './operator'

/** 개정 대장의 날짜 셈과 '시행일부터 바뀐다'는 규칙. 출시 전엔 대장이 비어 있어 모든 문서가 기준 버전이다. */
describe('legal revisions', () => {
  it('한국 날짜로 센다', () => {
    expect(kstDate(new Date('2026-10-12T14:59:00Z'))).toBe('2026-10-12') // 한국 10/12 23:59
    expect(kstDate(new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-13') // 한국 10/13 00:00
    expect(addDays('2026-10-05', NOTICE_DAYS.minor)).toBe('2026-10-12')
    expect(addDays('2026-10-05', NOTICE_DAYS.major)).toBe('2026-11-04')
  })

  it('대장에 적힌 개정마다 공지일 + 고지 기간 ≤ 시행일', () => {
    for (const r of REVISIONS) expect(addDays(r.announcedAt, NOTICE_DAYS[r.kind]) <= r.to).toBe(true)
  })

  it('대장이 비어 있으면 아무것도 예정·시행되지 않고 버전은 기준 그대로', () => {
    if (REVISIONS.length) return
    const now = new Date()
    expect(revisionEffective('service', '2099-01-01', now)).toBe(false)
    expect(effectiveVersion('service', '2026-10-05', now)).toBe('2026-10-05')
    expect(pendingRevisions(now)).toEqual([])
    expect(noticedRevisions(now)).toEqual([])
  })

  it('약관 제3조 ① 본문에 전자상거래법 제10조 항목이 다 있다', () => {
    const line = businessInfo()
    for (const part of ['대표자 조현웅', '주소 경상남도 양산시 금오16길 122', '사업자등록번호 508-14-52353', '전화 010-4090-5045', '통신판매업 신고 면제(간이과세자)', '호스팅 서비스 제공 Vercel Inc.(웹 서비스), Supabase, Inc.(데이터베이스·사진 저장)']) {
      expect(line).toContain(part)
    }
  })
})
