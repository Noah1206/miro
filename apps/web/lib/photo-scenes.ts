/**
 * 사진 시트의 장면·구도 목록(11/2). 로컬 스튜디오(tooling/image/studio_presets.json)와 같은 장면 — 장면을 늘릴 땐 두 곳에 같이 넣는다.
 * 언베일 장면은 언베일이 켜진 방에서만 보이고, 서버도 다시 막는다. 태그는 그림 모델에 그대로 들어가는 영어.
 */
export type PhotoScene = { id: string; label: string; unveil: boolean; couple: boolean; tags: string; male?: true; group?: string }

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
  ...maleScenes(),
]

/**
 * 남성향 캐릭터 전용 상황 목록(11/3 사용자: 베이비챗 남성향처럼 감정·행동·스킨십·체위까지 유저가 다 골라서) — 묶음별로 시트에 보인다.
 * 위의 기본 장면도 남성향에선 같은 묶음 안에 들어간다(MALE_GROUP_OF). [id, 이름, 태그, 둘이?]
 */
function maleScenes(): PhotoScene[] {
  type Row = [string, string, string, boolean?]
  const groups: Array<[string, boolean, Row[]]> = [
    ['표정', false, [
      ['m_smile', '미소', 'gentle smile, looking at viewer, upper body'],
      ['m_angry', '화남', 'angry, frown, clenched teeth, looking at viewer, upper body'],
      ['m_laugh', '활짝 웃음', 'laughing, open mouth, happy, closed eyes, upper body'],
      ['m_cry', '눈물', 'crying, tears, sad, looking at viewer, upper body'],
      ['m_smirk', '비웃음', 'smirk, smug, half-closed eyes, looking at viewer, upper body'],
      ['m_disgust', '경멸', 'disgust, looking down at viewer, contempt, from below, upper body'],
      ['m_scared', '겁먹음', 'scared, trembling, wide eyes, upper body'],
      ['m_blank', '무표정', 'expressionless, straight face, looking at viewer, upper body'],
      ['m_fluster', '당황', 'flustered, surprised, sweatdrop, blush, upper body'],
      ['m_think', '고민', 'thinking, hand on own chin, looking up, upper body'],
      ['m_shy', '부끄러움', 'embarrassed, heavy blush, looking away, hands together, upper body'],
      ['m_pout', '삐짐', 'pout, puffed cheeks, crossed arms, looking away, upper body'],
    ]],
    ['일상', false, [
      ['m_phone', '휴대폰 보기', 'looking at smartphone, sitting, relaxed, indoors'],
      ['m_nap', '낮잠', 'sleeping, lying on sofa, closed eyes, blanket, afternoon light'],
      ['m_eat', '밥 먹기', 'eating, holding chopsticks, table, happy, indoors, upper body'],
      ['m_drink', '술 한잔', 'drinking, holding beer can, flushed face, tipsy smile, night, indoors'],
      ['m_selfie', '셀카', 'selfie, holding phone, peace sign, smile, upper body'],
      ['m_gym', '운동', 'working out, gym, sweat, ponytail, sports bra, leggings'],
    ]],
    ['스킨십', false, [
      ['m_hug', '포옹', 'hug, embracing, face on chest, closed eyes, smile, upper body', true],
      ['m_headpat', '머리 쓰다듬기', 'headpat, hand on head, happy, blush, closed eyes, upper body', true],
      ['m_cheek', '볼 꼬집기', 'cheek pinching, pout, blush, upper body', true],
      ['m_lap', '무릎베개', 'lap pillow, lying on lap, looking down, gentle smile', true],
      ['m_cheekkiss', '볼 뽀뽀', 'kiss on cheek, closed eyes, blush, upper body', true],
      ['m_armhug', '팔짱', 'arm hug, leaning on shoulder, walking together, smile, cowboy shot', true],
    ]],
    ['노출', true, [
      ['m_undress_top', '상의 벗기', 'undressing, taking off shirt, bra, blush, looking at viewer, bedroom, cowboy shot'],
      ['m_undress_bottom', '하의 벗기', 'undressing, pulling down panties, skirt lift, blush, looking at viewer, bedroom'],
      ['m_nude', '알몸', 'completely nude, nipples, pussy, standing, blush, looking at viewer, bedroom, full body'],
      ['m_mirror_lingerie', '속옷 거울 셀카', 'mirror selfie, lingerie, holding phone, bedroom, cowboy shot'],
      ['m_mirror_nude', '알몸 거울 셀카', 'mirror selfie, completely nude, nipples, holding phone, bathroom'],
      ['m_grab_breasts', '가슴 쥐고 유혹', 'grabbing own breasts, topless, nipples, seductive smile, bedroom eyes, upper body'],
      ['m_bounce', '가슴 흔들기', 'bouncing breasts, topless, nipples, motion lines, smile, upper body'],
      ['m_armpits', '겨드랑이', 'arms up, armpits, presenting armpit, sleeveless, blush, upper body'],
      ['m_feet', '발', 'feet, soles, foot focus, barefoot, sitting on bed, looking at viewer'],
      ['m_ass', '엉덩이', 'ass focus, from behind, looking back, panties, bent over'],
      ['m_spread', '벌리기', 'spread legs, spread pussy, nude, lying on back, blush, looking at viewer'],
      ['m_reverse_bunny', '역바니', 'reverse bunnysuit, rabbit ears, nipples, pantyhose, blush, looking at viewer, cowboy shot'],
      ['m_skirt_lift', '치마 들기', 'skirt lift, panties, blush, looking away, cowboy shot'],
    ]],
    ['애무', true, [
      ['m_grope_clothed', '옷 위로 가슴', 'grabbing another\'s breast from behind, clothed, groping, blush, upper body', true],
      ['m_grope', '가슴 만지기', 'grabbing another\'s breast from behind, topless, nipples, blush, upper body', true],
      ['m_grope_ass', '엉덩이 만지기', 'hand on another\'s ass, groping, from behind, blush', true],
      ['m_suck', '가슴 빨기', 'breast sucking, nipples, nude, blush, holding head', true],
      ['m_nursing_hj', '수유 대딸', 'nursing handjob, breastfeeding, handjob, penis, nude, gentle smile', true],
      ['m_masturbate', '자위', 'female masturbation, fingering self, nude, spread legs, blush, open mouth, bed'],
      ['m_fingering', '핑거링', 'fingering, nude, spread legs, blush, open mouth, bed', true],
      ['m_cunni', '커닐링구스', 'cunnilingus, spread legs, nude, arched back, blush, bed', true],
      ['m_facesit', '페이스시팅', 'facesitting, nude, looking down, smirk, pov', true],
      ['m_handjob', '핸드잡', 'handjob, penis, nude, looking at viewer, smile, pov', true],
      ['m_footjob', '풋잡', 'footjob, penis, barefoot, sitting, smirk, pov', true],
      ['m_deepthroat', '딥스롯', 'deepthroat, fellatio, penis, kneeling, tears, pov', true],
      ['m_cum_mouth', '입안 보여주기', 'cum in mouth, open mouth, tongue out, looking at viewer, blush, upper body'],
      ['m_swallow', '삼키기', 'swallowing, cum, hand on throat, blush, smile, upper body'],
    ]],
    ['체위', true, [
      ['m_reverse_cowgirl', '역기승위', 'sex, reverse cowgirl position, girl on top, from behind, ass, looking back, nude, bed', true],
      ['m_mating_press', '교배 프레스', 'sex, mating press, legs up, nude, blush, open mouth, bed, pov', true],
      ['m_piledriver', '파일드라이버', 'sex, piledriver position, legs over head, nude, blush, bed', true],
      ['m_full_nelson', '풀넬슨', 'sex, full nelson, legs up, spread legs, nude, blush, open mouth', true],
      ['m_lotus', '마주 앉아서', 'sex, sitting, face to face, lotus position, hugging, nude, kiss, bed', true],
      ['m_spooning', '옆으로 누워서', 'sex, spooning, lying on side, from behind, nude, blush, bed', true],
      ['m_prone', '엎드려서', 'sex, prone bone, lying on stomach, from behind, nude, gripping pillow, bed', true],
      ['m_anal', '애널', 'anal, sex from behind, nude, blush, looking back, bed', true],
      ['m_creampie', '질내사정', 'cum in pussy, creampie, cum drip, after sex, spread legs, nude, exhausted, bed'],
      ['m_phone_sex', '통화하며', 'sex, talking on phone, covering mouth, blush, nude, from behind, bed', true],
      ['m_outdoor', '야외', 'sex, outdoors, from behind, standing, nude, blush, night, park', true],
      ['m_pregnant_sex', '임신 중', 'sex, pregnant, missionary, nude, face to face, gentle, blush, bed', true],
      ['m_exhausted', '끝나고 녹초', 'after sex, exhausted, lying on bed, nude, heavy breathing, sweat, messy hair'],
      ['m_condom', '콘돔 들고', 'holding condom, condom wrapper in mouth, lingerie, smirk, looking at viewer, upper body'],
    ]],
    ['샤워', true, [
      ['m_shower', '샤워', 'showering, nude, wet, water drops, steam, bathroom, closed eyes'],
      ['m_hairwash', '머리 감겨 주기', 'washing another\'s hair, shower, nude, bubbles, smile, bathroom', true],
      ['m_bath_together', '같이 욕조', 'bathing together, bathtub, nude, steam, leaning back, smile', true],
      ['m_shower_sex', '샤워부스에서', 'sex, shower, from behind, standing, against glass, wet, nude, steam', true],
    ]],
    ['결혼·임신', false, [
      ['m_wedding', '결혼식', 'wedding dress, bridal veil, bouquet, happy tears, smile, chapel, cowboy shot'],
      ['m_pregnant', '임신', 'pregnant, hand on own belly, gentle smile, sundress, soft light, cowboy shot'],
      ['m_parenting', '육아', 'holding baby, mother, gentle smile, home, upper body'],
    ]],
    ['플레이', true, [
      ['m_dogeza', '도게자', 'dogeza, kneeling, bowing, nude, from above'],
      ['m_spanking', '스팽킹', 'spanking, red ass, bent over, tears, blush, from behind', true],
      ['m_bondage', '구속', 'bondage, tied up, rope, shibari, nude, blush, lying on bed'],
      ['m_walk', '알몸 산책', 'naked collar, leash, nude, outdoors, night, blush, all fours'],
      ['m_ahegao', '아헤가오', 'ahegao, double peace sign, tongue out, rolling eyes, nude, upper body'],
      ['m_apron', '알몸 앞치마', 'naked apron, cooking, kitchen, looking back, ass, smile'],
      ['m_cat', '고양이 애교', 'cat pose, paw pose, cat ears, cat tail, lingerie, all fours, blush, looking at viewer'],
      ['m_vibrator', '로터 넣고', 'vibrator under clothes, remote control vibrator, trembling, blush, office, upper body'],
      ['m_morning_bj', '모닝 펠라', 'fellatio, under blanket, morning, bed, looking up, pov', true],
      ['m_breasts_heart', '가슴 하트', 'heart hands, topless, nipples, smile, blush, upper body'],
      ['m_twerk', '트월킹', 'twerking, ass, from behind, looking back, shorts, motion lines'],
    ]],
  ]
  return groups.flatMap(([group, unveil, rows]) => rows.map(([id, label, tags, couple]) => ({ id, label, unveil, couple: !!couple, tags, male: true as const, group })))
}

