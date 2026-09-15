import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
/** Metadata only; no raw prompts/responses/IP, never secrets. */
export async function aiStats() {
  const [summary, recent, budgets] = await Promise.all([
    db.execute(sql`select task, provider, model_id, model_version, prompt_version, count(*)::int as attempts,
      count(*) filter (where ok)::int as succeeded, count(*) filter (where fallback_used)::int as fallbacks,
      count(*) filter (where estimated_cost is null)::int as unknown_cost_attempts,
      sum(estimated_cost) as estimated_cost, sum(actual_cost) as actual_cost, sum(usage_units)::int as usage_units,
      round(avg(latency_ms))::int as mean_latency_ms from ai_usage where created_at >= now() - interval '1 day'
      group by task, provider, model_id, model_version, prompt_version order by attempts desc`),
    db.execute(sql`select trace_id, request_id, task, provider, model_id, prompt_version, status, ok, error, fallback_used,
      latency_ms, input_tokens, output_tokens, usage_units, estimated_cost, created_at from ai_usage order by created_at desc limit 50`),
    db.execute(sql`select key, requests, cost from ai_budget_counters where expires_at > now() and key not like '%:user:%' and key not like '%:ip:%' order by key limit 200`),
  ])
  return { summary: [...summary], recent: [...recent], budgets: [...budgets] }
}
