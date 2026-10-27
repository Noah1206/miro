import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, rename, writeFile, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { ModelRegistry, providerFromEnv, modelCost, generationInputCeiling, type GenerationRequest, type GenerationResult } from '../../packages/providers/src/index'
import { extractJson } from '../../packages/providers/src/ai/orchestrator'
import { runTurn } from '../../packages/engine/src/orchestrator'
import { SimulationProposal } from '../../packages/engine/src/proposal.schema'
import { snapshot } from '../../packages/engine/src/__tests__/fixtures'
import { validateProposal } from '../../packages/engine/src/validator'
import { tokensForCost } from '../../packages/config/src/token-pricing'

/** Real app prompt and schema, synthetic adult character, no DB/wallet writes. Dry-run by default.
 * Each model is reserved durably BEFORE one adapter call. No retry/fallback. Unknown cost retains its full ceiling.
 * --live --limit-usd <0..1> --env-dir <existing env folder> --out <new evidence directory>
 */
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1]
const live = process.argv.includes('--live')
const out = process.argv.includes('--out') ? path.resolve(arg('--out')!) : undefined
const limitUSD = Number(process.argv.includes('--limit-usd') ? arg('--limit-usd') : .5)
const outputCap = 2048
const input = '오늘 발표를 망친 것 같아서 아직 손이 떨려요. 집에 가면 혼자 계속 곱씹을 것 같고요. 그냥 잘했다고 위로하지 말고, 여기서 잠깐 같이 있어 주실래요?'
const scene = snapshot({ experienceType: 'chat', mode: 'chat', turnCount: 5,
  recentMessages: [{ role: 'user', content: '발표를 마치고 바로 왔어요. 발표 자료는 가방에 있어요.' },
    { role: 'character', content: '문 닫을 시간은 아직 남았습니다. 가방은 빈 의자에 놓으세요.' }] })
