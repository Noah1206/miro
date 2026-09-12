import type { GeneratedImage, ImageProvider, ImageSpec, ProviderInfo } from '../types'

const ASPECT: Record<ImageSpec['aspect'], { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 896, height: 1152 },
  '16:9': { width: 1344, height: 768 },
}

/**
 * Replicate 이미지 Adapter.
 *
 * 얼굴 일관성(Face Cast)이 이 제품의 요구사항이므로, 모델은 `MIRO_IMAGE_MODEL` 로 바꿀 수 있게 둔다 —
 * 캐릭터별 LoRA 나 참조 이미지 모델로 갈아끼울 때 코드를 고치지 않는다.
 * 생성된 URL 은 Replicate 에서 일정 시간 뒤 만료되므로, 영구 보관이 필요하면
 * 호출측(simulation/media.ts)이 저장소로 옮긴다.
 */
export class ReplicateImageProvider implements ImageProvider {
  readonly info: ProviderInfo

  constructor(
    private readonly token: string,
    private readonly model = process.env.MIRO_IMAGE_MODEL ?? 'black-forest-labs/flux-schnell',
  ) {
    this.info = { mode: 'live', name: `replicate:${this.model}`, notice: null }
  }

  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    const size = ASPECT[spec.aspect]
    const res = await fetch(`https://api.replicate.com/v1/models/${this.model}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        // 완료까지 기다린다 — 폴링 루프를 우리 쪽에 두지 않는다.
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: spec.prompt,
          width: size.width,
          height: size.height,
          num_outputs: 1,
          // 같은 장면은 같은 그림이 나오도록 — 캐시 키와 결을 맞춘다.
          seed: spec.sceneKey ? seedOf(spec.sceneKey) : undefined,
        },
      }),
    })

    if (!res.ok) throw new Error(`replicate failed: ${res.status} ${await res.text().catch(() => '')}`)

    const body = (await res.json()) as { id?: string; status?: string; output?: unknown; error?: unknown }
    if (body.error) throw new Error(`replicate error: ${String(body.error)}`)

    const url = firstUrl(body.output)
    if (!url) throw new Error(`replicate returned no image (status: ${body.status ?? 'unknown'})`)

    return { url, providerMetadata: { provider: 'replicate', model: this.model, predictionId: body.id ?? null } }
  }
}

/** output 은 모델마다 문자열 / 문자열 배열 / {url} 로 온다. */
function firstUrl(output: unknown): string | null {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return firstUrl(output[0])
  if (output && typeof output === 'object' && 'url' in output) {
    const u = (output as { url: unknown }).url
    return typeof u === 'string' ? u : null
  }
  return null
}

function seedOf(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) % 2_147_483_647
}
