import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { ModelRegistry, providerFromEnv, modelCost, generationInputCeiling, type GenerationRequest } from '../../packages/providers/src/index'
import { tokenPricing, tokensForCost } from '../../packages/config/src/token-pricing'

/** Synthetic, non-explicit Korean continuation / JSON / streaming smoke. No database or wallet writes.
 * Dry run by default. Live needs --live --env-file <private env> --out <new folder>.
 * One attempt per case/model, no provider substitution or retries. Persist reservations before calls.
 * This does NOT prove full app end-to-end quality, explicit-content support, or an invoice amount.
 */
const value = (key: string) => process.argv[process.argv.indexOf(key) + 1]
const live = process.argv.includes('--live')
const limitUSD = Number(process.argv.includes('--limit-usd') ? value('--limit-usd') : .5)
const outputCap = Number(process.argv.includes('--max-tokens') ? value('--max-tokens') : 1024)
const allCases = [
  { id: 'everyday', prompt: '이전 대화: 서준은 커피 대신 보리차를 마신다. 내일 오후 3시에 면접이 있다. 마지막 메시지: "내일 준비할 거랑 제가 마실 거, 기억하고 있어요?"' },
  { id: 'romance-boundary', prompt: '화면 모드명: 언베일. 이전 대화: 두 사람은 사귄 지 6개월인 성인이다. 서준은 오른쪽 손목이 아프고 오늘은 손만 잡고 조용히 있고 싶다고 했다. 마지막 메시지: "이제 반말해도 돼. 왼손만 잡고 옆에 있어 줘." 비노골적인 로맨스 대화로 이어 간다.' },
]
const cases = process.argv.includes('--case') ? allCases.filter(c => c.id === value('--case')) : allCases
const system = '한국어 캐릭터챗의 가상 인물 도윤(32세 남성)이다. 상대는 서준(29세 남성)이다. 담백하고 다정하게 두 문장으로 답한다. 사용자의 행동이나 감정을 대신 정하지 않는다. 이전 대화의 취향과 최신 정정을 기억하고 동의한 범위를 지킨다. 기본은 존댓말이고 허락하면 반말을 쓴다. 출력은 반드시 {"blocks":[{"type":"dialogue","speaker":"도윤","text":"대사"}]} 형태의 JSON 하나다.'
const requestFor = (prompt: string): GenerationRequest => ({ task: 'dialogue', system, prompt, json: true, maxTokens: outputCap, hardTokenCap: true, disableProviderFallback: true, thinking: 'low' })
async function main() {
  const out = path.resolve(value('--out') ?? 'output/latest-chat-models')
  await mkdir(out, { recursive: true })
  if (!cases.length || !Number.isFinite(limitUSD) || limitUSD <= 0 || limitUSD > .5 || !Number.isSafeInteger(outputCap) || outputCap < 128 || outputCap > 2048) throw Error('invalid evaluation limits')
  if (live) {
    if (!process.argv.includes('--env-file')) throw Error('private --env-file required')
    // Vercel emits single-line JSON values inside unescaped outer quotes. Node parseEnv
    // stops at the first embedded quote; retain the full outer-quoted value instead.
    const fields = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'MIRO_RECHARGE_PRODUCTS', 'MIRO_TOKEN_PRICING']
    for (const line of (await readFile(value('--env-file')!, 'utf8')).split(/\r?\n/)) {
      const i = line.indexOf('='); const key = line.slice(0, i)
      if (i < 0 || !fields.includes(key)) continue
      let raw = line.slice(i + 1).trim()
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
      process.env[key] = raw
    }
    tokenPricing() // Validate the settlement configuration BEFORE any paid request.
  }
  const registry = new ModelRegistry(JSON.parse(await readFile('ai/config/chat-models-20261027.json', 'utf8')))
  const models = registry.models.filter(m => ['gemini-argon', 'gemini-flash', 'claude-fable', 'claude-fable-51'].includes(m.id))
  const hash = createHash('sha256').update(JSON.stringify({ cases, system, cap: outputCap, models })).digest('hex')
  const plan = models.flatMap(model => cases.map(c => ({ id: model.id, case: c.id, ceilingUSD: modelCost(model, generationInputCeiling(requestFor(c.prompt)), outputCap)! * 1.25 })))
  const total = plan.reduce((n, p) => n + p.ceilingUSD, 0)
  if (total > limitUSD) throw Error('Plan exceeds $0.50; no calls made')
  await writeFile(path.join(out, 'plan.json'), JSON.stringify({ hash, limitUSD, ceilingUSD: total, scope: 'non-explicit synthetic continuation only', plan }, null, 2))
  console.log(JSON.stringify({ stage: 'plan', live, limitUSD, ceilingUSD: total, calls: plan.length }))
  if (!live) return
  for (const model of models) if (!providerFromEnv(model.provider, model.providerModelId)) throw Error(`missing credential: ${model.provider}`)
  const lockPath = path.join(out, 'run.lock')
  const lock = await open(lockPath, 'wx', 0o600)
  try {
    // Refuse to replay a previous live run accidentally. New runs need a different evidence folder.
    const file = path.join(out, 'ledger.json')
    const initial = await open(file, 'wx', 0o600); await initial.close()
    const ledger = { hash, limitUSD, reservedUSD: 0, rows: [] as Array<Record<string, unknown>> }
    const save = async () => { await writeFile(`${file}.tmp`, JSON.stringify(ledger, null, 2), { mode: 0o600 }); await rename(`${file}.tmp`, file) }
    for (const model of models) for (const c of cases) {
      const ceiling = plan.find(p => p.id === model.id && p.case === c.id)!.ceilingUSD
      if (ledger.reservedUSD + ceiling > limitUSD) throw Error('Budget exhausted')
      ledger.reservedUSD += ceiling
      const row: Record<string, unknown> = { id: model.id, case: c.id, requestedModel: model.providerModelId, ceilingUSD: ceiling, status: 'reserved' }
      ledger.rows.push(row); await save()
      const started = performance.now(); let firstTextMs: number | null = null; let chunks = 0
      try {
        const response = await providerFromEnv(model.provider, model.providerModelId)!.generate({ ...requestFor(c.prompt), signal: AbortSignal.timeout(45_000), onText: text => {
          if (!text) return
          chunks++; firstTextMs ??= Math.round(performance.now() - started)
        } })
        Object.assign(row, response, { status: 'returned', elapsedMs: Math.round(performance.now() - started), firstTextMs, chunks })
        await save() // Preserve provider output/usage even if local accounting or validation fails.
        const cost = modelCost(model, response.inputTokens, response.outputTokens, response.cachedInputTokens)
        let valid = false
        try { const data = JSON.parse(response.text); valid = Array.isArray(data.blocks) && data.blocks.length > 0 && data.blocks.every((b: { type?: string; text?: string }) => b.type === 'dialogue' && typeof b.text === 'string' && b.text.length > 0) } catch { /* preserve malformed output in evidence */ }
        Object.assign(row, response, { status: 'returned', elapsedMs: Math.round(performance.now() - started), firstTextMs, chunks,
          measuredCostUSD: cost, costBasis: 'reported token usage x published price, not invoice', dialogueOnlyMiroTokens: cost === null ? null : tokensForCost(cost),
          validJSON: valid, pass: valid && !response.blocked && !response.truncated && response.model === model.providerModelId && chunks > 0 })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        Object.assign(row, { status: 'failed', pass: false, elapsedMs: Math.round(performance.now() - started), reason: /^provider_http_\d+$/.test(message) ? message : /abort|timeout/i.test(message) ? 'timeout' : 'provider_error', measuredCostUSD: null })
      }
      await save()
      console.log(JSON.stringify({ stage: 'result', id: row.id, case: row.case, pass: row.pass, costUSD: row.measuredCostUSD, reason: row.reason }))
    }
    console.log(JSON.stringify({ stage: 'complete', measuredUSD: ledger.rows.reduce((n, r) => n + (typeof r.measuredCostUSD === 'number' ? r.measuredCostUSD : 0), 0), unknownCosts: ledger.rows.filter(r => r.measuredCostUSD == null).length }))
  } finally { await lock.close(); await unlink(lockPath) }
}
main().catch(error => { console.error(/exceeds|Budget|credential|env-file|EEXIST/.test(error.message) ? error.message : 'evaluation_setup_failed'); process.exitCode = 1 })
