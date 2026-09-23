import { describe, expect, it } from 'vitest'
import { parseSearchRestore, searchRestoreKey } from './restore'

describe('search return metadata', () => {
  const now = 1_000_000
  const key = searchRestoreKey('owner-a', '강태준', null, ['느와르', '드라마'])
  const saved = { key, pages: 3, scrollY: 840, savedAt: now - 1_000 }

  it('stores only bounded restoration metadata for one viewer and query', () => {
    expect(parseSearchRestore(JSON.stringify(saved), now)).toEqual(saved)
    expect(searchRestoreKey('owner-b', '강태준', null, ['느와르', '드라마'])).not.toBe(key)
    expect(searchRestoreKey('owner-a', '다른 이름', null, ['느와르', '드라마'])).not.toBe(key)
    expect(searchRestoreKey('owner-a', '강태준', '느와르', ['느와르', '드라마'])).not.toBe(key)
    expect(searchRestoreKey('owner-a', '강태준', null, ['로맨스'])).not.toBe(key)
    expect(searchRestoreKey('owner-a', '강태준', null, ['드라마', '느와르'])).toBe(key)
  })

  it('rejects stale and unbounded records', () => {
    expect(parseSearchRestore(JSON.stringify({ ...saved, savedAt: now - 5 * 60_000 - 1 }), now)).toBeNull()
    expect(parseSearchRestore(JSON.stringify({ ...saved, pages: 101 }), now)).toBeNull()
    expect(parseSearchRestore(JSON.stringify({ ...saved, scrollY: -1 }), now)).toBeNull()
    expect(parseSearchRestore(JSON.stringify({ ...saved, savedAt: now + 1 }), now)).toBeNull()
    expect(parseSearchRestore('{', now)).toBeNull()
  })
})
