import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import type { BudgetGuard } from '../packages/providers/src/ai/types'
import { modelCost } from '../packages/providers/src/ai/model-registry'

/** Durable, single-writer validation budget. Reservations survive timeouts and restarts. */
export async function validationBudget(path: string, limitUSD: number) {
  if (!Number.isFinite(limitUSD) || limitUSD <= 0 || limitUSD > 1) throw new Error('Validation limit must be in (0, 1] USD')
  const lock = await open(path + '.lock', 'wx', 0o600)
  try {
    let spent = 0, attempts = 0
    try {
      const saved = JSON.parse(await readFile(path, 'utf8'))
      if (!Number.isFinite(saved.reservedUSD) || saved.reservedUSD < 0 || !Number.isInteger(saved.attempts) || saved.attempts < 0) throw new Error('Invalid validation ledger')
      spent = saved.reservedUSD; attempts = saved.attempts
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    const guard: BudgetGuard = { async authorize(request, model, _context, attemptId) {
      const cost = modelCost(model, Buffer.byteLength(request.system + request.prompt) + 512, request.maxTokens ?? model.maxOutputTokens)
      if (cost === null) return { allowed: false, reason: 'unknown_price' }
      // Extra headroom for accounting differences. Never release a validation reservation.
      const ceiling = Math.max(.01, Math.ceil(cost * 10 * 1e8) / 1e8)
      if (spent + ceiling > limitUSD) return { allowed: false, reason: 'validation_total_limit' }
      spent = Math.ceil((spent + ceiling) * 1e8) / 1e8; attempts++
      await writeFile(path + '.pending', JSON.stringify({ limitUSD, reservedUSD: spent, attempts }) + '\n', { mode: 0o600 })
      await rename(path + '.pending', path)
      return { allowed: true, reservationId: attemptId, maxUsageUnits: 0 }
    } }
    return { guard, status: () => ({ limitUSD, reservedUSD: spent, attempts }),
      close: async () => { await lock.close(); await unlink(path + '.lock') } }
  } catch (e) { await lock.close(); await unlink(path + '.lock'); throw e }
}
