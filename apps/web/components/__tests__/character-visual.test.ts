import { describe, expect, it } from 'vitest'
import { characterImageSources } from '../character-visual'

const original = 'https://example.supabase.co/storage/v1/object/public/character-images/owner/photo.jpg?version=2'

describe('character image delivery', () => {
  it('offers thumbnail widths while keeping the original URL out of the candidate set', () => {
    const sources = characterImageSources(original, 'thumbnail')
    expect(sources.src).toBe('https://example.supabase.co/storage/v1/render/image/public/character-images/owner/photo.jpg?version=2&quality=80&resize=contain&width=320')
    expect(sources.srcSet).toContain(`${sources.src} 320w`)
    expect(sources.srcSet).toContain('quality=80&resize=contain&width=640 640w')
  })

  it('offers larger detail widths', () => {
    const sources = characterImageSources(original, 'detail')
    expect(sources.src).toContain('resize=contain')
    expect(sources.srcSet).toContain('width=720 720w')
    expect(sources.srcSet).toContain('width=1080 1080w')
  })

  it('offers small avatar widths for inline portraits', () => {
    const sources = characterImageSources(original, 'avatar')
    expect(sources.src).toContain('resize=contain')
    expect(sources.srcSet).toContain('width=96 96w')
    expect(sources.srcSet).toContain('width=192 192w')
  })

  it('leaves other URLs and non-public paths unchanged', () => {
    for (const src of [
      '/builds/female-1.webp',
      'https://example.com/photo.jpg',
      'https://example.com/storage/v1/object/public/character-images/owner/photo.jpg',
      'https://example.supabase.co/storage/v1/object/sign/character-images/owner/photo.jpg',
      'https://example.supabase.co/storage/v1/object/public/another-bucket/photo.jpg',
    ]) {
      expect(characterImageSources(src, 'thumbnail')).toEqual({ src })
    }
  })
})
