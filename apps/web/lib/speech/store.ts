import { randomUUID } from 'node:crypto'
import { db, sql, type Db } from '@miro/db'
import type { TtsRequest } from '@miro/providers'
import { MAX_SPEECH_BYTES, SpeechError, speechKey, speechUserKey, type SpeechPolicy, type SpeechSpec } from './policy'

export type SpeechJob = { id: string; user_id: string; session_id: string; message_id: string; part: number; cache_key: string; model_version: string; reference_version: string;
  payload: TtsRequest; state: 'queued'|'running'|'done'|'failed'|'uncertain'; lease_token: string|null; lease_until: Date|null; created_at: Date; audio: Buffer|null; content_type: string|null; error_code: string|null }
const gate = sql`SELECT pg_advisory_xact_lock(hashtext('miro:speech:gate'))`

export function speechStore(database: Db = db) {
  return {
    async enqueue(spec: SpeechSpec, policy: SpeechPolicy) {
      return database.transaction(async tx => {
        await tx.execute(gate)
        await tx.execute(sql`DELETE FROM speech_synthesis_jobs WHERE state='done' AND created_at < now()-interval '24 hours'`)
        // Keep uncertain/active leases even after their audio/chat/account is deleted.
        await tx.execute(sql`DELETE FROM speech_synthesis_usage WHERE state IN ('queued','finished') AND created_at < now()-interval '24 hours'`)
        const key = speechKey(spec)
        const [old] = await tx.execute<SpeechJob>(sql`SELECT * FROM speech_synthesis_jobs WHERE cache_key=${key}`)
        if (old) return old
        const [paused] = await tx.execute(sql`SELECT job_id FROM speech_synthesis_usage WHERE state='uncertain' LIMIT 1`)
        if (paused) throw new SpeechError('speech_provider_paused')
        const [cost] = await tx.execute<{ global_cost: string; user_cost: string }>(sql`
          SELECT COALESCE(sum(reservation_micro_usd) FILTER(WHERE created_at > now()-interval '24 hours'),0)::text global_cost,
           COALESCE(sum(reservation_micro_usd) FILTER(WHERE user_key=${speechUserKey(spec.userId)} AND created_at > now()-interval '24 hours'),0)::text user_cost
          FROM speech_synthesis_usage`)
        const [usage] = await tx.execute<{ global_pending: string; user_pending: string; bytes: string }>(sql`
          SELECT count(*) FILTER(WHERE state IN ('queued','running','uncertain'))::text global_pending,
           count(*) FILTER(WHERE user_id=${spec.userId} AND state IN ('queued','running','uncertain'))::text user_pending,
           (COALESCE(sum(octet_length(audio)),0)+count(*) FILTER(WHERE state IN ('queued','running'))*${MAX_SPEECH_BYTES})::text bytes
          FROM speech_synthesis_jobs`)
        if (!usage || !cost || Number(cost.global_cost)+policy.maxJobMicroUsd>policy.globalDailyMicroUsd || Number(cost.user_cost)+policy.maxJobMicroUsd>policy.userDailyMicroUsd) throw new SpeechError('speech_daily_limit',429)
        if (Number(usage.global_pending)>=policy.globalPending || Number(usage.user_pending)>=policy.userPending || Number(usage.bytes)+MAX_SPEECH_BYTES>policy.cacheBytes) throw new SpeechError('speech_queue_full',429)
        const [job] = await tx.execute<SpeechJob>(sql`INSERT INTO speech_synthesis_jobs(user_id,session_id,message_id,part,cache_key,model_version,reference_version,payload,reservation_micro_usd)
          VALUES(${spec.userId},${spec.sessionId},${spec.messageId},${spec.part},${key},${spec.modelVersion},${spec.referenceVersion},${JSON.stringify(spec.payload)}::jsonb,${policy.maxJobMicroUsd}) RETURNING *`)
        await tx.execute(sql`INSERT INTO speech_synthesis_usage(job_id,user_key,reservation_micro_usd) VALUES(${job!.id},${speechUserKey(spec.userId)},${policy.maxJobMicroUsd})`)
        return job!
      })
    },
    async owned(id: string, userId: string) {
      const [job] = await database.execute<SpeechJob>(sql`SELECT * FROM speech_synthesis_jobs WHERE id=${id} AND user_id=${userId}`)
      return job ?? null
    },
    async cancelQueued(id: string,userId: string) {
      return database.transaction(async tx => {
        await tx.execute(gate)
        // Only an undispatched job can release its reservation.
        const [removed]=await tx.execute(sql`DELETE FROM speech_synthesis_jobs WHERE id=${id} AND user_id=${userId} AND state='queued' RETURNING id`)
        if(removed) await tx.execute(sql`DELETE FROM speech_synthesis_usage WHERE job_id=${id} AND state='queued'`)
      })
    },
    async claim(policy: SpeechPolicy) {
      return database.transaction(async tx => {
        await tx.execute(gate)
        await tx.execute(sql`UPDATE speech_synthesis_jobs SET state='failed',error_code='expired_before_dispatch',finished_at=now() WHERE state='queued' AND created_at < now()-interval '1 hour'`)
        await tx.execute(sql`UPDATE speech_synthesis_usage SET state='uncertain' WHERE state='running' AND lease_until < now()`)
        await tx.execute(sql`UPDATE speech_synthesis_jobs SET state='uncertain',error_code='worker_interrupted' WHERE state='running' AND id IN (SELECT job_id FROM speech_synthesis_usage WHERE state='uncertain')`)
        const [active] = await tx.execute(sql`SELECT job_id FROM speech_synthesis_usage WHERE state IN ('running','uncertain') LIMIT 1`)
        if (active) return null
        const [next] = await tx.execute<SpeechJob>(sql`SELECT * FROM speech_synthesis_jobs WHERE state='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)
        if (!next) return null
        const [job] = await tx.execute<SpeechJob>(sql`UPDATE speech_synthesis_jobs SET state='running',lease_token=${randomUUID()},lease_until=now()+${policy.timeoutMs}*interval '1 millisecond'
          WHERE id=${next.id} AND state='queued' RETURNING *`)
        const [reserved]=await tx.execute(sql`UPDATE speech_synthesis_usage SET state='running',lease_token=${job!.lease_token},lease_until=${job!.lease_until} WHERE job_id=${next.id} AND state='queued' RETURNING job_id`)
        if(!reserved) throw new SpeechError('speech_reservation_missing')
        return job ?? null
      })
    },
    async finish(job: SpeechJob, audio: ArrayBuffer, type: string) {
      if (!audio.byteLength || audio.byteLength>MAX_SPEECH_BYTES || !/^audio\/(wav|x-wav|mpeg|ogg|mp4)(;|$)/i.test(type)) throw new SpeechError('invalid_speech_audio')
      await database.transaction(async tx=>{
        const [saved]=await tx.execute(sql`UPDATE speech_synthesis_usage SET state='finished' WHERE job_id=${job.id} AND lease_token=${job.lease_token} AND state IN ('running','uncertain') RETURNING job_id`)
        if(!saved) throw new SpeechError('speech_lease_lost')
        await tx.execute(sql`UPDATE speech_synthesis_jobs SET state='done',audio=${Buffer.from(audio)},content_type=${type},finished_at=now(),error_code=NULL
          WHERE id=${job.id} AND lease_token=${job.lease_token} AND state IN ('running','uncertain')`)
      })
    },
    async fail(job: SpeechJob, uncertain: boolean, code: string) {
      await database.transaction(async tx=>{
        await tx.execute(sql`UPDATE speech_synthesis_usage SET state=${uncertain?'uncertain':'finished'} WHERE job_id=${job.id} AND lease_token=${job.lease_token} AND state IN ('running','uncertain')`)
        await tx.execute(sql`UPDATE speech_synthesis_jobs SET state=${uncertain?'uncertain':'failed'},error_code=${code},finished_at=now()
          WHERE id=${job.id} AND lease_token=${job.lease_token} AND state IN ('running','uncertain')`)
      })
    },
    /** Operator only, after confirming native compute stopped; never retries a job. */
    async acknowledgeStopped(id: string) {
      await database.transaction(async tx=>{
        await tx.execute(gate)
        await tx.execute(sql`UPDATE speech_synthesis_usage SET state='finished' WHERE job_id=${id} AND state='uncertain'`)
        await tx.execute(sql`UPDATE speech_synthesis_jobs SET state='failed',error_code='operator_confirmed_stopped',finished_at=now() WHERE id=${id} AND state='uncertain'`)
      })
    },
  }
}
