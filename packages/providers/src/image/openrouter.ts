import type { GeneratedImage, ImageProvider, ImageSpec, ProviderInfo } from '../types'

/**
 * 11/24 사용자: 문자 사진도 OpenRouter 로 — 같은 모델(gemini-nano-banana-2.1)을 OpenRouter 의 이미지 API(/api/v1/images)로 부른다.
 * 학습에 쓰지 않는 공급자에게만(data_collection deny). 참조 사진은 앱이 넘긴 바이트만 쓴다.
 */
export class OpenRouterImageProvider implements ImageProvider {
  readonly info: ProviderInfo
  constructor(private readonly key: string, private readonly model = 'google/gemini-nano-banana-2.1') {
    this.info = { mode: 'live', name: `openrouter:${model}`, notice: null }
  }
  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: spec.prompt, aspect_ratio: spec.aspect, resolution: '1K', provider: { data_collection: 'deny' },
        input_references: (spec.references ?? []).slice(0, 2).map(image => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } })),
      }),
    })
    if (!response.ok) throw new Error(`openrouter image failed: ${response.status}`)
    const body = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string }> }
    const image = body.data?.[0]
    if (!image?.b64_json || !['image/jpeg', 'image/png', 'image/webp'].includes(image.media_type ?? '')
      || image.b64_json.length > 12_000_000) throw new Error('openrouter image missing or invalid')
    return { url: `data:${image.media_type};base64,${image.b64_json}`, providerMetadata: { provider: 'openrouter', model: this.model } }
  }
}
