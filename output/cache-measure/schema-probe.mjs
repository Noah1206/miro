import { readFileSync } from 'node:fs'
const KEY = readFileSync('/Users/johyeon-ung/Desktop/Miro/.env', 'utf8').match(/^GEMINI_API_KEY=(.*)$/m)[1].trim().replace(/^"|"$/g, '')
const req = JSON.parse(readFileSync('dialogue-request.json', 'utf8'))
for (let i = 0; i < 4; i++) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { maxOutputTokens: req.maxTokens ?? 2048, responseMimeType: 'application/json', ...(req.responseSchema ? { responseJsonSchema: req.responseSchema } : {}), thinkingConfig: { thinkingLevel: 'low' } } }) })
  if (!res.ok) { console.log(i, 'HTTP', res.status); await res.body?.cancel(); continue }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '', text = '', chunks = 0, finish = ''
  for (;;) { const { value, done } = await reader.read(); if (value) buf += value
    const lines = buf.split('\n'); buf = done ? '' : lines.pop()
    for (const l of lines) { if (!l.startsWith('data:')) continue; const c = JSON.parse(l.slice(5)); chunks++
      text += (c.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join(''); if (c.candidates?.[0]?.finishReason) finish = c.candidates[0].finishReason }
    if (done) break }
  let kind; try { const v = JSON.parse(text); kind = Array.isArray(v) ? 'array' : typeof v } catch { kind = 'unparseable' }
  console.log(i, { chunks, finish, kind, len: text.length, head: text.slice(0, 60).replace(/\n/g, ' '), tail: text.slice(-40).replace(/\n/g, ' ') })
}
console.log('schema present:', !!req.responseSchema)
