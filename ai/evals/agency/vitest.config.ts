import base from '../../../vitest.config'

/** Eval-only suites, never part of `pnpm test`. `baseline.ts` passes the arm, output path and provider env. */
export default { ...base, test: { ...base.test, include: ['apps/web/lib/agency/*.eval.ts'], testTimeout: 30 * 60_000 } }
