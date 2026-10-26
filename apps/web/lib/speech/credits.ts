import { db, sql } from '@miro/db'
import { commit, reserve, type UsageTransaction } from '../usage/guard'
import { SpeechError } from './policy'
import { speechCreditsEnabled, speechProducts, speechTrial } from './credits-policy'

export const creditGate = sql`SELECT pg_advisory_xact_lock(hashtext('miro:speech:credits'))`
type Grant = { id: string; seconds: number; consumed: number; reserved: number }

/** Caller holds the queue lock first, then creditGate. No external calls under locks. */
export async function reserveSpeechSeconds(tx: UsageTransaction, userId: string, jobId: string, seconds: number) {
  await tx.execute(creditGate)
  const grants = await tx.execute<Grant>(sql`SELECT * FROM speech_credit_grants WHERE user_id=${userId}
    AND seconds > consumed+reserved ORDER BY created_at,id FOR UPDATE`)
  if (grants.reduce((n,g)=>n+g.seconds-g.consumed-g.reserved,0)<seconds) throw new SpeechError('speech_balance_low',402)
  let remaining=seconds
  for(const grant of grants) {
    const take=Math.min(remaining,grant.seconds-grant.consumed-grant.reserved)
    if(take<=0) continue
    await tx.execute(sql`UPDATE speech_credit_grants SET reserved=reserved+${take} WHERE id=${grant.id}`)
    await tx.execute(sql`INSERT INTO speech_credit_allocations(job_id,grant_id,user_id,seconds) VALUES(${jobId},${grant.id},${userId},${take})`)
    remaining-=take
  }
}

/** Atomically settles or refunds once. Uncertain provider work is refunded to the user too. */
export async function settleSpeechSeconds(tx: UsageTransaction, jobId: string, actualSeconds: number|null) {
  await tx.execute(creditGate)
  const allocations=await tx.execute<{grant_id:string;seconds:number}>(sql`SELECT grant_id,seconds FROM speech_credit_allocations
    WHERE job_id=${jobId} AND state='reserved' ORDER BY created_at,grant_id FOR UPDATE`)
  const maximum=allocations.reduce((n,a)=>n+a.seconds,0)
  let remaining=actualSeconds===null?0:Math.ceil(actualSeconds)
  if(remaining>maximum) throw new SpeechError('speech_duration_exceeded')
  for(const a of allocations) {
    const charged=Math.min(remaining,a.seconds);remaining-=charged
    await tx.execute(sql`UPDATE speech_credit_grants SET reserved=reserved-${a.seconds},consumed=consumed+${charged} WHERE id=${a.grant_id}`)
    await tx.execute(sql`UPDATE speech_credit_allocations SET charged=${charged},state=${actualSeconds===null?'refunded':'committed'}
      WHERE job_id=${jobId} AND grant_id=${a.grant_id} AND state='reserved'`)
  }
}

export async function speechBalance(userId:string, grantTrial=true) {
  if(!speechCreditsEnabled()) return {enabled:false,remainingSeconds:0,reservedSeconds:0,products:[]}
  return db.transaction(async tx=>{
    await tx.execute(creditGate)
    const trial=speechTrial()
    if(grantTrial && trial.seconds && trial.users) {
      const [count]=await tx.execute<{count:string}>(sql`SELECT count(*)::text count FROM speech_credit_grants WHERE kind='trial'`)
      if(Number(count?.count)<trial.users) await tx.execute(sql`INSERT INTO speech_credit_grants(user_id,kind,reference,seconds)
        VALUES(${userId},'trial',${'trial:'+userId},${trial.seconds}) ON CONFLICT DO NOTHING`)
    }
    const [row]=await tx.execute<{remaining:string;reserved:string}>(sql`SELECT COALESCE(sum(seconds-consumed-reserved),0)::text remaining,
      COALESCE(sum(reserved),0)::text reserved FROM speech_credit_grants WHERE user_id=${userId}`)
    return {enabled:true,remainingSeconds:Number(row?.remaining??0),reservedSeconds:Number(row?.reserved??0),products:speechProducts()}
  })
}

/** Exchange purchased wallet funds for seconds, atomically with existing wallet settlement. */
export async function purchaseSpeech(userId:string, productId:string, requestId:string) {
  if(!speechCreditsEnabled()) throw new SpeechError('voice_not_ready')
  const product=speechProducts().find(p=>p.id===productId)
  if(!product || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new SpeechError('invalid_speech_product',400)
  await db.transaction(async tx=>{
    await tx.execute(creditGate)
    const reference=`purchase:${userId}:${requestId}`
    const [old]=await tx.execute<{seconds:number}>(sql`SELECT seconds FROM speech_credit_grants WHERE reference=${reference}`)
    if(old) { if(old.seconds!==product.seconds) throw new SpeechError('speech_purchase_mismatch',409);return }
    const reservation=await reserve({userId,kind:'voicePack',units:product.seconds,tokenAmount:product.units,
      paidOnly:true,idempotencyKey:reference},tx)
    if(reservation.reused) throw new SpeechError('speech_purchase_mismatch',409)
    await tx.execute(sql`INSERT INTO speech_credit_grants(user_id,kind,reference,seconds) VALUES(${userId},'purchase',${reference},${product.seconds})`)
    await commit(reservation.reservationId,undefined,tx)
  })
  return speechBalance(userId,false)
}
