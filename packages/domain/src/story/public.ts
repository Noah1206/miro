import { endingFor } from './engine'
import type { StoryAudience, StoryDefinition, StoryState } from './types'

/** 화면·공개 API 로 나가는 것은 이것뿐이다. 제작자 진실·지시문·사건 조건·엔딩 조건·연락 규칙은 빠진다. */
export type StoryPublic = {
  slug: string
  audience: StoryAudience
  title: string
  tagline: string
  intro: string
  genres: string[]
  tags: string[]
  protagonist: { gender: 'female' | 'male'; minAge: number; defaultName: string; role: string; fields: string[] }
  notice: string
  opening: string
  characters: { key: string; name: string; age: number; look: string; persona: string; relation: string; image: string | null }[]
  chapterCount: number
  medium: string
}

export function toPublic(def: StoryDefinition): StoryPublic {
  return {
    slug: def.slug, audience: def.audience, title: def.title, tagline: def.tagline, intro: def.intro, genres: def.genres, tags: def.tags,
    protagonist: def.protagonist, notice: def.notice, opening: def.opening, chapterCount: def.events.length, medium: def.contactPolicy.medium,
    characters: def.characters.map(c => ({ key: c.key, name: c.name, age: c.age, look: c.look, persona: c.publicPersona, relation: c.startingRelation, image: c.image ?? null })),
  }
}

/** 플레이어 진행 화면: 끝낸 사건 제목, 플레이어가 실제로 알게 된 단서, 인물별 관계(수치 대신 말). 아직 안 연 사건·엔딩 조건은 없다. */
export type StoryProgress = {
  completed: { id: string; title: string }[]
  chapter: number
  ended: boolean
  ending: string | null
  clues: string[]
  relations: { key: string; name: string; contact: string; outcome: string | null }[]
  promises: { who: string; text: string }[]
}

export function progressOf(def: StoryDefinition, s: StoryState): StoryProgress {
  const name = (k: string) => def.characters.find(c => c.key === k)?.name ?? k
  return {
    completed: s.completed.map(id => ({ id, title: def.events.find(e => e.id === id)?.title ?? id })),
    chapter: Math.min(def.events.length, s.completed.length + (s.current === 'ended' ? 0 : 1)),
    ended: s.current === 'ended',
    ending: s.current === 'ended' ? endingFor(def, s)?.title ?? null : null,
    clues: (s.known.player ?? []).map(f => def.facts[f]).filter((x): x is string => !!x),
    relations: def.characters.map(c => ({ key: c.key, name: c.name, contact: s.rel[c.key]!.contact, outcome: s.rel[c.key]!.outcome })),
    promises: s.promises.map(p => ({ who: name(p.who), text: p.fact })),
  }
}
