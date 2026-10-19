/**
 * 로컬 Stable Diffusion WebUI(A1111/Forge, --api) 로 그림 한 장 — 베이스 모델 하나를 띄워 두고
 * 작품마다 그림체 LoRA 태그(<lora:이름:세기>)를 프롬프트 앞에 붙여 바꾼다.
 * ponytail: PC 한 대(RTX 2070, 한 번에 한 장) 기준. 사용자가 늘면 SD_WEBUI_URL 을 GPU 서버로 바꾼다.
 */

const SD_WEBUI_URL = process.env.SD_WEBUI_URL ?? 'http://127.0.0.1:7860'

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
const NO_MINORS = 'child, loli, shota, young, teen, school uniform, petite, lowres, bad anatomy, text, watermark'

export type LocalImageRequest = {
  model: BaseModel
  /** 없으면 베이스 모델 기본 그림체. */
  style?: ImageStyle
  prompt: string
  /** 캐릭터 나이 — 19 미만이거나 모르면 그리지 않는다(학생 캐릭터 차단). */
  characterAge: number | null
  /** 언베일(성인 모드) 대화방에서만 true. */
  mature: boolean
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
  return {
    prompt: `${lora}${m.quality}, ${req.mature ? m.mature : m.safe}, ${ADULT_ONLY}, ${req.prompt}`,
    negative: `${m.negative}, ${NO_MINORS}${req.mature ? '' : ', nsfw, nude'}`,
  }
}

/** PNG 바이트를 돌려준다. WebUI 가 꺼져 있으면 fetch 가 실패한다. */
export async function generateLocalImage(req: LocalImageRequest): Promise<Buffer> {
  const { prompt, negative } = buildPrompt(req)
  const m = BASE_MODELS[req.model]
  const res = await fetch(`${SD_WEBUI_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: negative,
      width: req.width ?? 832,
      height: req.height ?? 1216,
      steps: 28,
      cfg_scale: m.cfg,
      sampler_name: m.sampler,
      seed: req.seed ?? -1,
      override_settings: { sd_model_checkpoint: m.checkpoint, CLIP_stop_at_last_layers: 2 },
    }),
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (!res.ok) throw new Error(`SD WebUI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const [image] = ((await res.json()) as { images?: string[] }).images ?? []
  if (!image) throw new Error('SD WebUI 가 그림을 돌려주지 않았어요')
  return Buffer.from(image, 'base64')
}
