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
  'official-m-rogue-noble': 'itim-noob', 'official-m-club-senior': 'itim-noob', 'official-m-reverse-world': 'itim-noob', 'official-m-apocalypse-bully': 'itim-noob', 'official-m-others-gf': 'itim-noob', 'official-m-academy-extra': 'itim-noob', 'official-m-dungeon-barbarian': 'itim-noob',
  'official-m-gumiho-partner': 'kdh-noob', 'official-m-moon-app': 'kdh-noob', 'official-m-hero-party': 'kdh-noob', 'official-m-massage-club': 'kdh-noob', 'official-m-only-me': 'kdh-noob',
  'official-m-desire-diary': 'fa-noob', 'official-m-pet-seniors': 'fa-noob',
  'official-m-brat-senior': 'acdm-noob', 'official-m-wall-friend': 'acdm-noob',
  'official-m-stray-cat': 'isg-noob', 'official-m-stepmom-friends': 'isg-noob',
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
- Do not add place, time, mood, pose, framing or camera tags (the scene is given separately).
- The character is an adult. Never add age-down words (child, loli, shota, teen, school uniform, etc.).
- Do not add quality tags or style names.`

/** 한국어가 섞인 외형·장면·세부사항 → 영어 태그. 실패하면 원문을 그대로 쓴다(그림은 계속 만든다). */
export async function toImageTags(text: string, fallback?: Pick<LLMProvider, 'generateStructured'>): Promise<string> {
  // 11/9 운영 원인: 성인 외형 문장은 Gemini 가 content_blocked 로 막아 한국어 원문이 그림 모델로 갔다(머리·눈 색이 안 맞음).
  // 언베일 방이면 두 번째 시도를 언베일 모델(fallback)로, 아니면 같은 모델로 한 번 더. 원인은 로그에.
  const llms = [resolveLLM(), fallback ?? resolveLLM()]
  for (const [i, llm] of llms.entries()) {
    try {
      const { tags } = await llm.generateStructured({ task: 'image_prompt', promptVersion: 'modal-tags:v1', maxTokens: 2048, schema: Tags, system: SYSTEM, prompt: text })
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
- If the text clearly involves two people together (hug, kiss, holding hands), include that interaction.
- The character is an adult. Never add age-down words (child, loli, shota, teen, school uniform, etc.). No quality tags or style names.`

/** 11/3 사용자 고정 요구: 채팅 중 사진은 그 순간 맥락대로 — 최근 장면 글 → 자세·표정·옷·장소 태그. 실패하면 빈 값(외형·장소만으로 그린다). */
export async function toMomentTags(text: string, llm: Pick<LLMProvider, 'generateStructured'> = resolveLLM()): Promise<string> {
  try {
    const { tags } = await llm.generateStructured({ task: 'image_prompt', promptVersion: 'modal-moment:v1', maxTokens: 2048, schema: Tags, system: MOMENT_SYSTEM, prompt: text })
    return tags
  } catch { return '' }
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
