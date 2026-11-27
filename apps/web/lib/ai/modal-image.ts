/**
 * Modal 그림 생성(11/2) — 오늘 학습한 LoRA(남성향 gda_v3 / 여성향 whif_v1)를 쓰는 Modal 앱 miro-lora-test 의 image_api.
 * 일반·언베일 사진 모두 이 경로(RunPod 은 학습한 모델이 없어 쓰지 않는다). 그림체 설정은 tooling/image/studio_presets.json.
 * env: MIRO_IMAGE_URL(image_api 주소), MIRO_IMAGE_SECRET(Modal Secret 'miro-image-api' 와 같은 값).
 */
import { z } from 'zod'
import { resolveLLM, type LLMProvider } from '@miro/providers'
import { observe } from '@/lib/observe'

export function modalImageReady() {
  return !!(process.env.MIRO_IMAGE_URL && process.env.MIRO_IMAGE_SECRET)
}

/** 11/7 작품별 그림체(tooling/image/STYLES.md) — 대표 사진을 그린 그림체와 같게. 서버 안에서만 쓰고 화면에 띄우지 않는다. */
const WORK_STYLE: Record<string, string> = {
  'official-m-rogue-noble': 'itim-noob', 'official-m-club-senior': 'itim-noob', 'official-m-apocalypse-bully': 'itim-noob', 'official-m-others-gf': 'itim-noob', 'official-m-academy-extra': 'itim-noob', 'official-m-dungeon-barbarian': 'itim-noob',
  'official-m-gumiho-partner': 'kdh-noob', 'official-m-moon-app': 'kdh-noob', 'official-m-massage-club': 'kdh-noob', 'official-m-only-me': 'kdh-noob',
  'official-m-desire-diary': 'fa-noob', 'official-m-pet-seniors': 'fa-noob',
  'official-m-brat-senior': 'acdm-noob', 'official-m-wall-friend': 'acdm-noob',
  'official-m-stray-cat': 'isg-noob', 
  'official-m-frustrated-madam': 'syh-noob',
  'official-m-mother-daughter': 'srn', 'official-m-cheongun-return': 'srn',
  'official-m-cheonma-reborn': 'mojz',
}

/** 캐릭터 → 그림체. 작품 표에 없으면 남성향(여자)은 가다공, 여성향(남자)은 위프 — 남자 중심. */
export const styleFor = (audience: 'male' | 'female', slug?: string | null) =>
  (slug && WORK_STYLE[slug]) || (audience === 'male' ? 'gda' : 'whif')

// 언베일 모델(DeepSeek)은 tags 를 배열로 줄 때가 있다(11/9) — 쉼표로 이어 받는다.
const Tags = z.object({ tags: z.preprocess(v => Array.isArray(v) ? v.join(', ') : v, z.string().max(1200)) })
// 그림 모델은 프롬프트 앞 약 77토큰만 읽는다(11/2 확인: 길면 뒤의 장면이 잘린다) — 외형은 핵심 10개 안팎으로.
const SYSTEM = `You convert a character description into English Danbooru-style tags for an anime illustration model.
Rules:
- Output only comma-separated tags in English (no sentences), at most 12 tags, most important first.
- Priority: hair color, hair length, hair style, eye color, skin, one distinctive mark (tattoo, scar, piercing, glasses), outfit.
- Keep every fixed detail exactly (hair, eyes, outfit, underwear color, accessories, marks). Do not change colors.
- Put the everyday outfit tags (clothes only, not hair/eyes/marks/accessories) LAST, after a single " | " separator: "appearance tags | outfit tags". If no outfit is described, output no separator.
- Do not add place, time, mood, pose, framing or camera tags (the scene is given separately).
- The character is an adult. Never add age-down words (child, loli, shota, teen, school uniform, etc.).
- Do not add quality tags or style names.`

/** 외형 태그 규칙 판 — 저장해 둔 외형 태그(lib/simulation/media.ts lookTags)의 열쇠에 들어간다. 규칙을 바꾸면 올린다. */
export const LOOK_VERSION = 'modal-tags:v2'

