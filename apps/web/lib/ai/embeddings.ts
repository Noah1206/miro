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

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
