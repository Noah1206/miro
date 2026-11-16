/**
 * 11/17 음성 모드 효과음 — 음성 엔진은 사람 목소리만 내서 결합부의 젖은 소리는 따로 깐다.
 * 답의 서술·행동 글에서 젖은 의성어와 체액이 얼마나 찼는지(context.ts 신음 표기 규칙이 쓰게 함)를 읽어 단계를 고른다.
 * ponytail: 글자 패턴으로 고른다 — 빗나가면 AI 가 숨은 sfx 칸을 직접 고르게 바꾼다.
 */
const WET = /찌걱|쮸걱|찔걱|쯔걱|쭈걱|찌꺽|쮸꺽|찔꺽|질척|철벅|츄걱|뷰릇/g
const SOAKED = /흥건|질퍽|범벅|흠뻑/
const OVERFLOW = /넘쳐|흘러내|쏟아|가득\s*차|차오르|역류|울컥/
/** 살 부딪는 소리 — '퍽'(꽤)·'짝'(짝꿍)과 헷갈리지 않게 겹친 꼴만. */
const SLAP = /철퍽|퍽퍽|퍽,\s*퍽|짝짝|짝,\s*짝|팡팡|팡,\s*팡|찰싹/

export function sfxClips(blocks: Array<Record<string, unknown>>): string[] {
  const told = blocks.filter(b => b.type === 'narrative' || b.type === 'action').map(b => typeof b.text === 'string' ? b.text : '').join('\n')
  const wet = told.match(WET)?.length ?? 0, slap = SLAP.test(told)
  if (!wet && !slap) return []
  // 11/17 사용자: 넘침 단계(wet-3)는 따로 두지 않는다 — 흥건·넘침 모두 wet-2. 파일은 public/sfx(Stable Audio Open, tooling/voice/modal_sfx_gen.py).
  const level = !wet ? 0 : OVERFLOW.test(told) || SOAKED.test(told) || wet >= 3 ? 2 : 1
  return [...(level ? [`/sfx/wet-${level}.mp3`] : []), ...(slap ? ['/sfx/slap.mp3'] : [])]
}
