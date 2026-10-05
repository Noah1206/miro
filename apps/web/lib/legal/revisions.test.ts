import { describe, it, expect } from 'vitest'
import { REVISIONS, addDays, effectiveVersion, kstDate, noticedRevisions, pendingRevisions, revisionEffective } from './revisions'
import { businessInfo } from './operator'

/** 개정 대장이 약속한 고지 기간과 '시행일부터 바뀐다'는 규칙을 지키는지 — 날짜를 넘겨 전·후를 본다. */
describe('legal revisions', () => {
  const r = REVISIONS.find((x) => x.doc === 'service' && x.to === '2026-10-13')!
  const before = new Date('2026-10-12T14:59:00Z') // 한국 10/12 23:59
  const after = new Date('2026-10-12T15:00:00Z') // 한국 10/13 00:00

  it('한국 날짜로 센다', () => {
    expect(kstDate(before)).toBe('2026-10-12')
    expect(kstDate(after)).toBe('2026-10-13')
    expect(addDays('2026-10-05', 7)).toBe('2026-10-12')
  })

  it('공지일 + 고지 기간 ≤ 시행일', () => {
    expect(addDays(r.announcedAt, 7) <= r.to).toBe(true)
  })

  it('시행일 전에는 예정, 시행일부터 시행', () => {
    expect(revisionEffective('service', r.to, before)).toBe(false)
    expect(revisionEffective('service', r.to, after)).toBe(true)
    expect(effectiveVersion('service', '2026-10-03', before)).toBe('2026-10-03')
    expect(effectiveVersion('service', '2026-10-03', after)).toBe('2026-10-13')
    expect(pendingRevisions(before, 'service')).toHaveLength(1)
    expect(pendingRevisions(after, 'service')).toHaveLength(0)
  })

  it('안내 띠는 공지 시작부터 시행 뒤 30일까지', () => {
    expect(noticedRevisions(new Date('2026-10-04T00:00:00Z'))).toHaveLength(0)
    expect(noticedRevisions(before)).toHaveLength(1)
    expect(noticedRevisions(new Date('2026-11-12T00:00:00Z'))).toHaveLength(1)
    expect(noticedRevisions(new Date('2026-11-13T00:00:00Z'))).toHaveLength(0)
  })

  it('약관 제3조 ① 본문은 시행일 전엔 10/3 그대로, 시행 뒤 호스팅 제공자가 붙는다', () => {
    expect(businessInfo(before)).toBe('대표자 조현웅 · 주소 경상남도 양산시 금오16길 122 · 사업자등록번호 508-14-52353')
    expect(businessInfo(after)).toContain('전화 010-4090-5045 · 통신판매업 신고 면제(간이과세자) · 호스팅 서비스 제공 Vercel Inc.(웹 서비스), Supabase, Inc.(데이터베이스·사진 저장)')
  })
})
