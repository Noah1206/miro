import { createHash } from 'node:crypto'
import copy from './official-copy.json'
import type { DialogueEntry } from '@/lib/intro-dialogue'

type Profile = { id: string; slug: string | null; personality: string }
type Edition = { startingContext?: string; sourceStartingContextHash?: string; id: string; tagline: string; sourceTaglineHash: string; description: string; intro: string[]; scenes: Record<string, string[]>; defaultScene: string; samples: Array<{ role: string; text: string }>; sourceSampleHash: string; sourceDescriptionHash: string; sourceIntroHashes: Record<string, string> }
const editions: Record<string, Edition> = copy
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const edition = (profile: { id: string; slug: string | null }) => {
  const item = profile.slug ? editions[profile.slug] : undefined
  return item?.id === profile.id ? item : undefined
}
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
    result.push(...replacement.map((text, index): DialogueEntry => ({
      role: index % 2 === 0 ? 'narrator' : 'character', text, purpose: 'intro',
      ...(entry.scene !== undefined ? { scene: entry.scene } : {}),
      ...(index === 0 ? {
        ...(entry.image ? { image: entry.image } : {}),
        ...(entry.context ? { context: replacement[0] } : {}),
        ...(entry.time ? { time: entry.time } : {}),
        ...(entry.location ? { location: entry.location } : {}),
      } : {}),
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
  return item?.startingContext && hash(profile.startingContext ?? '') === item.sourceStartingContextHash ? item.startingContext : profile.startingContext ?? null
}
