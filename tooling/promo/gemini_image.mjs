// Gemini 이미지 모델로 그림 고치기/만들기 — 키는 .env 의 GEMINI_API_KEY
//   node tooling/promo/gemini_image.mjs "지시문" 결과.png [참고.png ...] [--ratio 16:9]
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('../../', import.meta.url).pathname
const key = readFileSync(root + '.env', 'utf8').match(/^GEMINI_API_KEY="?([^"\n]+)/m)?.[1]
const a = process.argv.slice(2), ri = a.indexOf('--ratio'), ratio = ri >= 0 ? a.splice(ri, 2)[1] : null
const [prompt, out, ...refs] = a
const parts = [...refs.map(p => ({ inlineData: { mimeType: p.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(p).toString('base64') } })), { text: prompt }]
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image'}:generateContent`, {
  method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], ...(ratio && { imageConfig: { aspectRatio: ratio } }) } }) })
const j = await res.json()
const img = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
if (!img) throw new Error(`Gemini ${res.status}: ${JSON.stringify(j).slice(0, 400)}`)
writeFileSync(out, Buffer.from(img.inlineData.data, 'base64')); console.log(out)
