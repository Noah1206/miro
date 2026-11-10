import { describe, expect, it } from 'vitest'
import { CHARACTER_EDITORIAL, characterEditorial } from '../character-editorial'
import { SEEDS } from '../../../scripts/bl-characters.data.mjs'
import { SEEDS_2 } from '../../../scripts/bl-characters-2.data.mjs'

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722
}
describe('character editorial presentation', () => {
  it('gives all 14 official characters distinct palettes and highlights public story phrases', () => {
    const seeds = [...SEEDS, ...SEEDS_2]
    expect(new Set(seeds.map(s => JSON.stringify(CHARACTER_EDITORIAL[s.slug]!.palette))).size).toBe(14)
    for (const seed of seeds) {
      const theme = characterEditorial({ slug: seed.slug, name: seed.name })
      const copy = [seed.personality, seed.world.worldSetting, seed.startingContext].join('\n')
      expect(theme.motifs.some(word => copy.includes(word)), seed.slug).toBe(true)
      for (const color of Object.values(theme.palette)) {
        for (const bg of ['#111015', '#211E29', '#2C2737']) {
          expect((luminance(color) + .05) / (luminance(bg) + .05), `${seed.slug}: ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
  it('handles custom slugs and empty genres without borrowing another character’s story phrases', () => {
    for (const slug of [undefined, 'custom', '__proto__', 'constructor']) {
      const result = characterEditorial({ slug, name: '새 캐릭터', occupation: '도서관 사서' })
      expect(result.motifs).toEqual(['도서관 사서'])
      expect(result.palette.character).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(characterEditorial({ name: '새 캐릭터', occupation: 'x'.repeat(25) }).motifs).toEqual([])
  })
})
