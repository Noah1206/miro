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
// Tab icon: the approved mark on an amethyst tile, readable on light and dark browser chrome.
const favicon = source
  .replace('viewBox="200 205 840 840"', 'viewBox="0 0 100 100"')
  .replace('<title>MIRO — four-lobe connection symbol</title>', `<title>MIRO</title>
  <defs><linearGradient id="amethyst" x1="0" y1="0" x2="1" y2="0.5"><stop stop-color="#59419B"/><stop offset=".52" stop-color="#8C5BDE"/><stop offset="1" stop-color="#BD90F0"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#amethyst)"/>
  <g transform="translate(12 12) scale(.09047619) translate(-200 -205)">`)
  .replace('</svg>', '</g></svg>')
await save('favicon.svg', favicon)
await save('favicon.png', await render(favicon, 96))
const faviconFrames = await Promise.all([16, 32, 48].map(async size => {
  const png = await render(favicon, size)
  if (size !== 48) await save('favicon-' + size + '.png', png)
  return { size, png }
}))
// PNG-backed ICO entries preserve the exact SVG raster at each native tab size.
const icoHeader = Buffer.alloc(6 + faviconFrames.length * 16)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(faviconFrames.length, 4)
let offset = icoHeader.length
faviconFrames.forEach(({ size, png }, i) => {
  const entry = 6 + i * 16
  icoHeader[entry] = size; icoHeader[entry + 1] = size
  icoHeader.writeUInt16LE(1, entry + 4); icoHeader.writeUInt16LE(32, entry + 6)
  icoHeader.writeUInt32LE(png.length, entry + 8); icoHeader.writeUInt32LE(offset, entry + 12)
  offset += png.length
})
await save('favicon.ico', Buffer.concat([icoHeader, ...faviconFrames.map(frame => frame.png)]))
console.log('MIRO logo assets rendered to ' + fileURLToPath(out))
