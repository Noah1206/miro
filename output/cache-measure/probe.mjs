import { readFileSync } from 'node:fs'
const KEY = readFileSync('/Users/johyeon-ung/Desktop/Miro/.env', 'utf8').match(/^GEMINI_API_KEY=(.*)$/m)[1].trim().replace(/^"|"$/g, '')
const task = process.argv[2]
const req = JSON.parse(readFileSync(`${task}-request.json`, 'utf8'))
async function call(label, prompt) {
  const t0 = Date.now(); let first = 0, usage = null
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4096, responseMimeType: 'application/json', ...(req.responseSchema ? { responseJsonSchema: req.responseSchema } : {}), thinkingConfig: { thinkingLevel: req.thinking ?? 'low' } } }) })
  if (!res.ok) { console.log(label, 'HTTP', res.status); await res.body?.cancel(); return }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = ''
  for (;;) { const { value, done } = await reader.read(); if (value) buf += value
    const lines = buf.split('\n'); buf = done ? '' : lines.pop()
    for (const l of lines) { if (!l.startsWith('data:')) continue; const c = JSON.parse(l.slice(5))
      if (!first && (c.candidates?.[0]?.content?.parts ?? []).some(p => p.text && !p.thought)) first = Date.now(); if (c.usageMetadata) usage = c.usageMetadata }
    if (done) break }
  console.log(JSON.stringify({ label, ttft: first - t0, total: Date.now() - t0, prompt: usage?.promptTokenCount, cached: usage?.cachedContentTokenCount ?? 0, out: usage?.candidatesTokenCount, thought: usage?.thoughtsTokenCount ?? 0 }))
}
await call('1st', req.prompt)
await call('same-again', req.prompt)