/** 11/15 외형 태그 "외형 | 평소 옷" 에서, 장면·순간이 옷을 따로 말하면 평소 옷을 뺀다 — 앞에 놓인 평소 옷이 잠옷·수건·알몸 같은 지금 옷 상태를 이겼다. */
const WEARS = /\b(nude|naked|topless|bottomless|towel|lingerie|underwear|bra|panties|bikini|swimsuit|swim trunks|pajamas|apron|dress|uniform|shirt|blouse|sweater|hoodie|jacket|coat|skirt|kimono|hanbok|suit|sportswear|leggings|robe|bathrobe|jeans|maid|nurse|bunny|bunnysuit|leotard|cosplay|clothes|loungewear|tank top|tailcoat|sundress)\b/
export function lookFor(look: string, sceneTags: string): string {
  const [appearance, outfit] = look.split(' | ')
  return [appearance, outfit && !WEARS.test(sceneTags) ? outfit : ''].filter(Boolean).join(', ')
}

/** 한국어가 섞인 외형·장면·세부사항 → 영어 태그. 실패하면 원문을 그대로 쓴다(그림은 계속 만든다). */
export async function toImageTags(text: string, fallback?: Pick<LLMProvider, 'generateStructured'>): Promise<string> {
  // 11/9 운영 원인: 성인 외형 문장은 Gemini 가 content_blocked 로 막아 한국어 원문이 그림 모델로 갔다(머리·눈 색이 안 맞음).
  // 언베일 방이면 두 번째 시도를 언베일 모델(fallback)로, 아니면 같은 모델로 한 번 더. 원인은 로그에.
  // 11/24 사용자: 언베일이면 처음부터 언베일 모델(OpenRouter)로 — 첫 시도를 메인 키로 보내 막힌 뒤에야 넘겼다.
  const llms = fallback ? [fallback, fallback] : [resolveLLM(), resolveLLM()]
  for (const [i, llm] of llms.entries()) {
    try {
      const { tags } = await llm.generateStructured({ task: 'image_prompt', promptVersion: LOOK_VERSION, maxTokens: 2048, schema: Tags, system: SYSTEM, prompt: text })
      return tags
    } catch (e) {
      observe('image.tags_failed', { attempt: i + 1, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' })
    }
  }
  return text
}

const MOMENT_SYSTEM = `You turn the latest moment of a Korean roleplay chat into English Danbooru-style scene tags for an anime illustration of ONE character (the user is not drawn).
Rules:
- Output only comma-separated English tags, at most 10, most important first.
- Cover what is visible right now: the character's pose/action, facial expression, outfit or its state, place, time of day/lighting, one key prop.
- Use only what the text says or clearly implies. Do not invent new events.
- The text has the current situation (place · time), the story so far, and the recent chat; the LAST lines are the moment to draw. Use the earlier parts only for continuity (where they are, what is already taken off or changed), never draw an earlier event.
- If the text clearly involves two people together (hug, kiss, holding hands), include that interaction.
- Order: action/pose first, then expression, then outfit, then place/lighting (the image model reads the front of the prompt first).
- Add exactly ONE framing tag that shows the moment best: talking face to face → upper body; standing/walking → cowboy shot; whole outfit or body posture matters → full body; lying down → from above; character is above or taller than the viewer → from below; a tiny detail (eyes, hands, a held object) → close-up.
- Gaze: "looking at viewer" only when the character is talking to or looking at the user in the text; otherwise looking away or at what she/he is doing.
- The character is an adult. Never add age-down words (child, loli, shota, teen, school uniform, etc.). No quality tags or style names.`

// 11/11 언베일 방: 성행위 장면이면 그 행위·자세를 정확히(오랄 장면이 등 돌린 단독 사진으로 나왔다). 상대(남자)는 시점(pov)으로 일부만.
const MOMENT_ADULT = `
- This is an adult (18+) explicit scene between consenting adults. If a sexual act is happening, the act and position are the MOST important tags: name them with standard Danbooru tags (e.g. fellatio, deepthroat, kneeling, sex, vaginal, missionary, cowgirl position, doggystyle, paizuri, handjob) and the partner's visible part (1boy, penis, pov, hetero).
- Order: act tags first, then the framing that shows the act (fellatio/deepthroat: looking up, pov, from above; doggystyle: from behind; cowgirl: pov, from below; missionary: pov, lying on back), then expression and clothing state (e.g. open blouse, breasts out).
- At most ONE place tag (e.g. study, living room). No props, doors, furniture or background objects — they pull the picture away from the act.
- Intensity (11/13): read which stage the narration is in and add 2-3 body/expression tags for it right after the framing — the same position looks different at each stage.
  foreplay: blush, half-closed eyes, light sweat, shy | main act: sweat, heavy breathing, open mouth, motion lines | climax: orgasm, arched back, trembling, tears, clenched teeth or tongue out (only what the text describes) | afterglow: exhausted, heavy breathing, messy hair, cum drip only if the text says so.`

/** 11/3 사용자 고정 요구: 채팅 중 사진은 그 순간 맥락대로 — 최근 장면 글 → 자세·표정·옷·장소 태그. 실패하면 빈 값(외형·장소만으로 그린다). adult = 언베일 모델로 바꿀 때. */
export function toMomentTags(text: string, llm: Pick<LLMProvider, 'generateStructured'> = resolveLLM(), adult = false): Promise<string> {
  // 11/15 같은 순간을 여러 장 찍으면 같은 글을 장마다 바꿨다(6장 = 6번) — 진행 중이거나 방금(1분) 바꾼 결과를 같이 쓴다.
  const key = `${adult}:${text}`
  let tags = momentTags.get(key)
  if (!tags) {
    tags = llm.generateStructured({ task: 'image_prompt', promptVersion: adult ? 'modal-moment:v3-adult' : 'modal-moment:v2', maxTokens: 2048, schema: Tags,
      system: adult ? MOMENT_SYSTEM.replace('at most 10', 'at most 14') + MOMENT_ADULT : MOMENT_SYSTEM, prompt: text }).then(r => r.tags)
      // 실패하면 외형만으로 그린다 — 장면 없는 사진의 원인이 로그에 남게(11/15, 예전엔 조용히 빈 값)
      .catch(e => { observe('image.moment_failed', { adult, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' }); return '' })
    momentTags.set(key, tags)
    setTimeout(() => momentTags.delete(key), 60_000).unref()
  }
  return tags
}
const momentTags = new Map<string, Promise<string>>()

/** 11/11 미리 깨우기 — 사진 창을 열 때 그 그림체 서버를 미리 띄운다(꺼진 서버 73초 → 켜진 서버 17초 실측). 기다리지 않고, 실패해도 무시. */
export async function warmModalImage(style: string): Promise<void> {
  if (!modalImageReady()) return
  // 기다려야 요청이 실제로 나간다 — 안 기다리면 서버 함수가 먼저 끝나 깨우기가 안 갔다(11/11 실측 75초). 서버는 띄우기만 하고 바로 답한다.
  const ping = (url: string | undefined, body: Record<string, unknown>) => url ? fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.MIRO_IMAGE_SECRET, warm: true, ...body }), signal: AbortSignal.timeout(8_000) }).catch(() => {}) : Promise.resolve()
  // 11/18 언베일 사진의 남성기 흰색 가림을 다시 켰으므로 가림 서버도 함께 깨운다.
  await Promise.all([ping(process.env.MIRO_IMAGE_URL, { style }), ping(process.env.MIRO_CENSOR_URL, {})])
}

/** PNG 바이트. 첫 장은 GPU 준비로 1~2분 걸릴 수 있다. */
/** look = 캐릭터 외형 태그(주인공 바로 뒤에 붙는다 — 상대 인물에게 섞이지 않게), tags = 장면·수위. */
/** refUrl = 캐릭터 대표 사진(공개 버킷) — 얼굴·머리·그림체를 그 사진에 맞춘다(11/2). */
export async function generateModalImage(req: { style: string; look?: string; tags: string; unveil: boolean; couple?: boolean; extraNeg?: string; seed?: number; refUrl?: string }): Promise<Buffer> {
  const res = await fetch(process.env.MIRO_IMAGE_URL!, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.MIRO_IMAGE_SECRET, style: req.style, look: req.look ?? '', tags: req.tags, unveil: req.unveil, couple: !!req.couple,
      extra_neg: req.extraNeg ?? '', seed: req.seed, ref_url: req.refUrl ?? '' }),
    signal: AbortSignal.timeout(200_000),   // 함수 한도(300초) 안에서 끝내야 실패 시 차감을 돌려줄 수 있다(11/9)
  })
  if (!res.ok) throw new Error(`modal image ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { png } = (await res.json()) as { png?: string }
  if (!png) throw new Error('modal image: empty')
  return Buffer.from(png, 'base64')
}
