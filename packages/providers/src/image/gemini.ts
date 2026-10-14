import type { GeneratedImage, ImageProvider, ImageSpec, ProviderInfo } from '../types'

/** Reference bytes are supplied by the application, never fetched from model-authored URLs. */
export class GeminiImageProvider implements ImageProvider {
  readonly info: ProviderInfo
  constructor(private readonly key: string, private readonly model = 'gemini-nano-banana-2.1') {
    this.info = { mode: 'live', name: `gemini:${model}`, notice: null }
  }
  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { 'x-goog-api-key': this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, store: false,
        generation_config: { max_output_tokens: 2048, thinking_level: 'minimal' },
        input: [{ type: 'text', text: spec.prompt }, ...(spec.references ?? []).slice(0, 2).map(image => ({
          type: 'image', mime_type: image.mimeType, data: image.data,
        }))],
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: spec.aspect, image_size: '1K' },
      }),
    })
    if (!response.ok) throw new Error(`gemini image failed: ${response.status}`)
    const body = await response.json() as { output_image?: { data?: string; mime_type?: string }; outputs?: Array<{ type?: string; data?: string; mime_type?: string }>; steps?: Array<{ content?: Array<{ type?: string; data?: string; mime_type?: string }> }> }
    // REST returns content blocks; SDK convenience accessors are not assumed.
    const image = body.output_image ?? body.outputs?.find(item => item.type === 'image')
      ?? body.steps?.flatMap(step => step.content ?? []).filter(item => item.type === 'image').at(-1)
    if (!image?.data || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime_type ?? '')
      || image.data.length > 12_000_000) throw new Error('gemini image missing or invalid')
    return { url: `data:${image.mime_type};base64,${image.data}`, providerMetadata: { provider: 'gemini', model: this.model } }
  }
}
