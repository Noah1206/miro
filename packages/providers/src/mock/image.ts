import type { GeneratedImage, ImageProvider, ImageSpec, ProviderInfo } from '../types'

/** 결정적 placeholder. 같은 sceneKey 면 같은 이미지가 나와 캐시 동작을 검증할 수 있다. */
export class MockImageProvider implements ImageProvider {
  readonly info: ProviderInfo = {
    mode: 'mock',
    name: 'mock-image',
    notice: 'Image Provider 미구성 — 자리표시 이미지입니다.',
  }

  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    const seed = hash(spec.sceneKey ?? spec.prompt)
    return {
      url: `/mock-media/${seed}.svg`,
      providerMetadata: { mock: true, seed, aspect: spec.aspect },
    }
  }
}

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}
