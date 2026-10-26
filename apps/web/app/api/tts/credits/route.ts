import { currentUser } from '@/lib/auth'
import { purchaseSpeech, speechBalance } from '@/lib/speech/credits'
import { speechFailure } from '@/lib/speech/http'
import { UsageExceededError } from '@/lib/usage/guard'
export const runtime='nodejs'
export async function GET() {
  const user=await currentUser();if(!user)return new Response(null,{status:401})
  try{return Response.json(await speechBalance(user.id),{headers:{'cache-control':'private, no-store'}})}catch(e){return speechFailure(e)}
}
export async function POST(req:Request) {
  const user=await currentUser();if(!user)return new Response(null,{status:401})
  const body=await req.json().catch(()=>null)
  if(typeof body?.productId!=='string'||typeof body?.requestId!=='string'||body?.confirmed!==true)return new Response(null,{status:400})
  try{return Response.json(await purchaseSpeech(user.id,body.productId,body.requestId),{headers:{'cache-control':'private, no-store'}})}
  catch(e){if(e instanceof UsageExceededError)return Response.json({error:'speech_purchase_balance_low'},{status:402});return speechFailure(e)}
}
