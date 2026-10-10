/**
 * Render the approved SVG into transparent marks, animation pieces and PWA icons.
 * node docs/brand/make-logo-assets.mjs
 * MIRO_ASSET_NODE_MODULES may point to a bundled Node package directory containing sharp.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require(require.resolve('sharp', {
  paths: [process.env.MIRO_ASSET_NODE_MODULES, process.cwd()].filter(Boolean),
}))
const source = await readFile(new URL('./logo-symbol.svg', import.meta.url), 'utf8')
const out = new URL('../../apps/web/public/', import.meta.url)
const render = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
const save = (name, bytes) => writeFile(new URL(name, out), bytes)
const lavender = source.replace('fill="#FFFFFF"', 'fill="#B8A6FF"')
await save('logo-mark.svg', source)
await save('logo-mark-lavender.svg', lavender)
await save('logo-mark.png', await render(source, 512))
await save('logo-mark-lavender.png', await render(lavender, 512))
for (const [piece, name] of [['left', 'logo-m.png'], ['right', 'logo-s.png']]) {
  const svg = source.replace(/<path data-piece="(left|right)"[^>]*\/>/g,
    (path, side) => side === piece ? path : '')
  await save(name, await render(svg, 512))
}
for (const px of [180, 192, 512]) {
  const markSize = Math.round(px * 0.62)
  const margin = Math.floor((px - markSize) / 2)
  const icon = await sharp({ create: { width: px, height: px, channels: 4, background: '#000000' } })
    .composite([{ input: await render(lavender, markSize), left: margin, top: margin }])
    .png().toBuffer()
  await save('icon-' + px + '.png', icon)
}
await save('favicon.png', await render(lavender, 96))
console.log('MIRO logo assets rendered to ' + fileURLToPath(out))
