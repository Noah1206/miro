/**
 * 사진 시트의 장면·구도 목록(11/2). 로컬 스튜디오(tooling/image/studio_presets.json)와 같은 장면 — 장면을 늘릴 땐 두 곳에 같이 넣는다.
 * 언베일 장면은 언베일이 켜진 방에서만 보이고, 서버도 다시 막는다. 태그는 그림 모델에 그대로 들어가는 영어.
 */
export type PhotoScene = { id: string; label: string; unveil: boolean; couple: boolean; tags: string }

export const PHOTO_SCENES: PhotoScene[] = [
  { id: 'd_cafe', label: '카페', unveil: false, couple: false, tags: 'sitting in cafe by window, holding coffee cup, gentle smile, soft daylight, upper body' },
  { id: 'd_cooking', label: '요리', unveil: false, couple: false, tags: 'cooking in small kitchen wearing apron, holding ladle, steam, cheerful, warm light, upper body' },
  { id: 'd_street', label: '거리 산책', unveil: false, couple: false, tags: 'walking on city street, coat, looking at viewer, evening lights, cowboy shot' },
  { id: 'd_sofa', label: '소파에서 쉬기', unveil: false, couple: false, tags: 'lying on sofa, oversized t-shirt, relaxed, holding smartphone, warm lamp light, indoors' },
  { id: 'd_bed_morning', label: '아침 침대', unveil: false, couple: false, tags: 'sitting in bed in the morning, messy hair, sleepy smile, morning sunlight, upper body' },
  { id: 'd_date', label: '데이트', unveil: false, couple: true, tags: 'date, walking side by side, holding hands, looking at each other, smile, city night, cowboy shot' },
  { id: 'u_shower', label: '샤워 후 수건', unveil: true, couple: false, tags: 'just out of shower, wrapped in towel, wet hair, steam, bathroom, blush, bare shoulders, cowboy shot' },
  { id: 'u_tease', label: '유혹', unveil: true, couple: false, tags: 'completely nude, nipples, seductive pose, lying on bed, bedroom eyes, alluring smile, looking at viewer, night, dim warm light, cowboy shot' },
  { id: 'u_lingerie', label: '속옷', unveil: true, couple: false, tags: 'lingerie, sitting on bed, blush, looking at viewer, night, soft lamp light, cowboy shot' },
  { id: 'u_topless', label: '상반신 노출', unveil: true, couple: false, tags: 'topless, nude, nipples, sitting on bed, upper body, blush, looking at viewer, soft window light, bedroom' },
  { id: 'u_kiss', label: '키스', unveil: true, couple: true, tags: 'kissing, closed eyes, hands on chest, blush, night, bedroom, upper body' },
  { id: 'u_missionary', label: '정상위', unveil: true, couple: true, tags: 'sex, vaginal penetration, penis, completely nude, nipples, missionary position, woman lying on back, man on top between legs, face to face, looking at each other, eye contact, sweat, blush, open mouth, bed, night' },
  { id: 'u_cowgirl', label: '기승위', unveil: true, couple: true, tags: 'nude, sex, cowgirl position, girl on top, looking at each other, eye contact, hands on chest, blush, bed, night' },
  { id: 'u_doggy', label: '후배위', unveil: true, couple: true, tags: 'nude, sex from behind, doggystyle, looking back over shoulder, blush, gripping sheets, bed, night' },
  { id: 'u_standing', label: '들박 (안아 들기)', unveil: true, couple: true, tags: 'nude, sex, standing sex, carrying, suspended congress, legs wrapped around waist, arms around neck, face to face, looking at each other, blush, against wall, night' },
  { id: 'u_paizuri', label: '파이즈리', unveil: true, couple: true, tags: 'paizuri, breasts squeezed together, penis between breasts, nude, kneeling on bed, looking up, blush, night, pov' },
  { id: 'u_fellatio', label: '펠라', unveil: true, couple: true, tags: 'fellatio, kneeling, nude, looking up, blush, bed, night, pov' },
  { id: 'u_squirting', label: '시오후키', unveil: true, couple: true, tags: 'nude, sex, squirting, female ejaculation, orgasm, arched back, trembling, blush, open mouth, lying on bed, spread legs, night' },
  { id: 'u_after', label: '끝난 뒤', unveil: true, couple: true, tags: 'after sex, lying in bed together, covered with blanket, bare shoulders, looking at each other, tender smile, night' },
]

