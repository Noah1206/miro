import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { AIOrchestrator, GoldenCaseSchema, evaluateResponse, registryFromEnv, prompts, modelCost, type AIUsageRecord } from '../../packages/providers/src/index'

async function main() {
  const cases = (JSON.parse(await readFile(new URL('./golden.json', import.meta.url),'utf8')) as unknown[]).map(c => GoldenCaseSchema.parse(c))
  const live = process.argv.includes('--live')
  const ids = process.env.MIRO_EVAL_MODELS?.split(',').filter(Boolean) ?? ['reference']
  const versions = process.env.MIRO_EVAL_PROMPTS?.split(',').filter(Boolean) ?? ['v1','v2']
  const maxCost = Number(process.env.MIRO_EVAL_MAX_COST_USD ?? 0)
  if (!Number.isFinite(maxCost) || maxCost < 0) throw new Error('invalid evaluation cost limit')
  let spent = 0
  const results = []
  for (const modelId of ids) for (const version of versions) for (const c of cases) {
    let response = c.referenceResponse, latency = 0, cost: number | null = 0
    const template = prompts.get('dialogue',version)
    if (live) {
      if (modelId === 'reference') throw new Error('MIRO_EVAL_MODELS must name registry models for --live')
      const { registry, resolveModel } = registryFromEnv(() => c.referenceResponse)
      const model = registry.get(modelId), records: AIUsageRecord[] = []
      const ai = new AIOrchestrator({chain:[resolveModel(model)],explicitModel:model,maxRetries:0,context:{traceId:randomUUID()},
        budgetGuard:{async authorize(req,m) {
          const estimate=modelCost(m,Buffer.byteLength(req.system+req.prompt),req.maxTokens ?? m.maxOutputTokens)
          if (estimate===null || spent+estimate>maxCost) return {allowed:false,reason:'eval_budget'}
          spent+=estimate;return {allowed:true,reservationId:randomUUID(),maxUsageUnits:0}
        }},onUsage:r=>{records.push(r)} })
      response = await ai.generateText({task:'dialogue',system:template.system,prompt:c.context+'\n사용자: '+c.userInput,maxTokens:300,promptVersion:`dialogue:${version}`})
      latency=records.reduce((n,r)=>n+r.latencyMs,0);cost=records[0]?.estimatedCost ?? null
    }
    results.push({response,modelId,promptVersion:`dialogue:${version}`,mode:live?'live':'reference-fixture',...evaluateResponse(c,response,latency,cost)})
  }
  const report={datasetVersion:'golden-v1',createdAt:new Date().toISOString(),live,results,passed:results.filter(r=>r.pass).length,total:results.length,
    note:live?'Keyword checks are regression gates; semantic quality requires human review.':'Reference fixtures validate the harness, not model quality.'}
  const out=process.env.MIRO_EVAL_OUTPUT ?? '/tmp/miro-ai-eval-report.json'
  await writeFile(out,JSON.stringify(report,null,2)+'\n')
  console.log(`${report.passed}/${report.total} checks passed (${live?'live':'reference harness only'}). ${out}`)
  if (report.passed!==report.total) process.exitCode=1
}
main().catch(e=>{console.error(e instanceof Error ? e.message : 'evaluation failed');process.exitCode=1})
