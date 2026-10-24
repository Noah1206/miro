import { describe, expect, it } from 'vitest'
import { embeddedBrowser, installPlatform, standaloneDisplay } from '../pwa'

describe('PWA device guidance', () => {
  it('recognizes iPad desktop user agents as iOS when touch is available', () => {
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe('ios')
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0)).toBe('desktop')
    expect(installPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS)')).toBe('ios')
    expect(installPlatform('Mozilla/5.0 (Linux; Android 15)')).toBe('android')
  })
  it('distinguishes embedded browsers that need an external browser first', () => {
    expect(embeddedBrowser('iPhone KAKAOTALK 26')).toBe(true)
    expect(embeddedBrowser('Android Instagram 300')).toBe(true)
    expect(embeddedBrowser('iPhone Version/26 Mobile Safari/605')).toBe(false)
  })
  it('recognizes installed display modes and the iOS standalone flag', () => {
    const target = (mode: string, ios = false) => ({ matchMedia: (query: string) => ({ matches: query === `(display-mode: ${mode})` }), navigator: { standalone: ios } }) as unknown as Window
    expect(standaloneDisplay(target('standalone'))).toBe(true)
    expect(standaloneDisplay(target('fullscreen'))).toBe(true)
    expect(standaloneDisplay(target('browser', true))).toBe(true)
    expect(standaloneDisplay(target('browser'))).toBe(false)
  })
})