/** 남성향 시트에서 기본 장면이 들어갈 묶음 — 없는 장면(일상 기본)은 '일상'. */
export const MALE_GROUP_OF: Record<string, string> = {
  u_shower: '노출', u_tease: '노출', u_lingerie: '노출', u_topless: '노출', u_kiss: '스킨십',
  u_missionary: '체위', u_cowgirl: '체위', u_doggy: '체위', u_standing: '체위', u_squirting: '체위', u_after: '체위',
  u_paizuri: '애무', u_fellatio: '애무',
}
export const MALE_GROUPS = ['표정', '일상', '스킨십', '노출', '애무', '체위', '샤워', '결혼·임신', '플레이'] as const

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
  // 옷(11/3) — 시트는 남성향 캐릭터에서만 보여 준다(다른 캐릭터는 늘 '자동').
  outfit: { label: '무슨 옷', options: [['자동', ''], ['평상복', 'casual clothes'], ['운동복', 'sportswear, sports bra, leggings'], ['실내복', 'pajamas, oversized shirt'], ['정장', 'office lady, white shirt, pencil skirt'],
    ['간호사복', 'nurse, nurse uniform, nurse cap'], ['메이드복', 'maid, maid headdress, apron'], ['경찰복', 'police uniform, police hat'], ['고양이', 'cat ears, cat tail, cat cosplay'],
    ['치어리더', 'cheerleader, pom poms, crop top, miniskirt'], ['바니걸', 'playboy bunny, rabbit ears, leotard, pantyhose'], ['비키니', 'bikini'], ['기모노', 'kimono']] },
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
