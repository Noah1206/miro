/**
 * 로컬 Stable Diffusion WebUI(A1111/Forge, --api) 로 그림 한 장 — 베이스 모델 하나를 띄워 두고
 * 작품마다 그림체 LoRA 태그(<lora:이름:세기>)를 프롬프트 앞에 붙여 바꾼다.
 * ponytail: PC 한 대(RTX 2070, 한 번에 한 장) 기준. 사용자가 늘면 SD_WEBUI_URL 을 GPU 서버로 바꾼다.
 */

import { mentionsMinor } from '@miro/domain'

const SD_WEBUI_URL = process.env.SD_WEBUI_URL ?? 'http://127.0.0.1:7860'

/** 언베일 사진 공급자가 설정됐는가 — RunPod 서버리스(우선) 또는 직접 띄운 WebUI. 없으면 언베일 사진은 기존 공급자로 돈다. */
export function openImageReady() {
  return !!(process.env.RUNPOD_SD_ENDPOINT_ID && process.env.RUNPOD_API_KEY) || !!process.env.SD_WEBUI_URL
}

/** 언베일 수위 → 프롬프트 태그. 최대 수위는 MIRO_UNVEIL_IMAGE_MAX_LEVEL(soft|deep|explicit, 기본 explicit)로 운영자가 낮출 수 있다. */
export type UnveilLevel = 'soft' | 'deep' | 'explicit'
const LEVELS: UnveilLevel[] = ['soft', 'deep', 'explicit']
const LEVEL_TAGS: Record<UnveilLevel, { mature: boolean; positive: string; negative: string }> = {
  soft: { mature: false, positive: 'suggestive, alluring, clothed', negative: 'nsfw, nude, nipples, genitals' },
  deep: { mature: true, positive: 'sensual, partially undressed, intimate mood', negative: 'genitals, explicit sex' },
  explicit: { mature: true, positive: 'nsfw', negative: '' },
}
export function cappedLevel(level: UnveilLevel): UnveilLevel {
  const max = (process.env.MIRO_UNVEIL_IMAGE_MAX_LEVEL ?? 'explicit') as UnveilLevel
  const cap = LEVELS.includes(max) ? LEVELS.indexOf(max) : 0
  return LEVELS[Math.min(LEVELS.indexOf(level), cap)]!
}
export const levelTags = (level: UnveilLevel) => LEVEL_TAGS[cappedLevel(level)]

// 안전장치(필수, 10/19): 유저 요청 글에 미성년 신호나 실존 인물·실사 사진 요청이 있으면 그리지 않는다.
const MINOR_EN = /\b(child|kid|loli|shota|teen(?:ager)?|underage|minor|schoolgirl|schoolboy|student|young boy|young girl|preteen|elementary|middle school|high school)\b/i
const REAL_PERSON = /(https?:\/\/|실존|연예인|아이돌|배우 .{1,6} 얼굴|실제 사람|내 사진|이 사진|real person|celebrity|photo of me|my face|this photo|deepfake)/i
export function unsafeRequest(text: string | null | undefined): 'minor' | 'real_person' | null {
  if (!text) return null
  if (mentionsMinor(text) || MINOR_EN.test(text)) return 'minor'
  if (REAL_PERSON.test(text)) return 'real_person'
  return null
}

/** 베이스 모델 — 체크포인트 파일 이름(models/Stable-diffusion)과 그 모델이 알아듣는 품질 단어가 다르다. */
export const BASE_MODELS = {
  pony: {
    checkpoint: 'ponyDiffusionV6XL',
    quality: 'score_9, score_8_up, score_7_up, source_anime',
    negative: 'score_4, score_5, score_6',
    safe: 'rating_safe',
    mature: 'rating_explicit',
    sampler: 'DPM++ 2M',
    cfg: 7,
  },
  illustrious: {
    checkpoint: 'waiIllustriousSDXL_v170',
    quality: 'masterpiece, best quality, amazing quality, very aesthetic',
    negative: 'bad quality, worst quality, worst detail, sketch, censor',
    safe: 'general',
    mature: 'explicit',
    sampler: 'Euler a',
    cfg: 6,
  },
} as const
export type BaseModel = keyof typeof BASE_MODELS

