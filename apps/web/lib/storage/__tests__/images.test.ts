import { beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ storage: { from: () => storage } }) }))
import { resolveCharacterImages } from '../images'

describe('character photo persistence', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key')
    storage.upload.mockReset().mockResolvedValue({ error: null })
    storage.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://example.supabase.co/${path}` } }))
  })
  it('puts a newly selected cover before retained photos', async () => {
    const form = new FormData()
    form.append('images', new File(['photo'], 'cover.png', { type: 'image/png' }))
    form.append('keptImages', 'https://example.supabase.co/old.png')
    form.append('imageOrder', 'new')
    form.append('imageOrder', 'existing')
    const urls = await resolveCharacterImages(form, 'owner')
    expect(urls).toHaveLength(2)
    expect(urls[0]).toMatch(/^https:\/\/example.supabase.co\/owner\/.+\.png$/)
    expect(urls[1]).toBe('https://example.supabase.co/old.png')
  })
  it('preserves existing photos when no new files are selected', async () => {
    const form = new FormData()
    form.append('keptImages', 'https://example.supabase.co/old.png')
    form.append('imageOrder', 'existing')
    expect(await resolveCharacterImages(form, 'owner')).toEqual(['https://example.supabase.co/old.png'])
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('fails saving if upload fails instead of returning an empty photo list', async () => {
    storage.upload.mockResolvedValue({ error: { message: 'upload failed' } })
    const form = new FormData()
    form.append('images', new File(['photo'], 'cover.png', { type: 'image/png' }))
    await expect(resolveCharacterImages(form, 'owner')).rejects.toThrow('IMAGE_UPLOAD_FAILED')
  })
})
