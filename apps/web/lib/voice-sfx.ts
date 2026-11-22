/**
 * 11/17 음성 모드 효과음 — 음성 엔진은 사람 목소리만 내서 몸 소리는 따로 깐다. 답의 서술·행동 글을 읽어 고른다.
 * 11/19 빠는 소리·헛구역질(suck·gag)은 freesound ArgyrosErotica 'Honey Blowjob' 묶음(CC0) 녹음을 섞어 이은 것.
 * ponytail: 글자 패턴으로 고른다 — 빗나가면 AI 가 숨은 sfx 칸을 직접 고르게 바꾼다.
 */
/** 11/19 빠는 소리(오랄) — '빨리·빨간·빨래'와 헷갈리지 않게 빠는 동작의 꼴만. */
const SUCK = /츄릅|쭙|쭈읍|쮸읍|쪽쪽|쪼옥|할짝|낼름|빨아|빨았|빨고|빨며|빨면서|빠는|빨던|핥|입안 가득|오럴|펠라/
/** 11/19 목 깊이 넣어 헛구역질하는 장면 — 빠는 소리 대신 헛구역질이 많은 쪽(gag.mp3). */
const GAG = /컥컥|켁켁|커헉|억억|우억|헛구역질|목 깊숙|목구멍 깊|목구멍까지 밀/   // 11/23 '머금다·목까지 채운 단추·켁(기침)' 같은 일상 말에 걸려 뺐다
/** 살 부딪는 소리 — '퍽'(꽤)·'짝'(짝꿍)과 헷갈리지 않게 겹친 꼴만. */
const SLAP = /철퍽|퍽퍽|퍽,\s*퍽|짝짝|짝,\s*짝|팡팡|팡,\s*팡|찰싹/

/** 11/23 사용자 "넘 좋아": 빠는 소리 녹음에 공식 여자 목소리 음색을 입힌 판(Seed-VC) — 히로인 목소리(provider id 앞 8자)가 있으면 그 사람이 빠는 소리로. */
const ORAL_VOICES = new Set(['69bacb4f', 'f3178eb8', 'a5201527', '7957fb58', 'ba488381', 'ecd57c06'])
export const voicedClip = (clip: string, voice?: string | null) => clip === '/sfx/suck.mp3' && voice && ORAL_VOICES.has(voice.slice(0, 8)) ? `/sfx/suck-${voice.slice(0, 8)}.mp3` : clip

export function sfxClips(blocks: Array<Record<string, unknown>>): string[] {
  const told = blocks.filter(b => b.type === 'narrative' || b.type === 'action').map(b => typeof b.text === 'string' ? b.text : '').join('\n')
  // 11/19 사용자: 찌걱거리는 젖은 소리(wet-1·wet-2)는 내지 않는다 — 그때는 목소리 신음만.
  const slap = SLAP.test(told), gag = GAG.test(told), suck = !gag && SUCK.test(told)
  return [...(slap ? ['/sfx/slap.mp3'] : []), ...(suck ? ['/sfx/suck.mp3'] : []), ...(gag ? ['/sfx/gag.mp3'] : [])]
}
