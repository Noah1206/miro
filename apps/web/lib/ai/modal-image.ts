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
const SYSTEM = `You convert a character photo description into English Danbooru-style tags for an anime illustration model.
Rules:
- Output only comma-separated tags in English (no sentences), about 20-40 tags.
- Keep every fixed detail exactly: hair color/length/style, eye color, outfit, underwear color, accessories, marks. Do not change colors.
- Include place, time of day, mood and pose if given.
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
export async function generateModalImage(req: { style: string; tags: string; unveil: boolean; extraNeg?: string; seed?: number }): Promise<Buffer> {
  const res = await fetch(process.env.MIRO_IMAGE_URL!, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: process.env.MIRO_IMAGE_SECRET, style: req.style, tags: req.tags, unveil: req.unveil, extra_neg: req.extraNeg ?? '', seed: req.seed }),
    signal: AbortSignal.timeout(5 * 60_000),
  })
  if (!res.ok) throw new Error(`modal image ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { png } = (await res.json()) as { png?: string }
  if (!png) throw new Error('modal image: empty')
  return Buffer.from(png, 'base64')
}
