import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramPaymentConfig } from '@/lib/payments/telegram-config'
import { telegramCall } from '@/lib/payments/telegram-api'
import { approveTelegramBankOrder } from '@/lib/payments/telegram'
const updateSchema=z.object({callback_query:z.object({id:z.string(),from:z.object({id:z.number().int()}),data:z.string(),message:z.object({message_id:z.number().int(),chat:z.object({id:z.number().int()})})}).optional()})
export async function POST(req:Request) {
  const config=telegramPaymentConfig()
  if (!config) return new Response(null,{status:503})
  const supplied=Buffer.from(req.headers.get('x-telegram-bot-api-secret-token')??''),expected=Buffer.from(config.webhookSecret)
  if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return new Response(null,{status:401})
  if (Number(req.headers.get('content-length')??0)>16384) return new Response(null,{status:413})
  const raw=await req.text()
  if (raw.length>16384) return new Response(null,{status:413})
  let parsed
  try {parsed=updateSchema.safeParse(JSON.parse(raw))} catch {return new Response(null,{status:400})}
  if (!parsed.success) return new Response(null,{status:400})
  const callback=parsed.data.callback_query
  if (!callback) return NextResponse.json({ok:true})
  if (String(callback.from.id)!==config.approverId || String(callback.message.chat.id)!==config.chatId) return new Response(null,{status:403})
  if (callback.data==='miro_connection_test') {
    await telegramCall('answerCallbackQuery',{callback_query_id:callback.id,text:'미로 서버 연결과 본인 승인 권한을 확인했습니다.'}).catch(()=>{})
    await telegramCall('editMessageText',{chat_id:config.chatId,message_id:callback.message.message_id,text:'✅ MIRO 텔레그램 연결 확인 완료\n입금 요청 알림과 본인 승인 버튼이 연결됐습니다.\n이 메시지는 연결 시험이며 실제 주문 승인·토큰 지급은 하지 않았습니다.',reply_markup:{inline_keyboard:[]}}).catch(()=>{})
    return NextResponse.json({ok:true})
  }
  const match=/^miro_approve:([a-f0-9-]{36})$/i.exec(callback.data)
  if (!match) return NextResponse.json({ok:true})
  try {
    const result=await approveTelegramBankOrder(match[1]!,config.adminId,config.approverId)
    await telegramCall('answerCallbackQuery',{callback_query_id:callback.id,text:result.approved?'승인 완료 · 토큰을 즉시 지급했습니다.':'이미 승인·지급된 주문입니다.'}).catch(()=>{})
    await telegramCall('editMessageText',{chat_id:config.chatId,message_id:callback.message.message_id,
      text:`✅ MIRO 승인 · 지급 완료\n${result.amount.toLocaleString('ko-KR')}원 · ${result.units.toLocaleString('ko-KR')} 토큰\n주문: ${match[1]}`,reply_markup:{inline_keyboard:[]}}).catch(()=>{})
    return NextResponse.json({ok:true})
  } catch (e) {
    if (['ORDER_NOT_PENDING','ORDER_NOT_FOUND','NOT_AUTHORIZED','INVALID_ORDER'].includes((e as Error).message)) {
      await telegramCall('answerCallbackQuery',{callback_query_id:callback.id,text:'승인할 수 없는 주문이거나 승인 권한이 없습니다.',show_alert:true}).catch(()=>{})
      return NextResponse.json({ok:true})
    }
    return new Response(null,{status:503})
  }
}
