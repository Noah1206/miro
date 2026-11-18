/**
 * 11/17 음성 모드 효과음 — 음성 엔진은 사람 목소리만 내서 결합부의 젖은 소리는 따로 깐다.
 * 답의 서술·행동 글에서 젖은 의성어와 체액이 얼마나 찼는지(context.ts 신음 표기 규칙이 쓰게 함)를 읽어 단계를 고른다.
 * 11/19 빠는 소리·헛구역질(suck·gag)은 freesound ArgyrosErotica 'Honey Blowjob' 묶음(CC0) 녹음을 섞어 이은 것.
 * ponytail: 글자 패턴으로 고른다 — 빗나가면 AI 가 숨은 sfx 칸을 직접 고르게 바꾼다.
 */
const WET = /찌걱|쮸걱|찔걱|쯔걱|쭈걱|찌꺽|쮸꺽|찔꺽|질척|철벅|츄걱|뷰릇/g
const SOAKED = /흥건|질퍽|범벅|흠뻑/
const OVERFLOW = /넘쳐|흘러내|쏟아|가득\s*차|차오르|역류|울컥/
/** 살 부딪는 소리 — '퍽'(꽤)·'짝'(짝꿍)과 헷갈리지 않게 겹친 꼴만. */
/** 11/19 빠는 소리(오랄) — '빨리·빨간·빨래'와 헷갈리지 않게 빠는 동작의 꼴만. */
const SUCK = /츄릅|쭙|쭈읍|쮸읍|쪽쪽|쪼옥|빨아|빨았|빨고|빨며|빨면서|빠는|빨던|핥|머금|목구멍|입에 물|입안 가득|오럴|펠라/
/** 11/19 목 깊이 넣어 헛구역질하는 장면 — 빠는 소리 대신 헛구역질이 많은 쪽(gag.mp3). */
const GAG = /컥|켁|캑|커헉|억억|우억|헛구역질|구역질|목 깊숙|목구멍 깊|목구멍까지|목까지/
const SLAP = /철퍽|퍽퍽|퍽,\s*퍽|짝짝|짝,\s*짝|팡팡|팡,\s*팡|찰싹/

export function sfxClips(blocks: Array<Record<string, unknown>>): string[] {
  const told = blocks.filter(b => b.type === 'narrative' || b.type === 'action').map(b => typeof b.text === 'string' ? b.text : '').join('\n')
  const wet = told.match(WET)?.length ?? 0, slap = SLAP.test(told), gag = GAG.test(told), suck = !gag && SUCK.test(told)
  if (!wet && !slap && !suck && !gag) return []
  // 11/17 사용자: 넘침 단계(wet-3)는 따로 두지 않는다 — 흥건·넘침 모두 wet-2. 파일은 public/sfx(Stable Audio Open, tooling/voice/modal_sfx_gen.py).
  const level = !wet ? 0 : OVERFLOW.test(told) || SOAKED.test(told) || wet >= 3 ? 2 : 1
  return [...(level ? [`/sfx/wet-${level}.mp3`] : []), ...(slap ? ['/sfx/slap.mp3'] : []), ...(suck ? ['/sfx/suck.mp3'] : []), ...(gag ? ['/sfx/gag.mp3'] : [])]
}
