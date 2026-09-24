import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testDatabaseUrl } from '../../../tooling/test-database'

/** Offline contract replay of real application entry points. Never quietly substitutes for live eval. */
async function main() {
  if (process.argv.includes('--live')) throw new Error('Live quality evaluation requires its own capped experiment budget and consented dataset; this command only replays fixtures.')
  const database = testDatabaseUrl(process.env.TEST_DATABASE_URL)
  if (!database) throw new Error('Set TEST_DATABASE_URL to a guarded local test database.')
  const directory = await mkdtemp(join(tmpdir(), 'miro-agency-replay-'))
  const rawReport = join(directory, 'vitest.json')
  const started = Date.now()
  const suites = ['packages/domain/src/character/agency', 'packages/engine/src/agency',
    'packages/engine/src/__tests__/orchestrator.agency.test.ts', 'packages/engine/src/__tests__/knowledge-context.test.ts',
    'apps/web/lib/agency', 'apps/web/lib/simulation/character-context.integration.test.ts',
    'apps/web/lib/reality/__tests__/agency.integration.test.ts']
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...suites, '--reporter=json', '--outputFile', rawReport], {
    cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: database,
      MIRO_CHARACTER_AGENCY_MODE: 'off', MIRO_CHARACTER_AGENCY_SESSIONS: '',
      MIRO_AGENCY_REPLAY_TURNS: process.argv.includes('--long') ? '300' : '20' },
  })
  const tests = JSON.parse(await readFile(rawReport, 'utf8'))
  const paths = execFileSync('rg', ['--files', 'packages/domain/src/character/agency', 'packages/engine/src/agency',
    'apps/web/lib/agency', 'apps/web/lib/reality', 'apps/web/lib/simulation'], { encoding: 'utf8' }).trim().split('\n').sort()
  const hash = createHash('sha256')
  for (const path of paths) hash.update(path + '\0').update(await readFile(path)).update('\0')
  const report = { mode: 'recorded-contract-replay', providerMode: 'mock', datasetVersion: 'agency-contract-v1',
    createdAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHash: hash.digest('hex'), elapsedMs: Date.now() - started,
    requestedTurns: process.argv.includes('--long') ? 300 : 20,
    total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests, pending: tests.numPendingTests,
    complete: result.status === 0 && tests.numFailedTests === 0 && tests.numPendingTests === 0,
    tests: tests.testResults.map((suite: { name: string; assertionResults: Array<{ fullName: string; status: string; duration: number }> }) => ({
      suite: suite.name, checks: suite.assertionResults.map(t => ({ name: t.fullName, status: t.status, durationMs: t.duration })),
    })),
    liveQualityMeasured: false, humanPreferenceMeasured: false, providerCostUSD: 0,
    note: 'Recorded fixtures verify contracts and persistence only. They do not measure model personality fidelity, latency, cost, or human preference.',
  }
  const output = join(directory, 'report.json')
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(`Agency recorded replay: ${report.passed}/${report.total} passed; ${report.pending} pending. ${output}`)
  if (!report.complete) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'agency_replay_failed'); process.exitCode = 1 })
