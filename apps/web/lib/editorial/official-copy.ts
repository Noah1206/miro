import { createHash } from 'node:crypto'
import copy from './official-copy.json'
import entryCopy from './official-entry.json'
import type { CharacterEntry } from '@/lib/character-entry'
import type { DialogueEntry } from '@/lib/intro-dialogue'

type Profile = { id: string; slug: string | null; personality: string }
type Edition = { startingContext?: string; sourceStartingContextHash?: string; id: string; tagline: string; sourceTaglineHash: string; description: string; intro: string[]; scenes: Record<string, string[]>; defaultScene: string; samples: Array<{ role: string; text: string }>; sourceSampleHash: string; sourceDescriptionHash: string; sourceIntroHashes: Record<string, string> }
const editions: Record<string, Edition> = copy
const entriesBySlug: Record<string, { world: string; scenes: Record<string, Omit<CharacterEntry, 'world'>> }> = entryCopy
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const edition = (profile: { id: string; slug: string | null }) => {
  const item = profile.slug ? editions[profile.slug] : undefined
  return item?.id === profile.id ? item : undefined
}
/** Only an untouched authored scene receives its matching public briefing. */
export function officialEntry(profile: { id: string; slug: string | null }, entries: readonly DialogueEntry[], selected?: string | null): CharacterEntry | null {
  const item = edition(profile)
  if (!item || !profile.slug) return null
  const scene = selected != null && Object.hasOwn(item.sourceIntroHashes, selected) ? selected : item.defaultScene
  const source = entries.filter(e => e.purpose === 'intro' && (e.scene ?? '') === scene)
  if (hash(JSON.stringify(source.map(e => e.text))) !== item.sourceIntroHashes[scene]) return null
  return entryFor(profile.slug, scene)
}
function entryFor(slug: string | null, scene: string): CharacterEntry | null {
  const entry = slug ? entriesBySlug[slug] : undefined
  const situation = entry?.scenes[scene]
  return entry && situation ? { world: entry.world, ...situation } : null
}
const contextFor = (entry: CharacterEntry, opening: string) => [entry.role, entry.before, opening].join('\n\n')

/** Curated public copy is independent of private simulation facts. Owner edits take precedence. */
export function officialDescription(profile: Profile): string | null {
  const item = edition(profile)
  return item && hash(profile.personality) === item.sourceDescriptionHash ? item.description : null
}
/** Shared by the detail preview and NEW sessions. Existing messages are never rewritten. */
export function officialIntro(profile: { id: string; slug: string | null }, entries: readonly DialogueEntry[]): DialogueEntry[] {
  const item = edition(profile)
  if (!item) return [...entries]
  const result: DialogueEntry[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (entry.purpose !== 'intro') { result.push(entry); continue }
    const scene = entry.scene ?? ''
    const original = entries.filter(e => e.purpose === 'intro' && (e.scene ?? '') === scene)
    const replacement = scene === item.defaultScene ? item.intro : item.scenes[scene]
    if (!replacement || hash(JSON.stringify(original.map(e => e.text))) !== item.sourceIntroHashes[scene]) {
      result.push(entry); continue
    }
    if (seen.has(scene)) continue
    seen.add(scene)
    const briefing = entryFor(profile.slug, scene)
    const metadata = {
      ...(entry.scene !== undefined ? { scene: entry.scene } : {}),
      ...(entry.image ? { image: entry.image } : {}),
      // The selected scene context also reaches the model, not only its preview.
      context: briefing ? contextFor(briefing, replacement[0]!) : replacement[0],
      ...(entry.time ? { time: entry.time } : {}),
      ...(entry.location ? { location: entry.location } : {}),
    }
    if (briefing) result.push(
      { ...metadata, role: 'narrator', text: [briefing.role, briefing.before].join('\n\n'), purpose: 'intro' },
      { role: 'narrator', text: briefing.world, purpose: 'intro', ...(entry.scene !== undefined ? { scene: entry.scene } : {}) },
    )
    result.push(...replacement.map((text, index): DialogueEntry => ({
      role: index % 2 === 0 ? 'narrator' : 'character', text, purpose: 'intro',
      ...(entry.scene !== undefined ? { scene: entry.scene } : {}),
      ...(index === 0 && !briefing ? metadata : {}),
    })))
  }
  return result
}

/** Public examples and model voice examples use the same edition; later author edits win. */
export function officialSamples(profile: { id: string; slug: string | null }, entries: readonly DialogueEntry[]): DialogueEntry[] {
  const item = edition(profile)
  const samples = entries.filter(e => e.purpose !== 'intro')
  if (!item || hash(JSON.stringify(samples.map(e => e.text))) !== item.sourceSampleHash) return samples
  return item.samples.map(e => ({ role: e.role as DialogueEntry['role'], text: e.text }))
}

export function officialTagline(profile: { id: string; slug: string | null; tagline: string | null }): string | null {
  const item = edition(profile)
  return item && hash(profile.tagline ?? '') === item.sourceTaglineHash ? item.tagline : null
}

/** A scene begins where the user is now; later author changes stay authoritative. */
export function officialStartingContext(profile: { id: string; slug: string | null; startingContext?: string | null }): string | null {
  const item = edition(profile)
  if (!item?.startingContext || hash(profile.startingContext ?? '') !== item.sourceStartingContextHash) return profile.startingContext ?? null
  const entry = entryFor(profile.slug, item.defaultScene)
  return entry ? contextFor(entry, item.startingContext) : item.startingContext
}
