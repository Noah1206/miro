import { PHOTO_TAGS, normalizePhotoTags } from '@miro/config'
import { PUBLIC_BUCKET, mediaType, publicMediaName, readMedia } from './storage/media'

/**
 * 11/23 사진 자동 태그 — 제작자가 상황 사진을 올리면 비전 AI 가 사진을 보고 태그(@miro/config PHOTO_TAGS)·옷차림 단계·한 줄 설명을 붙인다.
 * 대화 AI 는 그 태그로 사진을 고른다(engine photoTagMode). 사용자: "사진 올리면 자동으로 태그 붙게 해줘".
 * Gemini 한 곳으로만 보낸다(성인 장면 필터 끔 — scripts/situation-captions.mts 와 같은 설정). 막히거나 실패하면 null(제작자가 직접 쓴다) —
 * 올린 사진이 가는 곳은 처리방침 국외 이전 표(lib/legal/transfer-table.ts)에 적힌 Google 뿐이어야 하므로 다른 공급자로 넘기지 않는다.
 * ponytail: 공급자를 직접 부른다(운영 예산·사용량 기록 밖) — 회원당 한도(create/actions tagSituationImage)로만 막는다. 양이 늘면 orchestrator 로 옮긴다.
 */
/** 11/23 Gemini 가 429(월 지출 한도·속도 제한)를 돌려준 적이 있는가 — 한도에 걸린 채 수백 장을 계속 부르다 운영 키까지 막히지 않게 일괄 작업이 확인한다. */
export const photoTagQuota = { hit: false }

export type PhotoTagging = { tags: string[]; outfit: 'dressed' | 'bare'; adult: boolean; situation: string }

export const PHOTO_TAG_SYSTEM = `너는 캐릭터 채팅 앱의 상황 사진에 태그를 붙인다. 사진 한 장을 보고 JSON 하나만 답한다(설명·코드펜스 없이):
{"tags":["…"],"outfit":"dressed|underwear|nude","explicit":true|false,"situation":"…"}
- tags: 아래 목록에서 이 사진에 가장 맞는 것을 1~3개, 목록의 글자 그대로. 사진의 핵심(무슨 행위·표정인가)부터 쓴다. 목록에 맞는 게 전혀 없을 때만 8자 이하의 새 태그 하나.
  · 행위(애무·봉사·체위·마무리)가 보이면 그 태그만 쓴다. 그때는 '유혹 포즈·가슴 노출·알몸·엉덩이·속옷 차림' 같은 노출 태그를 붙이지 않는다 — 노출 태그는 행위 없이 혼자 보여 주는 사진에만.
  · 체위: 여자가 위에 올라타 남자를 마주 보면 기승위, 올라타 등을 보이면 역기승위, 엎드리거나 네 발로 뒤에서 받으면 후배위(완전히 엎드려 누웠으면 엎드려), 누워서 마주 보면 정상위, 다리를 머리 쪽으로 접혀 눌리면 교배 프레스, 서서 뒤에서 받으면 서서 뒤로, 옆으로 누우면 측위, 마주 앉아 안기면 대면좌위, 들려 안긴 채면 들어서.
  · 절정은 눈이 풀리거나 몸을 젖히며 절정하는 게 분명할 때, 시오후키는 물줄기가 뿜어지는 게 분명히 보일 때만. 사정은 정액이 보일 때만(안·입·몸).
  · 땀이나 윤기 나는 피부는 목욕·샤워가 아니다 — 욕실·욕조·샤워기·물줄기가 보일 때만 목욕·샤워.
  · 남자가 둘 이상이면 '여러 명'을 함께. 감정 태그(평소~졸림)는 옷을 입은 일상 사진에만, 성적인 사진의 표정은 '달아오름' 하나로.
  · 제작자가 적은 설명이 함께 오면 참고한다 — 그림과 맞으면 그 행위를 태그로 삼고, 그림과 다르면 그림을 따른다.
- outfit: 주인공이 겉옷을 입고 있으면 dressed(수영장·바닷가의 수영복, 운동복처럼 그 자리에 맞는 차림도 dressed), 속옷·란제리만이면 underwear, 가슴이나 아래가 드러났으면 nude.
- explicit: 성기·유두 노출, 성행위·애무·사정 장면이면 true.
- situation: 대화 중 어떤 상황이 되었을 때 이 사진을 띄우면 맞는지 한국어 한 줄(60자 안팎). 어디서 무엇을 하는지·표정이 드러나게 "…할 때"로 끝낸다. 인물 이름·괄호 없이. 모든 인물은 성인이다.
태그 목록:
${Object.entries(PHOTO_TAGS).map(([group, tags]) => `${group}: ${tags.join(', ')}`).join('\n')}`

