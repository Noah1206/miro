/**
 * Modal 그림 생성(11/2) — 오늘 학습한 LoRA(남성향 gda_v3 / 여성향 whif_v1)를 쓰는 Modal 앱 miro-lora-test 의 image_api.
 * 일반·언베일 사진 모두 이 경로(RunPod 은 학습한 모델이 없어 쓰지 않는다). 그림체 설정은 tooling/image/studio_presets.json.
 * env: MIRO_IMAGE_URL(image_api 주소), MIRO_IMAGE_SECRET(Modal Secret 'miro-image-api' 와 같은 값).
 */
import { z } from 'zod'
import { resolveLLM } from '@miro/providers'

export function modalImageReady() {
  return !!(process.env.MIRO_IMAGE_URL && process.env.MIRO_IMAGE_SECRET)
}

/** 캐릭터 대상 → 그림체. 남성향 캐릭터(여자)는 가다공, 여성향 캐릭터(남자)는 위프 — 남자 중심. */
export const styleFor = (audience: 'male' | 'female') => (audience === 'male' ? 'gda' : 'whif')

const Tags = z.object({ tags: z.string().max(1200) })
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
export async function toImageTags(text: string): Promise<string> {
  try {
    const { tags } = await resolveLLM().generateStructured({ task: 'image_prompt', promptVersion: 'modal-tags:v1', maxTokens: 600, schema: Tags, system: SYSTEM, prompt: text })
    return tags
  } catch {
    return text
  }
}

/** PNG 바이트. 첫 장은 GPU 준비로 1~2분 걸릴 수 있다. */
/** look = 캐릭터 외형 태그(주인공 바로 뒤에 붙는다 — 상대 인물에게 섞이지 않게), tags = 장면·수위. */
/** refUrl = 캐릭터 대표 사진(공개 버킷) — 얼굴·머리·그림체를 그 사진에 맞춘다(11/2). */
export async function generateModalImage(req: { style: string; look?: string; tags: string; unveil: boolean; couple?: boolean; extraNeg?: string; seed?: number; refUrl?: string }): Promise<Buffer> {
  const res = await fetch(process.env.MIRO_IMAGE_URL!, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.MIRO_IMAGE_SECRET, style: req.style, look: req.look ?? '', tags: req.tags, unveil: req.unveil, couple: !!req.couple,
      extra_neg: req.extraNeg ?? '', seed: req.seed, ref_url: req.refUrl ?? '' }),
    signal: AbortSignal.timeout(5 * 60_000),
  })
  if (!res.ok) throw new Error(`modal image ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { png } = (await res.json()) as { png?: string }
  if (!png) throw new Error('modal image: empty')
  return Buffer.from(png, 'base64')
}