async function appRequest(): Promise<GenerationRequest> {
  let captured: GenerationRequest | undefined
  await runTurn({ snapshot: scene, userInput: input, maxOutputTokens: outputCap, replyLength: 'scene',
    llm: { info: { mode: 'mock', name: 'capture-only', notice: 'No network' }, generateStructured: async req => {
      if (req.task === 'dialogue' && !captured) captured = { task: 'dialogue', system: req.system, prompt: req.prompt,
        maxTokens: outputCap, json: true, promptVersion: req.promptVersion, hardTokenCap: true, disableProviderFallback: true }
      throw new Error('capture-only')
    } } })
  if (!captured) throw Error('No app dialogue request captured')
  return captured
}
async function main() {
  if (!out || !Number.isFinite(limitUSD) || limitUSD <= 0 || limitUSD > 1) throw Error('--out and a limit in (0,1] required')
  await mkdir(out, { recursive: true })
  const request = await appRequest()
  const registry = new ModelRegistry(JSON.parse(await readFile('ai/config/chat-models-20261027.json', 'utf8')))
  const plan = registry.models.map(m => ({ id: m.id, model: m.providerModelId,
    ceilingUSD: Math.ceil(modelCost(m, generationInputCeiling(request), outputCap)! * 1.25 * 1e8) / 1e8 }))
  const totalCeilingUSD = plan.reduce((n, row) => n + row.ceilingUSD, 0)
  const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  await writeFile(path.join(out, 'plan.json'), JSON.stringify({ requestHash, input, inputByteCeiling: generationInputCeiling(request), outputCap, totalCeilingUSD, limitUSD, plan }, null, 2))
  console.log(JSON.stringify({ stage: 'plan', live, totalCeilingUSD, limitUSD, inputByteCeiling: generationInputCeiling(request), calls: plan.length }))
  if (!live) return
  if (totalCeilingUSD > limitUSD) throw Error('All-model plan exceeds total limit; no calls made')
  const require = createRequire(import.meta.url)
  require('../../node_modules/.pnpm/@next+env@15.5.25/node_modules/@next/env').loadEnvConfig(path.resolve(arg('--env-dir')!))
  for (const m of registry.models) if (!providerFromEnv(m.provider, m.providerModelId)) throw Error('Missing credential; no calls made')
  const ledgerPath = path.join(out, 'ledger.json')
  const lock = await open(path.join(out, 'run.lock'), 'wx', 0o600)
  try {
    let ledger: { requestHash: string; limitUSD: number; reservedUSD: number; rows: Array<Record<string, unknown>> }
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ledger = { requestHash, limitUSD, reservedUSD: 0, rows: [] } }
    if (ledger.requestHash !== requestHash || ledger.limitUSD !== limitUSD) throw Error('Existing ledger does not match; no calls made')
    const save = async () => { await writeFile(ledgerPath + '.pending', JSON.stringify(ledger, null, 2)); await rename(ledgerPath + '.pending', ledgerPath) }
    for (const model of registry.models) {
      // A reserved but unfinished call is deliberately never repeated after a crash.
      if (ledger.rows.some(row => row.id === model.id)) { console.log(JSON.stringify({ stage: 'skip-existing', id: model.id })); continue }
      const ceiling = plan.find(p => p.id === model.id)!.ceilingUSD
      if (ledger.reservedUSD + ceiling > limitUSD + 1e-10) throw Error('Total limit reached')
      ledger.reservedUSD += ceiling
      const row: Record<string, unknown> = { id: model.id, requestedModel: model.providerModelId, attemptId: randomUUID(), status: 'reserved', ceilingUSD: ceiling, startedAt: new Date().toISOString() }
      ledger.rows.push(row); await save()
      const start = performance.now(); let firstTextMs: number | null = null
      let result: GenerationResult | undefined
      try {
        // SDK/REST adapters have no network retries. Provider substitution is explicitly off.
        result = await providerFromEnv(model.provider, model.providerModelId)!.generate({ ...request, signal: AbortSignal.timeout(45_000),
          onText: text => { if (text && firstTextMs === null) firstTextMs = Math.round(performance.now() - start) } })
        const cost = modelCost(model, result.inputTokens, result.outputTokens, result.cachedInputTokens)
        Object.assign(row, { status: 'returned', elapsedMs: Math.round(performance.now() - start), firstTextMs,
          actualModel: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
          cachedInputTokens: result.cachedInputTokens ?? 0, measuredCostUSD: cost, costIsInvoice: false,
          miroTokensForDialogueOnly: cost === null ? null : tokensForCost(cost), truncated: result.truncated ?? null, blocked: !!result.blocked, raw: result.text })
        const parsed = SimulationProposal.safeParse(extractJson(result.text, { closeUnclosed: result.truncated === false }))
        if (!parsed.success) Object.assign(row, { pass: false, reason: 'schema', schemaIssues: parsed.error.issues.map(i => ({ path: i.path.join('.'), code: i.code })) })
        else {
          const validated = validateProposal(parsed.data, scene)
          const text = validated.blocks.map(b => b.text).join('\n\n')
          Object.assign(row, { pass: !result.blocked && !result.truncated && validated.blocks.length > 0, blocks: validated.blocks, text,
            visibleCharacters: text.length, validationIssues: validated.issues, reason: result.blocked ? 'blocked' : result.truncated ? 'truncated' : null })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        Object.assign(row, { status: result ? 'validation_failed' : 'request_failed', pass: false, elapsedMs: Math.round(performance.now() - start),
          reason: /^provider_http_\d{3}$/.test(message) ? message : /abort|timeout/i.test(message) ? 'timeout' : result ? 'invalid_json' : 'provider_error',
          measuredCostUSD: result ? row.measuredCostUSD : null, costUnknown: !result })
      }
      await save()
      console.log(JSON.stringify({ stage: 'result', id: row.id, status: row.status, pass: row.pass, elapsedMs: row.elapsedMs, costUSD: row.measuredCostUSD, reason: row.reason }))
    }
    console.log(JSON.stringify({ stage: 'complete', calls: ledger.rows.length, reservedUSD: ledger.reservedUSD,
      measuredUSD: ledger.rows.reduce((n, r) => n + (typeof r.measuredCostUSD === 'number' ? r.measuredCostUSD : 0), 0), unknownCosts: ledger.rows.filter(r => r.measuredCostUSD == null).length }))
  } finally { await lock.close(); await unlink(path.join(out, 'run.lock')) }
}
main().catch(error => { console.error(JSON.stringify({ stage: 'stopped', reason: /limit|ledger|credential|capture|--out/.test(error.message) ? error.message : 'setup_or_io_error' })); process.exitCode = 1 })
