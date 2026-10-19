// Interleaved availability/latency comparison of Gemini models with the production key. Never prints the key.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
const env = readFileSync('/Users/johyeon-ung/Desktop/Miro/.env', 'utf8')
const KEY = env.match(/^GEMINI_API_KEY=(.*)$/m)[1].trim().replace(/^"|"$/g, '')
const OUT = '/Users/johyeon-ung/Desktop/Miro/output/gemini-compare'
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']
const thinking = m => m === 'gemini-3.5-flash' ? { thinkingBudget: 0 } : m === 'gemini-3.5-flash-lite' ? { thinkingLevel: 'minimal' } : { thinkingLevel: 'low' }
const PRICE = { in: 0.75 / 1e6, out: 3.75 / 1e6 } // 측정 상한 계산용(보수적으로 flash 가격)
const CAP = 0.30, ROUNDS = 8
const system = `당신은 롤플레이 캐릭터 '백도현'입니다. 33세, 비 오는 날에만 문을 여는 기억 전당포의 주인. 정중하고 느긋하며 질문에 질문으로 답하는 버릇이 있다. 장갑을 낀 채 유리병을 다룬다. 비밀은 말하지 않는 것으로 지킨다.
규칙: 한국어로, 장면 하나를 서술(narrative)·행동(action)·속마음(thought)·대사(dialogue) 블록으로 400~700자 씁니다. 속마음은 짧은 구어 혼잣말. 사용자가 말하지 않은 사용자의 과거를 지어내지 않습니다.`.repeat(1)
const prompt = `최근 대화:\n손님: 처음 뵙겠습니다. 이 병, 제 거라고 들었는데요.\n백도현: 영수증, 이쪽으로 보여주시겠어요? 기한은 아직 지나지 않았으니까요.\n\n사용자 입력: 영수증은 여기요. 근데 이 병에 무슨 기억이 들었는지 차근차근 말해 주실래요?`
const schema = { type: 'object', properties: { blocks: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['narrative', 'action', 'thought', 'dialogue'] }, text: { type: 'string' } }, required: ['type', 'text'] } } }, required: ['blocks'] }
let spent = 0
const rows = []
for (let r = 0; r < ROUNDS; r++) for (const model of MODELS) {
  if (spent > CAP - 0.01) break
  const t0 = Date.now(); let first = 0, status = 0, text = '', usage = null, finish = ''
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json', responseJsonSchema: schema, thinkingConfig: thinking(model) } }) })
    status = res.status
    if (res.ok) {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = ''
      for (;;) { const { value, done } = await reader.read(); if (value) buf += value
        const lines = buf.split('\n'); buf = done ? '' : lines.pop()
        for (const l of lines) { if (!l.startsWith('data:')) continue; const c = JSON.parse(l.slice(5))
          const d = (c.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('')
          if (d && !first) first = Date.now(); text += d; if (c.usageMetadata) usage = c.usageMetadata; if (c.candidates?.[0]?.finishReason) finish = c.candidates[0].finishReason }
        if (done) break }
    } else await res.body?.cancel()
  } catch (e) { status = String(e.name) }
  const cost = usage ? (usage.promptTokenCount ?? 0) * PRICE.in + ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)) * PRICE.out : 0
  spent += cost
  const row = { r, model, status, ttft: first ? first - t0 : null, total: Date.now() - t0, finish, outTok: usage?.candidatesTokenCount ?? null, thoughtTok: usage?.thoughtsTokenCount ?? null, cost: +cost.toFixed(5) }
  rows.push(row); appendFileSync(`${OUT}/rows.ndjson`, JSON.stringify({ ...row, text }) + '\n')
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ spent, rows }, null, 1))
console.log('spent', spent.toFixed(4), 'calls', rows.length)
