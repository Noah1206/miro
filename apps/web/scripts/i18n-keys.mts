/**
 * 번역 키 모으기. 앱 코드의 t('…')·msg('…') 안의 한국어 원문을 모은다(원문이 곧 키).
 *   node scripts/i18n-keys.mts            → 키 목록(JSON 배열)
 *   node scripts/i18n-keys.mts --missing  → 언어별로 사전에 없는 키 수와 목록(없으면 0)
 * 템플릿 문자열·변수는 모으지 못한다 — 값이 들어가는 자리는 t('{name}…', { name }) 으로 쓴다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const keys = new Set<string>()
const CALL = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.next') || name === '__tests__' || name === 'scripts') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|mts)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      for (const m of readFileSync(p, 'utf8').matchAll(CALL)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? ''
        const text = raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
        if (/[가-힣]/.test(text)) keys.add(text)
      }
    }
  }
}
for (const d of ['app', 'components', 'lib']) walk(join(root, d))
const all = [...keys].sort()

if (process.argv.includes('--missing')) {
  for (const lang of ['en', 'ja', 'zh']) {
    const dict = JSON.parse(readFileSync(join(root, 'lib/i18n/messages', `${lang}.json`), 'utf8')) as Record<string, string>
    const missing = all.filter((k) => !dict[k])
    const stale = Object.keys(dict).filter((k) => !keys.has(k))
    console.log(`${lang}: ${missing.length} missing, ${stale.length} unused`)
    if (process.argv.includes('--list')) console.log(JSON.stringify(missing, null, 1))
  }
} else {
  console.log(JSON.stringify(all, null, 1))
}
