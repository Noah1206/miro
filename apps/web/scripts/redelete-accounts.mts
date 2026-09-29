/**
 * 백업 복구 뒤, 스냅샷 이후에 삭제됐던 계정을 다시 지운다(되살아난 계정). ID 는 운영자 Discord 의
 * '계정 삭제 기록' 가운데 manifest.snapshotAt 보다 늦은 것. 앱과 같은 deleteAccount 를 그대로 쓴다.
 *
 *   DATABASE_URL=<복구한 DB> npx tsx scripts/redelete-accounts.mts <user-id> [user-id ...]
 */
const { deleteAccount } = await import('../lib/ops/account')
const ids = process.argv.slice(2)
if (!ids.length) { console.error('usage: redelete-accounts.mts <user-id> [user-id ...]'); process.exit(1) }
for (const id of ids) console.log(id, await deleteAccount(id))
process.exit(0)
