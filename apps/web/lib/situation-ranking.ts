import { cosine, embedForPhotos } from './ai/embeddings'
import type { SituationImage } from './situation-images'

/**
 * 11/18 사진이 많은 작품 — 상황 설명마다 임베딩을 한 번 만들어 서버 메모리에 두고, 매 턴 최근 대화 하나만 임베딩해 뜻이 가까운 순서(순번 목록)를 돌려준다.
 * 엔진이 이 순서로 30장을 추려 지시에 싣는다. 처음 보는 작품은 설명 임베딩을 이 자리에서 만들고(최대 2.5초), 넘거나 실패하면 null — 그 턴은 글자 겹침으로.
 * ponytail: 메모리 캐시라 서버를 다시 켜면 다시 만든다(1000장 ≈ $0.0003). 여러 서버로 늘면 DB 칸으로 옮긴다.
 */
const docVectors = new Map<string, number[] | Promise<null>>()
const DOC_CACHE_MAX = 30_000 // 256차원 × 3만 ≈ 60MB
const docText = (e: SituationImage) => [e.situation, e.keywords.join(', ')].filter(Boolean).join(' / ')

export async function rankSituationImages(entries: SituationImage[], query: string, threshold = 30): Promise<number[] | null> {
  if (entries.length <= threshold || !query.trim()) return null
  const texts = [...new Set(entries.map(docText))]
  const missing = texts.filter(t => !docVectors.has(t))
  // 64개씩 동시에 — 256개 한 묶음은 3.6초, 64개는 1.8초(11/18 실측).
  for (let i = 0; i < missing.length; i += 64) {
    const chunk = missing.slice(i, i + 64)
    const job: Promise<null> = embedForPhotos(chunk, 'document', 20_000).then(v => { chunk.forEach((t, k) => v ? docVectors.set(t, v[k]!) : docVectors.delete(t)); return null })
    chunk.forEach(t => docVectors.set(t, job))
  }
  while (docVectors.size > DOC_CACHE_MAX) docVectors.delete(docVectors.keys().next().value!)
  const ready = (t: string) => { const v = docVectors.get(t); return Array.isArray(v) ? v : null }
  const pending = [...new Set(texts.map(t => docVectors.get(t)).filter((v): v is Promise<null> => v instanceof Promise))]
  const [q] = await Promise.all([
    embedForPhotos([query], 'query'),
    pending.length ? Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, 2500))]) : null,
  ])
  if (!q?.[0] || texts.some(t => !ready(t))) return null
  const qv = q[0]
  return entries.map((e, i) => ({ i, s: cosine(qv, ready(docText(e))!) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.i)
}
