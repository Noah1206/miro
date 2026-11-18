/**
 * 11/19 상황별 BGM — 만든 사람이 곡(우리 서버에 올린 음악 파일)마다 상황을 적어 두면, 대화가 그 상황이 됐을 때 채팅방에서 반복 재생한다.
 * 상황이 빈 곡은 기본 곡(맞는 곡이 없을 때). 곡 고르기는 chat/[sessionId]/bgm-actions.ts(보조 모델), 재생은 bgm.tsx.
 */
export type Bgm = { url: string; situation: string; name?: string }
export const BGM_LIMITS = { entries: 20, situationLength: 120, nameLength: 60, bytes: 8 * 1024 * 1024 } as const
export const BGM_TYPES: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }
const OWN = /^\/media\/character-images\/[^?#]+\.(mp3|m4a|aac|ogg|wav)$/

/** 폼 JSON → 저장할 목록. 우리 서버에 올린 음악 파일 주소만 남긴다. */
export function normalizeBgm(input: unknown): Bgm[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>
    const url = typeof o.url === 'string' && OWN.test(o.url) && !o.url.includes('..') ? o.url : ''
    const situation = typeof o.situation === 'string' ? o.situation.replace(/\s+/g, ' ').trim().slice(0, BGM_LIMITS.situationLength) : ''
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, BGM_LIMITS.nameLength) : ''
    return url ? [{ url, situation, ...(name ? { name } : {}) }] : []
  }).slice(0, BGM_LIMITS.entries)
}

if (process.argv[1]?.endsWith('bgm.ts')) {
  const out = normalizeBgm([{ url: '/media/character-images/u/a.mp3', situation: '  긴박한\n추격 ' }, { url: 'https://evil/x.mp3', situation: 'x' }, { url: '/media/character-images/../x.mp3' }, { url: '/media/character-images/u/b.png' }])
  console.assert(out.length === 1 && out[0]!.situation === '긴박한 추격', JSON.stringify(out))
}
