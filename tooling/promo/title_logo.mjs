// 작품 제목 로고(투명 배경 PNG) 여러 장 — 키는 .env 의 OPENAI_API_KEY
//   node tooling/promo/title_logo.mjs 목록.json [slug ...]     목록: [{ slug, title, style, layout?, size? }]  (layout: 글자 배치 설명, size: 1024x1536 이면 세로형)
//   결과: output/logos/<slug>.png (이미 있으면 건너뜀)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
const root = new URL('../../', import.meta.url).pathname
const key = readFileSync(root + '.env', 'utf8').match(/^OPENAI_API_KEY="?([^"\n]+)/m)?.[1]
const [file, ...only] = process.argv.slice(2)
const list = JSON.parse(readFileSync(file, 'utf8')).filter(x => !only.length || only.includes(x.slug))
mkdirSync(root + 'output/logos', { recursive: true })
const one = async ({ slug, title, style, layout, size }) => {
  const out = `${root}output/logos/${slug}.png`
  if (existsSync(out)) return
  const prompt = `Korean webtoon / web-novel cover TITLE LOGO, typography only, on a fully transparent background.
The text must read exactly, in Korean Hangul, with no missing or extra characters: "${title}"
Layout: ${layout || 'one or two horizontal lines (break at a natural word boundary), centered, filling most of the canvas width'}.
Design: ${style}. Follow this design direction literally — lettering type, material, color and ornament come only from it; do not fall back to a generic glossy outlined logo. It must stay legible when placed over an illustration.
No characters, no people, no scenery, no background plate, no frame, no other words, no English, no watermark.`
  const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GPT_IMAGE_MODEL || 'chatgpt-image-latest', prompt, size: size || '1536x1024', n: 1, quality: process.env.QUALITY || 'medium', background: 'transparent', output_format: 'png' }) })
  const j = await res.json()
  if (!res.ok) return console.error(slug, res.status, j.error?.message)
  writeFileSync(out, Buffer.from(j.data[0].b64_json, 'base64')); console.log(out, JSON.stringify(j.usage ?? {}))
}
for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(one))   // 한 번에 6장
