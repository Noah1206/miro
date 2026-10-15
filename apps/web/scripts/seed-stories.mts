/**
 * 오리지널 스토리 5종을 DB(stories·story_private)로 옮긴다. slug 로 갱신 — 다시 돌려도 중복되지 않는다.
 * 운영자가 DB 에서 직접 고친 작품은 건너뛴다(--force 로만 덮어씀). 공개 여부(is_published)는 바꾸지 않는다 — 새 작품은 비공개.
 *
 *   DATABASE_URL=postgres://localhost/miro_e2e_test npx tsx scripts/seed-stories.mts           # 검사만
 *   DATABASE_URL=postgres://localhost/miro_e2e_test npx tsx scripts/seed-stories.mts --apply   # 넣기
 *   ... --apply --allow-remote   # localhost 가 아닌 DB(운영 등)에 넣기 — 운영자 확인 뒤에만
 */
import { STORY_DEFINITIONS } from '../lib/stories/content/index.ts'
import { seedStories } from '../lib/stories/seed.ts'

const args = new Set(process.argv.slice(2))
const url = process.env.DATABASE_URL ?? ''
const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
const local = ['localhost', '127.0.0.1', '::1', ''].includes(host)
if (args.has('--apply') && !local && !args.has('--allow-remote')) {
  console.error(`DATABASE_URL 이 로컬이 아니다(${host}). 운영 반영은 --allow-remote 를 명시해야 한다.`)
  process.exit(1)
}
const report = await seedStories(STORY_DEFINITIONS, { apply: args.has('--apply'), force: args.has('--force') })
console.table(report)
console.log(args.has('--apply') ? `적용 완료 (${host || 'local socket'})` : '검사만 했다 — 넣으려면 --apply')
process.exit(report.some(r => r.action === 'invalid') ? 1 : 0)
