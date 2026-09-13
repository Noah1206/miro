import { BUILD_PRESETS, type CharacterVisualIdentity } from '../character/types'

export type MediaKind = 'photo' | 'background' | 'live_scene' | 'face_cast'

export type PhotoContext = {
  location: string
  time: string
  mood: string
  outfit: string
  /** Visual Identity 판. 외형이 바뀌면 캐시도 갈라져야 한다. */
  visualVersion: number
}

/**
 * 미디어 캐시 키.
 *
 * 같은 상황 + 같은 외형이면 같은 키 → 기존 asset 재사용 → Usage 미소비.
 * Visual Identity 버전을 포함하므로 외형을 바꾸면 새로 생성된다.
 */
export function buildMediaKey(kind: MediaKind, ctx: PhotoContext): string {
  return [
    kind,
    `v${ctx.visualVersion}`,
    ctx.location, ctx.time, ctx.mood, ctx.outfit,
  ]
    .map((s) => String(s).trim().toLowerCase().replace(/\s+/g, '_'))
    .join('|')
}

/**
 * Visual Identity 기반 프롬프트.
 *
 * Profile / AI Photo / Dynamic Background / Live Scene / Video Call 이 모두
 * 이 함수를 거친다 — 기능마다 다른 외형이 나오지 않게 하는 단일 지점이다.
 */
export function buildVisualPrompt(opts: {
  identity: CharacterVisualIdentity
  characterName: string
  context: PhotoContext
  kind: MediaKind
}): string {
  const { identity: v, context: c, kind } = opts
  const parts: string[] = []

  if (kind === 'background') {
    // 배경에는 인물을 넣지 않는다 — 채팅 배경으로 쓰이기 때문이다.
    parts.push(`${c.location}, ${c.time}, ${c.mood} mood, no people, environment only`)
    return parts.join(', ')
  }

  parts.push(describe(v.baseFace, 'face'))
  parts.push(body(v.bodyProfile))
  parts.push(describe(v.hair, 'hair'))
  if (v.styleTags.length > 0) parts.push(v.styleTags.join(', '))
  if (v.expressionTendency) parts.push(`typical expression: ${v.expressionTendency}`)
  parts.push(describe(v.outfitProfile, 'outfit'))

  parts.push(`at ${c.location}`, c.time, `${c.mood} mood`)
  if (c.outfit) parts.push(c.outfit)

  return parts.filter(Boolean).join(', ')
}

/** 체형은 열거값 → 정해진 묘사로. 키/값을 그대로 늘어놓지 않는다. */
function body(profile: CharacterVisualIdentity['bodyProfile']): string {
  const preset = profile.build ? BUILD_PRESETS[profile.build]?.prompt : null
  return [preset, profile.height, profile.detail].filter(Boolean).join(', ')
}

function describe(profile: Record<string, unknown>, label: string): string {
  const entries = Object.entries(profile)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${k} ${String(v)}`)
  return entries.length > 0 ? `${label}: ${entries.join(' ')}` : ''
}
