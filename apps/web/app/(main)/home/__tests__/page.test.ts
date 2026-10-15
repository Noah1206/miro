import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from '../page'
import { homeUnveilEnabled } from '@/lib/home-mode'

vi.mock('@/lib/auth', () => ({ currentUser: async () => ({ id: 'home-viewer' }) }))
vi.mock('@/lib/home', () => ({ homeCatalog: async () => ({ items: [], nextCursor: null }) }))
vi.mock('@/lib/home-mode', () => ({ homeUnveilEnabled: vi.fn() }))
vi.mock('@/lib/ops/archive', () => ({ unreadContactCount: async () => 0 }))
vi.mock('@/lib/observe', () => ({ measured: (_: string, task: () => unknown) => task() }))
vi.mock('@/lib/i18n/server', () => ({ getT: async () => (key: string) => key }))
vi.mock('@/components/ui', () => ({
  Page: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
  LogoMark: () => null,
  TransitionLink: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement('a', { href }, children),
}))
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }))
vi.mock('@/components/legal-revision-notice', () => ({ LegalRevisionNotice: () => null }))
vi.mock('../feed', () => ({ HomeFeed: () => null }))
vi.mock('../banner', () => ({ HomeBanner: () => null }))
vi.mock('../bell', () => ({ NotificationBell: () => null }))
vi.mock('../unveil-toggle', () => ({ HomeUnveilToggle: ({ enabled }: { enabled: boolean }) => React.createElement('button', { role: 'switch', 'aria-checked': enabled }) }))
vi.mock('../../stories/home-row', () => ({ OriginalStoriesRow: () => React.createElement('section', { 'aria-label': '미로 오리지널' }, React.createElement('a', { href: '/stories/published-story' }, '공개 작품')) }))

afterEach(() => vi.unstubAllGlobals())
describe('home published stories', () => {
  it.each([false, true])('keeps published works visible when Unveil is %s', async enabled => {
    vi.stubGlobal('React', React)
    vi.mocked(homeUnveilEnabled).mockResolvedValue(enabled)
    const html = renderToStaticMarkup(await Home())
    expect(html).toContain('aria-label="미로 오리지널"')
    expect(html).toContain('href="/stories/published-story"')
    expect(html).toContain(`aria-checked="${enabled}"`)
  })
})
