import base from '../../../vitest.config'

/** Eval-only suites, never part of `pnpm test`. `baseline.ts`·`ai/evals/live-app.ts` pass the arm, output path and provider env. */
export default { ...base, test: { ...base.test, include: ['apps/web/lib/agency/*.eval.ts', 'apps/web/lib/reality/*.eval.ts', 'apps/web/lib/simulation/*.eval.ts'], testTimeout: 30 * 60_000 } }