/** 그림체 → LoRA 파일 이름(models/Lora) + 발동 단어. LoRA 는 학습된 베이스 모델에서만 맞는다. */
// Civitai 버전 id: pony_manhwa_general=736932, pony_manhwa_leaf=638295, il_manhwa_artstyle=1916902, il_manhwa_leaf=1124857
export const STYLE_LORAS = {
  ponyManhwaGeneral: { base: 'pony', lora: 'pony_manhwa_general', weight: 0.8, trigger: 'mfant' },
  ponyManhwaLeaf: { base: 'pony', lora: 'pony_manhwa_leaf', weight: 0.8, trigger: 'Manhwa' },
  ilManhwaArtstyle: { base: 'illustrious', lora: 'il_manhwa_artstyle', weight: 0.8, trigger: 'manhwa-artstyle' },
  ilManhwaLeaf: { base: 'illustrious', lora: 'il_manhwa_leaf', weight: 0.8, trigger: 'manhwa' },
} as const
export type ImageStyle = keyof typeof STYLE_LORAS

// 성인 남성만 — 어려 보이는 그림이 나오지 않게 항상 넣는다.
const ADULT_ONLY = 'adult, mature male, 1boy'
const NO_MINORS = 'child, loli, shota, young, teen, aged down, childlike, baby face, school uniform, petite, flat chest, small body, lowres, bad anatomy, text, watermark'

export type LocalImageRequest = {
  model: BaseModel
  /** 없으면 베이스 모델 기본 그림체. */
  style?: ImageStyle
  prompt: string
  /** 캐릭터 나이 — 19 미만이거나 모르면 그리지 않는다(학생 캐릭터 차단). */
  characterAge: number | null
  /** 언베일(성인 모드) 대화방에서만 true. */
  mature: boolean
  /** 언베일 수위 — 있으면 mature 대신 이 값(운영자 상한 적용)으로 태그를 정한다. */
  level?: UnveilLevel
  width?: number
  height?: number
  seed?: number
}

export function buildPrompt(req: LocalImageRequest): { prompt: string; negative: string } {
  if (req.characterAge == null || !(req.characterAge >= 19)) throw new Error('성인 캐릭터만 그릴 수 있어요')
  const m = BASE_MODELS[req.model]
  const s = req.style ? STYLE_LORAS[req.style] : null
  if (s && s.base !== req.model) throw new Error(`${req.style} 그림체는 ${s.base} 모델 전용이에요`)
  const lora = s ? `<lora:${s.lora}:${s.weight}>, ${s.trigger}, ` : ''
  if (req.level) {
    const tag = levelTags(req.level)
    return {
      prompt: `${lora}${m.quality}, ${tag.mature ? m.mature : m.safe}, ${ADULT_ONLY}, ${tag.positive}, ${req.prompt}`,
      negative: [m.negative, NO_MINORS, tag.negative].filter(Boolean).join(', '),
    }
  }
  return {
    prompt: `${lora}${m.quality}, ${req.mature ? m.mature : m.safe}, ${ADULT_ONLY}, ${req.prompt}`,
    negative: `${m.negative}, ${NO_MINORS}${req.mature ? '' : ', nsfw, nude'}`,
  }
}

/** PNG 바이트를 돌려준다. WebUI 가 꺼져 있으면 fetch 가 실패한다. */
export async function generateLocalImage(req: LocalImageRequest): Promise<Buffer> {
  const { prompt, negative } = buildPrompt(req)
  const m = BASE_MODELS[req.model]
  const payload = {
      prompt,
      negative_prompt: negative,
      width: req.width ?? 832,
      height: req.height ?? 1216,
      steps: 28,
      cfg_scale: m.cfg,
      sampler_name: m.sampler,
      seed: req.seed ?? -1,
      override_settings: { sd_model_checkpoint: m.checkpoint, CLIP_stop_at_last_layers: 2 },
  }
  // RunPod 서버리스(공식 worker-a1111): input 이 그대로 /sdapi/v1/txt2img 로 가고, output 이 그 응답이다.
  const runpod = process.env.RUNPOD_SD_ENDPOINT_ID && process.env.RUNPOD_API_KEY
  const res = runpod
    ? await fetch(`https://api.runpod.ai/v2/${process.env.RUNPOD_SD_ENDPOINT_ID}/runsync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RUNPOD_API_KEY}` },
        body: JSON.stringify({ input: payload }),
        signal: AbortSignal.timeout(5 * 60_000),
      })
    : await fetch(`${SD_WEBUI_URL}/sdapi/v1/txt2img`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10 * 60_000),
      })
  if (!res.ok) throw new Error(`SD ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { images?: string[]; status?: string; output?: { images?: string[] } }
  if (runpod && body.status !== 'COMPLETED') throw new Error(`RunPod ${body.status ?? 'unknown'}`)
  const [image] = (runpod ? body.output?.images : body.images) ?? []
  if (!image) throw new Error('SD WebUI 가 그림을 돌려주지 않았어요')
  return Buffer.from(image, 'base64')
}
