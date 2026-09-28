import { describe, expect, it } from 'vitest'
import { dateLabel, preview } from '../archive-format'

describe('archive list text', () => {
  it('labels dates in Korea time regardless of the machine zone', () => {
    const now = new Date('2026-09-27T09:00:00Z')            // 한국 27일 18:00
    expect(dateLabel('2026-09-27T08:46:00Z', now)).toBe('오후 5:46')
    // UTC 로는 아직 26일이지만 한국은 27일 01:30 — 서버(UTC)가 '어제' 를 그리면 브라우저와 어긋난다.
    expect(dateLabel('2026-09-26T16:30:00Z', now)).toBe('오전 1:30')
    expect(dateLabel('2026-09-26T15:00:00Z', now)).toBe('오전 12:00')
    expect(dateLabel('2026-09-27T03:00:00Z', now)).toBe('오후 12:00')
    expect(dateLabel('2026-09-25T20:00:00Z', now)).toBe('어제')  // 한국 26일 05:00
    expect(dateLabel('2026-09-20T03:00:00Z', now)).toBe('9.20')
  })

  it('drops the speaker prefix the stored text carries', () => {
    expect(preview('강태준: 네, 가능합니다.\n강태준: 근처면 그냥 올라오시죠.', '강태준')).toBe('네, 가능합니다. 근처면 그냥 올라오시죠.')
    expect(preview('물잔을 밀어주던 손을 거둔다.\n강태준: 대표가 협박을 받는데', '강태준')).toBe('물잔을 밀어주던 손을 거둔다. 대표가 협박을 받는데')
    expect(preview('안녕하세요', 'Dr. (X)')).toBe('안녕하세요')
  })
})