/** 모델 답(JSON) → 저장할 값. 태그가 하나도 없으면 null. */
export function parsePhotoTagging(text: string): PhotoTagging | null {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as { tags?: unknown; outfit?: unknown; explicit?: unknown; situation?: unknown }
    const tags = normalizePhotoTags(o.tags)
    if (!tags.length) return null
    return { tags, outfit: o.outfit === 'dressed' ? 'dressed' : 'bare', adult: o.explicit === true || o.outfit === 'nude',
      situation: typeof o.situation === 'string' ? o.situation.replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 120) : '' }
  } catch { return null }
}

async function imageData(url: string): Promise<{ type: string; base64: string } | null> {
  const name = publicMediaName(url)
  if (name) { const bytes = await readMedia(PUBLIC_BUCKET, name), type = mediaType(name); return bytes && type ? { type, base64: bytes.toString('base64') } : null }
  if (!url.startsWith('https://')) return null
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const type = res?.headers.get('content-type')?.split(';')[0] ?? ''
  if (!res?.ok || !type.startsWith('image/')) return null
  const bytes = Buffer.from(await res.arrayBuffer())
  return bytes.length <= 8_000_000 ? { type, base64: bytes.toString('base64') } : null
}

async function viaGemini(img: { type: string; base64: string }, hint: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.MIRO_PHOTO_TAG_MODEL ?? 'gemini-3.8-flash'}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: PHOTO_TAG_SYSTEM }] }, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: img.type, data: img.base64 } }, { text: `이 사진의 태그.${hint ? ` 제작자가 적은 설명(참고): ${hint}` : ''}` }] }],
      safetySettings: ['HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_HARASSMENT'].map(category => ({ category, threshold: 'BLOCK_NONE' })),
      // 11/23 생각(thinking)도 출력 한도를 먹는다 — 1024 에서는 생각이 길어진 사진의 답이 중간에 잘려 태그 없음으로 떨어졌다(한 작품 80장 중 38장). 생각은 가장 낮게, 한도는 넉넉히.
      generationConfig: { maxOutputTokens: 4096, temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } } }),
  }).catch(() => null)
  const debug = process.env.MIRO_PHOTO_TAG_DEBUG === '1'
  // 429(월 한도·속도 제한)·402(선불 잔액 소진)·403(프로젝트 차단) — 일괄 작업(scripts/photo-tags.mts)이 보고 멈춘다. 11/24 402 를 안 봐서 잔액이 바닥난 뒤에도 수백 장을 계속 불렀다.
  if (res && [429, 402, 403].includes(res.status)) photoTagQuota.hit = true
  if (!res?.ok) { if (debug) console.log('  tag http', res?.status ?? 'network', (await res?.text().catch(() => ''))?.slice(0, 120)); return null }
  const j = await res.json().catch(() => null) as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; promptFeedback?: { blockReason?: string } } | null
  const text = j?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') || null
  if (!text && debug) console.log('  tag empty', j?.promptFeedback?.blockReason ?? j?.candidates?.[0]?.finishReason ?? 'unknown', hint ? '(설명 있음)' : '')
  else if (debug && j?.candidates?.[0]?.finishReason !== 'STOP') console.log('  tag cut', j?.candidates?.[0]?.finishReason, text?.length)
  return text
}

/** 사진 한 장의 태그. 사진을 못 읽거나 AI 가 답을 못 하면(막힘·실패) null. */
export async function tagPhoto(url: string, hint = ''): Promise<PhotoTagging | null> {
  const img = await imageData(url)
  if (!img) return null
  const note = hint.replace(/\s+/g, ' ').trim().slice(0, 120)
  // 설명 글 때문에 막히는 경우가 있어(성인 표현) 설명을 준 요청이 실패하면 그림만으로 한 번 더.
  const ask = async (h: string) => { const text = await viaGemini(img, h), out = parsePhotoTagging(text ?? ''); if (!out && text && process.env.MIRO_PHOTO_TAG_DEBUG === '1') console.log('  tag unparsed', text.slice(0, 200)); return out }
  return await ask(note) ?? (note ? await ask('') : null)
}

if (process.argv[1]?.endsWith('photo-tags.ts')) {
  const ok = parsePhotoTagging('```json\n{"tags":["정상위","절정","정상위"," "],"outfit":"nude","explicit":true,"situation":"\\"침대에서 정상위로 절정할 때\\""}\n```')
  console.assert(ok?.tags.join() === '정상위,절정' && ok.outfit === 'bare' && ok.adult && ok.situation === '침대에서 정상위로 절정할 때', JSON.stringify(ok))
  const day = parsePhotoTagging('{"tags":["미소"],"outfit":"dressed","explicit":false,"situation":"카페에서 웃을 때"}')
  console.assert(day?.outfit === 'dressed' && !day.adult && parsePhotoTagging('{"tags":[]}') === null && parsePhotoTagging('거절') === null)
}