/** 만든 사람이 정한 장면(11/3). 설명은 한국어 그대로 저장하고, 그릴 때 영어 태그로 바꾼다. */
export type CustomPhotoScene = { label: string; description: string; unveil?: true; couple?: true }
export const CUSTOM_SCENE_LIMITS = { entries: 12, label: 20, description: 200 } as const
/** 시트·서버가 쓰는 만든 장면 id — 저장 순서 번호. */
export const customSceneId = (index: number) => `c${index}`

/** 폼 JSON → 저장할 목록. 이름·설명이 없는 줄은 버린다. */
export function normalizeCustomScenes(input: unknown): CustomPhotoScene[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_SCENE_LIMITS.label) : ''
    const description = typeof o.description === 'string' ? o.description.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_SCENE_LIMITS.description) : ''
    return label && description ? [{ label, description, ...(o.unveil === true ? { unveil: true as const } : {}), ...(o.couple === true ? { couple: true as const } : {}) }] : []
  }).slice(0, CUSTOM_SCENE_LIMITS.entries)
}

/** 구도 — 묶음마다 '자동'(빈 태그)이 첫 번째. 고르면 장면 태그 속 같은 묶음 태그를 빼고 고른 것을 넣는다. */
export const PHOTO_COMPOSITIONS = {
  distance: { label: '얼마나 가까이', options: [['자동', ''], ['얼굴 가까이', 'close-up, portrait'], ['상반신', 'upper body'], ['무릎 위까지', 'cowboy shot'], ['전신', 'full body']] },
  angle: { label: '어느 방향에서', options: [['자동', ''], ['정면 눈높이', 'from front, straight-on'], ['위에서 내려다보기', 'from above'], ['아래에서 올려다보기', 'from below'], ['옆모습', 'from side, profile'], ['뒷모습', 'from behind'], ['내 시점 (1인칭)', 'pov']] },
  gaze: { label: '어디를 보는지', options: [['자동', ''], ['화면(나)을 봄', 'looking at viewer'], ['서로 마주 봄', 'face to face, looking at each other, eye contact'], ['다른 곳을 봄', 'looking away'], ['눈 감음', 'closed eyes']] },
} as const satisfies Record<string, { label: string; options: ReadonlyArray<readonly [string, string]> }>
export type CompositionKey = keyof typeof PHOTO_COMPOSITIONS

/** 장면 태그 + 구도(인덱스) → 최종 태그. 잘못된 인덱스는 '자동'. */
export function sceneTags(scene: PhotoScene | null, picks: Partial<Record<CompositionKey, number>>): string {
  let tags = (scene?.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
  const add: string[] = []
  for (const key of Object.keys(PHOTO_COMPOSITIONS) as CompositionKey[]) {
    const opts = PHOTO_COMPOSITIONS[key].options
    const chosen = opts[picks[key] ?? 0]?.[1]
    if (!chosen) continue
    const known = new Set(opts.flatMap(([, t]) => t.split(',').map(x => x.trim()).filter(Boolean)))
    tags = tags.filter(t => !known.has(t))
    add.push(chosen)
  }
  return [...tags, ...add].join(', ')
}

/** 가격(11/2 확정, 11/3 장수 자유): 1장 10, 2장부터는 장당 9(예전 4장 묶음 36과 같은 할인). 한 번에 최대 6장. */
export const PHOTO_PRICE = { single: 10, each: 9, max: 6 } as const
export const photoPrice = (count: number) => (count <= 1 ? PHOTO_PRICE.single : count * PHOTO_PRICE.each)
