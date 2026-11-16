import { describe, expect, it } from 'vitest'
import { characterImageSources } from '../character-visual'

const original = 'https://example.supabase.co/storage/v1/object/public/character-images/owner/photo.jpg?version=2'

describe('character image delivery', () => {
  it('offers thumbnail widths while keeping the original URL out of the candidate set', () => {
    const sources = characterImageSources(original, 'thumbnail')
    expect(sources.src).toBe('/_next/image?url=%2Fmedia%2Fcharacter-images%2Fowner%2Fphoto.jpg&w=320&q=80')
    expect(sources.srcSet).toContain(`${sources.src} 320w`)
    expect(sources.srcSet).toContain('&w=640&q=80 640w')
  })

  it('offers larger detail widths', () => {
    const sources = characterImageSources(original, 'detail')
    expect(sources.srcSet).toContain('&w=720&q=80 720w')
    expect(sources.srcSet).toContain('&w=1080&q=80 1080w')
  })

  it('offers small avatar widths for inline portraits', () => {
    const sources = characterImageSources(original, 'avatar')
    expect(sources.srcSet).toContain('&w=96&q=80 96w')
    expect(sources.srcSet).toContain('&w=192&q=80 192w')
    expect(characterImageSources('/media/character-images/owner/photo.jpg?v=1', 'avatar').src).toBe('/_next/image?url=%2Fmedia%2Fcharacter-images%2Fowner%2Fphoto.jpg&w=96&q=80')
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
