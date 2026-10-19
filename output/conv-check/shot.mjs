import { chromium } from '@playwright/test'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 380, height: 210 }, deviceScaleFactor: 2 })
await p.goto('file:///Users/johyeon-ung/Desktop/Miro/output/conv-check/affinity-preview.html'); await p.screenshot({ path: '/Users/johyeon-ung/Desktop/Miro/output/conv-check/affinity-preview.png' }); await b.close()
