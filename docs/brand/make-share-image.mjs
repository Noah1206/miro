/** Render the existing MIRO logo into the link preview. Run from the repo root. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { ImageResponse } = require('next/og')
const { createElement: h } = require('react')
const logo = await readFile(new URL('../../apps/web/public/logo-mark.png', import.meta.url))
const image = new ImageResponse(
  h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#111015',
      backgroundImage: 'radial-gradient(ellipse at 50% 40%, #2c243d 0%, #111015 75%)',
      color: '#ffffff',
    },
  },
  h('img', { src: `data:image/png;base64,${logo.toString('base64')}`, width: 230, height: 230 }),
  h('div', { style: { display: 'flex', fontSize: 72, fontWeight: 700, letterSpacing: 16, marginTop: 30, paddingLeft: 16 } }, 'MIRO'),
  h('div', { style: { display: 'flex', fontSize: 23, color: '#B8A6FF', letterSpacing: 3, marginTop: 20 } }, 'miroapp.app')),
  { width: 1200, height: 630 },
)
await writeFile(new URL('../../apps/web/public/miro-share-v1.png', import.meta.url), Buffer.from(await image.arrayBuffer()))
