/**
 * 상황 사진 채우기 — 작품 갤러리(characters.images)에 올라가 있지만 상황 사진으로 등록되지 않은 사진을 비전 모델이 보고
 * '그 사진이 맞는 상황' 한 줄을 써서 characters.situation_images 뒤에 붙인다(이미 등록된 사진·사람이 쓴 설명은 그대로).
 * 언베일 사진(파일 이름 unveil-…)은 adult 표시 — 언베일이 켜진 턴에만 후보가 된다. 일반 사진은 모든 방에서 뜬다.
 * 11/11 엔 언베일만 넣었지만, 11/19 사용자: 일반 방(14세+)에도 사진이 사이사이 떠야 해서 일반 사진도 넣는다.
 * 사진은 맥 운영 저장소(MIRO_MEDIA_DIR, 기본 ~/miro-media)에서 바로 읽어 보낸다.
 *
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --test <slug> [장수]       # 몇 장 시험(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --plan                    # 작품·장수·예상 비용(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --apply --limit-usd 4     # 설명을 만들어 DB 반영
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const MODEL = process.env.CAPTION_MODEL ?? 'x-ai/grok-4.3'
const PRICE = { in: 3 / 1e6, out: 15 / 1e6 }   // 어림 — 실제 비용은 응답의 usage 로 센다
const POOL = 6

const SYSTEM = `너는 캐릭터 채팅 앱의 '상황별 사진' 설명을 쓴다. 사진 한 장을 보고, 대화 중 어떤 상황이 되었을 때 이 사진을 띄우면 맞는지 한국어 한 줄(60자 안팎, 최대 110자)로 쓴다.
- 작품 설정의 인물 묘사(머리색·눈·옷·나이대)와 사진 속 여자를 맞춰 보고, 확실히 맞으면 그 이름으로 쓴다. 확실하지 않으면 이름 대신 겉모습으로 쓴다(예: "분홍 머리 여자가").
- 어디인지·무엇을 하고 있는지·표정이나 감정이 드러나게(예: "체육관 탈의실에서 땀에 젖은 채 수건으로 몸을 닦으며 부끄러워할 때").
- 성인 장면이면 행위를 숨기지 말고 사실대로 짧게 쓴다. 미성년자처럼 쓰지 않는다(모든 인물은 성인).
- 겉모습은 머리색 하나 정도로 짧게. 괄호·'추정' 같은 말 없이, 80자 안에서 끝낸다.
- 설명·따옴표·번호 없이 그 한 줄만.`

const pathOf = (src: string) => src.split('?')[0]!
const isUnveil = (src: string) => /\/unveil-[^/?]+(\?|$)/.test(src)

async function dataUrl(src: string): Promise<string> {
  const rel = pathOf(src).replace(/^\/media\//, '')
  const file = resolve(process.env.MIRO_MEDIA_DIR || resolve(homedir(), 'miro-media'), rel)
  const type = /\.webp$/i.test(file) ? 'image/webp' : /\.png$/i.test(file) ? 'image/png' : 'image/jpeg'
  return `data:${type};base64,${(await readFile(file)).toString('base64')}`
}

// 11/19 OpenRouter 잔액이 바닥나 일반 사진은 Anthropic 으로(--anthropic). 언베일 사진은 OpenRouter(grok)로만.
const ANTHROPIC = process.argv.includes('--anthropic')
const ANTHROPIC_PRICE = { in: 3 / 1e6, out: 15 / 1e6 }   // sonnet 어림(haiku 는 11/19 시험에서 설명이 장황·추론 노출로 탈락)

async function captionAnthropic(src: string, work: Work): Promise<{ text: string; usd: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.CAPTION_ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 300, thinking: { type: 'between_tools' }, system: SYSTEM, messages: [
      { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: (await dataUrl(src)).slice(5).split(';')[0], data: (await dataUrl(src)).split(',')[1] } }, { type: 'text', text: `작품: ${work.name}\n\n작품 설정(인물):\n${work.context}` }] },
    ] }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`caption ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
  const text = (j.content?.find(c => c.type === 'text')?.text ?? '').replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
  return { text, usd: (j.usage?.input_tokens ?? 0) * ANTHROPIC_PRICE.in + (j.usage?.output_tokens ?? 0) * ANTHROPIC_PRICE.out }
}

// 11/19 사용자: 언베일 사진은 Gemini 로 — 공식 안전 설정(BLOCK_NONE)으로 성인 장면 필터를 끈다(--gemini, 언베일 사진만).
const GEMINI = process.argv.includes('--gemini')
const GEMINI_PRICE = { in: 0.5 / 1e6, out: 3 / 1e6 }   // flash 어림

async function captionGemini(src: string, work: Work): Promise<{ text: string; usd: number }> {
  const url = await dataUrl(src)
  const model = process.env.CAPTION_GEMINI_MODEL ?? 'gemini-3.8-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: url.slice(5).split(';')[0], data: url.split(',')[1] } }, { text: `작품: ${work.name}\n\n작품 설정(인물):\n${work.context}` }] }],
      safetySettings: ['HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_HARASSMENT'].map(category => ({ category, threshold: 'BLOCK_NONE' })),
      generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`caption ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; promptFeedback?: { blockReason?: string }; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }
  const c = j.candidates?.[0]
  const text = (c?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') ?? '').replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
  if (!text) throw new Error(`empty: ${j.promptFeedback?.blockReason ?? c?.finishReason ?? 'unknown'}`)
  const u = j.usageMetadata ?? {}
  return { text, usd: (u.promptTokenCount ?? 0) * GEMINI_PRICE.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * GEMINI_PRICE.out }
}

async function caption(src: string, work: Work): Promise<{ text: string; usd: number }> {
  if (GEMINI) return captionGemini(src, work)
  if (ANTHROPIC) return captionAnthropic(src, work)
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 200, temperature: 0.3, messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [{ type: 'text', text: `작품: ${work.name}\n\n작품 설정(인물):\n${work.context}` }, { type: 'image_url', image_url: { url: await dataUrl(src) } }] },
    ] }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`caption ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } }
  const text = (j.choices?.[0]?.message?.content ?? '').replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
  const usd = j.usage?.cost ?? ((j.usage?.prompt_tokens ?? 0) * PRICE.in + (j.usage?.completion_tokens ?? 0) * PRICE.out)
  return { text, usd }
}

/** 작품 설정에서 인물 묘사 부분만(프로필 + 사람들/히로인 칸) — 사진 속 여자가 누구인지 맞추는 데 쓴다. */
function contextOf(personality: string): string {
  const secs = [...personality.matchAll(/\[([^\]]+)\]\n([\s\S]*?)(?=\n\[|$)/g)]
  const pick = secs.filter(([, h]) => /프로필|사람들|이모들|모녀|요정들|히로인|사모님|회원들|주변 인물|^[가-힣]{1,4}$/.test(h!))
  return (pick.length ? pick : secs.slice(0, 1)).map(([, h, b]) => `[${h}]\n${b!.trim()}`).join('\n').slice(0, 1500)
}

