/**
 * 11/11 상황 사진 채우기 — 작품의 언베일 사진(사용자 결정: 언베일만)을 비전 모델이 보고 '그 사진이 맞는 상황' 한 줄을 써서 characters.situation_images 로.
 * 언베일 사진(파일 이름 unveil-…)은 adult 표시 — 언베일이 켜진 턴에만 후보가 된다. 이미 상황 사진이 있는 작품은 건너뛴다.
 *
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --test <url>...        # 두세 장 시험(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --plan                  # 작품·장수·예상 비용(쓰기 없음)
 *   npx tsx --env-file=../../.env scripts/situation-captions.mts --apply --limit-usd 4   # 설명을 만들어 DB 반영
 */
const MODEL = process.env.CAPTION_MODEL ?? 'x-ai/grok-4.3'
const PER_WORK = 40   // ponytail: 작품당 최대 40장(턴마다 AI 가 후보 목록을 읽는다) — 더 필요하면 늘린다
const PRICE = { in: 3 / 1e6, out: 15 / 1e6 }   // 어림 — 실제 비용은 응답의 usage 로 센다

const SYSTEM = `너는 캐릭터 채팅 앱의 '상황별 사진' 설명을 쓴다. 사진 한 장을 보고, 대화 중 어떤 상황이 되었을 때 이 사진을 띄우면 맞는지 한국어 한 줄(60자 안팎, 최대 110자)로 쓴다.
- 작품 이름·인물 이름이 주어지면 그 이름으로 쓴다(사진 속 여자가 누구인지 모르면 '그녀').
- 무엇을 하고 있는지·어디인지·어떤 순간인지가 드러나게(예: "체육관 탈의실에서 땀에 젖은 채 수건으로 몸을 닦을 때").
- 성인 장면이면 행위를 숨기지 말고 사실대로 짧게 쓴다. 미성년자처럼 쓰지 않는다(모든 인물은 성인).
- 설명·따옴표·번호 없이 그 한 줄만.`

type Work = { id: string; slug: string; name: string; images: string[]; heroines: string }

async function caption(url: string, work: { name: string; heroines: string }): Promise<{ text: string; usd: number }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 200, temperature: 0.3, messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [{ type: 'text', text: `작품: ${work.name}${work.heroines ? `\n인물: ${work.heroines}` : ''}` }, { type: 'image_url', image_url: { url } }] },
    ] }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`caption ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } }
  const text = (j.choices?.[0]?.message?.content ?? '').replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120)
  const usd = j.usage?.cost ?? ((j.usage?.prompt_tokens ?? 0) * PRICE.in + (j.usage?.completion_tokens ?? 0) * PRICE.out)
  return { text, usd }
}

const argv = process.argv.slice(2)
if (argv[0] === '--test') {
  for (const url of argv.slice(1)) console.log(JSON.stringify(await caption(url, { name: '시험', heroines: '' })))
  process.exit(0)
}

const { db, characters, eq, sql } = await import('@miro/db')
const rows = await db.select({ id: characters.id, slug: characters.slug, name: characters.name, images: characters.images, secret: characters.secret })
  .from(characters).where(sql`${characters.isPublic} and ${characters.deletedAt} is null and ${characters.audience} = 'male' and jsonb_array_length(${characters.situationImages}) = 0 and ${characters.slug} like 'official-m-%'`)
// 11/11 사용자: 상황 사진은 이미 만든 언베일 사진만 쓴다(일반 사진은 넣지 않음).
const works: Work[] = rows.map(r => ({ id: r.id, slug: r.slug ?? '', name: r.name, images: (r.images ?? []).filter(src => /\/unveil-[^/?]+(\?|$)/.test(src)).slice(0, PER_WORK),
  heroines: /\[여러 인물[^\]]*\]([\s\S]*)/.exec(r.secret ?? '')?.[1]?.split('\n').map(l => l.replace(/^[\s\-•*·\d.)]*/, '').split(/[\s(:—-]/)[0]).filter(n => n && n.length <= 6).slice(0, 8).join(', ') ?? '' }))
  .filter(w => w.images.length)
const total = works.reduce((n, w) => n + w.images.length, 0)
console.log(JSON.stringify({ works: works.length, photos: total, estimateUSD: +(total * 0.004).toFixed(2), list: works.map(w => `${w.slug}:${w.images.length}`) }))
if (!argv.includes('--apply')) process.exit(0)

const limit = Number(argv[argv.indexOf('--limit-usd') + 1] ?? 4)
let spent = 0, done = 0
for (const w of works) {
  const entries: Array<{ keywords: string[]; image: string; situation: string; adult?: true }> = []
  for (const image of w.images) {
    if (spent > limit - 0.05) { console.log(JSON.stringify({ stop: 'limit', spent })); break }
    try {
      const { text, usd } = await caption(image, w)
      spent += usd
      if (text) entries.push({ keywords: [], image, situation: text, ...(/\/unveil-[^/?]+(\?|$)/.test(image) ? { adult: true as const } : {}) })
    } catch (e) { console.log(JSON.stringify({ skip: image.slice(-40), error: (e as Error).message.slice(0, 120) })) }
  }
  if (entries.length) {
    // 그사이 사람이 상황 사진을 넣었으면 덮어쓰지 않는다.
    await db.update(characters).set({ situationImages: entries }).where(sql`${characters.id} = ${w.id} and jsonb_array_length(${characters.situationImages}) = 0`)
    done++
  }
  console.log(JSON.stringify({ slug: w.slug, captioned: entries.length, of: w.images.length, spent: +spent.toFixed(3), sample: entries[0]?.situation }))
  if (spent > limit - 0.05) break
}
console.log(JSON.stringify({ worksUpdated: done, spentUSD: +spent.toFixed(3) }))
process.exit(0)
void eq
