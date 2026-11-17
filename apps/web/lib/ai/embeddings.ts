import { EXPLICIT } from '@/lib/simulation/unveil-bridge'

/**
 * 기억 의미 검색용 임베딩(11/3) — Gemini gemini-embedding-001, 256차원. 키는 대화에 쓰는 GEMINI_API_KEY 그대로.
 * 언베일 원문처럼 노골적인 글은 상용 공급자로 보내지 않는다(그 기억은 낱말 검색만).
 * 실패·시간 초과면 null — 검색은 낱말 일치로 돌아간다(답을 늦추지 않게 1.5초).
 */
const MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIM = 256

export const embeddable = (text: string) => !!text.trim() && !EXPLICIT.test(text)

export async function embedTexts(texts: string[], task: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key || !texts.length) return null
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ requests: texts.map(text => ({ model: `models/${MODEL}`, content: { parts: [{ text: text.slice(0, 2000) }] }, taskType: task, outputDimensionality: EMBEDDING_DIM })) }),
    })
    if (!res.ok) return null
    const { embeddings } = await res.json() as { embeddings?: Array<{ values?: number[] }> }
    const out = embeddings?.map(e => e.values ?? [])
    return out && out.length === texts.length && out.every(v => v.length === EMBEDDING_DIM) ? out : null
  } catch { return null }
}

/**
 * 11/18 상황별 사진 뜻 검색용 — OpenRouter bge-m3(256차원, 데이터 수집 거부). 언베일 방의 노골적인 글도 보낼 수 있는 길이라
 * (언베일 대화가 원래 OpenRouter 로 간다) 일반·언베일 사진을 한 모델로 맞춘다. 실패·시간 초과면 null.
 * 11/18 비교(한국어 동의어 6문항 1위 정답 / 질의 속도): qwen3-8b 6/6·2.9~8.5초(매 턴엔 느림), bge-m3 5/6(놓친 것도 4위)·0.5~1초, qwen3-4b 4/6, OpenAI 3-small 1/6.
 */
const OR_EMBED_MODEL = 'baai/bge-m3'
export async function embedForPhotos(texts: string[], kind: 'query' | 'document', timeoutMs = 4000): Promise<number[][] | null> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key || !texts.length) return null
  const input = texts.map(t => t.slice(0, kind === 'query' ? 2000 : 500))
  try {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: OR_EMBED_MODEL, input, dimensions: EMBEDDING_DIM, provider: { data_collection: 'deny' } }),
    })
    if (!res.ok) return null
    const { data } = await res.json() as { data?: Array<{ embedding?: number[]; index?: number }> }
    const out = data?.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(d => d.embedding ?? [])
    return out && out.length === texts.length && out.every(v => v.length === EMBEDDING_DIM) ? out : null
  } catch { return null }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