type Work = { id: string; slug: string; name: string; images: string[]; context: string }

const { db, characters, sql } = await import('@miro/db')
const ai = JSON.parse(await readFile(new URL('../lib/editorial/official-ai.json', import.meta.url), 'utf8')) as Record<string, { personality?: string }>
const rows = await db.select({ id: characters.id, slug: characters.slug, name: characters.name, images: characters.images, situationImages: characters.situationImages, personality: characters.personality })
  .from(characters).where(sql`${characters.isPublic} and ${characters.deletedAt} is null and ${characters.audience} = 'male' and ${characters.slug} like 'official-m-%'`)
const works: Work[] = rows.map(r => {
  const have = new Set((r.situationImages ?? []).map(e => pathOf(e.image)))
  return { id: r.id, slug: r.slug ?? '', name: r.name, images: (r.images ?? []).filter(src => !have.has(pathOf(src)) && !(ANTHROPIC && isUnveil(src)) && !(GEMINI && !isUnveil(src))),
    context: contextOf(ai[r.slug ?? '']?.personality ?? r.personality ?? '') }
}).filter(w => w.images.length)

const argv = process.argv.slice(2)
if (argv[0] === '--test') {
  const w = works.find(x => x.slug === argv[1]) ?? works.find(x => x.slug === `official-m-${argv[1]}`)
  if (!w) { console.log('no unregistered photos for', argv[1]); process.exit(0) }
  const n = Number(argv[2] ?? 3)
  const sample = [...w.images.filter(s => !isUnveil(s)).slice(0, n), ...w.images.filter(isUnveil).slice(0, 1)]
  for (const src of sample) console.log(JSON.stringify({ src: src.split('/').pop(), ...(await caption(src, w)) }))
  process.exit(0)
}

const total = works.reduce((n, w) => n + w.images.length, 0)
console.log(JSON.stringify({ works: works.length, photos: total, daily: works.reduce((n, w) => n + w.images.filter(s => !isUnveil(s)).length, 0), estimateUSD: +(total * 0.006).toFixed(2), list: works.map(w => `${w.slug.slice(11)}:${w.images.length}`) }))
if (!argv.includes('--apply')) process.exit(0)

const limit = Number(argv[argv.indexOf('--limit-usd') + 1] ?? 4)
let spent = 0, done = 0, added = 0
for (const w of works) {
  if (spent > limit - 0.1) { console.log(JSON.stringify({ stop: 'limit', spent })); break }
  const entries: Array<{ keywords: string[]; image: string; situation: string; adult?: true }> = []
  const queue = [...w.images]
  await Promise.all(Array.from({ length: POOL }, async () => {
    for (let src = queue.shift(); src; src = queue.shift()) {
      if (spent > limit - 0.1) return
      try {
        const { text, usd } = await caption(src, w)
        spent += usd
        if (text) entries.push({ keywords: [], image: src, situation: text, ...(isUnveil(src) ? { adult: true as const } : {}) })
      } catch (e) { console.log(JSON.stringify({ skip: src.slice(-40), error: (e as Error).message.slice(0, 120) })) }
    }
  }))
  entries.sort((a, b) => w.images.indexOf(a.image) - w.images.indexOf(b.image))
  if (entries.length) {
    // 그사이 같은 사진이 등록됐으면 빼고 붙인다(사람이 쓴 설명을 덮지 않는다).
    await db.update(characters).set({ situationImages: sql`${characters.situationImages} || (
      select coalesce(jsonb_agg(n), '[]'::jsonb) from jsonb_array_elements(${JSON.stringify(entries)}::jsonb) n
      where not exists (select 1 from jsonb_array_elements(${characters.situationImages}) o where split_part(o->>'image', '?', 1) = split_part(n->>'image', '?', 1)))` })
      .where(sql`${characters.id} = ${w.id}`)
    done++; added += entries.length
  }
  console.log(JSON.stringify({ slug: w.slug.slice(11), captioned: entries.length, of: w.images.length, spent: +spent.toFixed(3), sample: entries[0]?.situation }))
}
console.log(JSON.stringify({ worksUpdated: done, added, spentUSD: +spent.toFixed(3) }))
process.exit(0)
