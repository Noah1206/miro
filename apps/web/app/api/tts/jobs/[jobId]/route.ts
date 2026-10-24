import { currentUser } from '@/lib/auth'
import { speechQueueEnabled } from '@/lib/speech/policy'
import { readSpeech, speechFailure } from '@/lib/speech/http'
import { speechStore } from '@/lib/speech/store'
export const runtime='nodejs'
export const maxDuration=15
export async function GET(_req: Request,{params}:{params:Promise<{jobId:string}>}) {
  const user=await currentUser()
  if(!user) return new Response(null,{status:401})
  if(!speechQueueEnabled()) return new Response(null,{status:404})
  const {jobId}=await params
  if(!/^[0-9a-f-]{36}$/i.test(jobId)) return new Response(null,{status:400})
  try{return await readSpeech(user.id,jobId)}catch(error){return speechFailure(error)}
}
export async function DELETE(_req: Request,{params}:{params:Promise<{jobId:string}>}) {
  const user=await currentUser()
  if(!user)return new Response(null,{status:401})
  if(!speechQueueEnabled())return new Response(null,{status:404})
  const {jobId}=await params
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return new Response(null,{status:400})
  try{await speechStore().cancelQueued(jobId,user.id);return new Response(null,{status:204})}catch(error){return speechFailure(error)}
}
