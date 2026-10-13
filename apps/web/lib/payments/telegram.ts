import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db, bankTransferOrders, bankTelegramRequests, adminUsers, adminActions, rechargeGrants, paymentEvents } from '@miro/db'
import { telegramPaymentConfig } from './telegram-config'
import { telegramCall } from './telegram-api'
import { rechargeProduct } from '@miro/config'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function requestBankDeposit(userId:string, orderId:string, requestId:string) {
  if (!UUID.test(orderId) || !UUID.test(requestId)) throw new Error('INVALID_REQUEST')
  if (!telegramPaymentConfig()) throw new Error('TELEGRAM_UNAVAILABLE')
  await db.transaction(async tx=>{
    const [order]=await tx.select().from(bankTransferOrders).where(and(eq(bankTransferOrders.id,orderId),eq(bankTransferOrders.userId,userId))).limit(1).for('update')
    if (!order || order.status!=='awaiting' || order.expiresAt<=new Date()) throw new Error('ORDER_NOT_PENDING')
    await tx.insert(bankTelegramRequests).values({id:requestId,orderId}).onConflictDoNothing()
    const [request]=await tx.select().from(bankTelegramRequests).where(eq(bankTelegramRequests.id,requestId)).limit(1)
    if (request?.orderId!==orderId) throw new Error('REQUEST_MISMATCH')
  })
  await deliverBankTelegramRequests(requestId)
  const [request]=await db.select().from(bankTelegramRequests).where(eq(bankTelegramRequests.id,requestId)).limit(1)
  return { sent:!!request?.sentAt }
}

/** Lease before sending; failed sends remain durable for the maintenance cron. */
export async function deliverBankTelegramRequests(requestId?:string) {
  const config=telegramPaymentConfig()
  if (!config) return {sent:0}
  let sent=0
  for(let i=0;i<(requestId?1:20);i++) {
    const claimed=await db.transaction(async tx=>{
      const now=new Date()
      const [request]=await tx.select().from(bankTelegramRequests).where(and(isNull(bankTelegramRequests.sentAt),
        or(isNull(bankTelegramRequests.leaseUntil),lt(bankTelegramRequests.leaseUntil,now)),
        ...(requestId?[eq(bankTelegramRequests.id,requestId)]:[]))).orderBy(bankTelegramRequests.createdAt).limit(1).for('update',{skipLocked:true})
      if (!request) return null
      await tx.update(bankTelegramRequests).set({leaseUntil:new Date(now.getTime()+60000),attempts:request.attempts+1}).where(eq(bankTelegramRequests.id,request.id))
      return request
    })
    if (!claimed) break
    const [order]=await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id,claimed.orderId)).limit(1)
    if (!order || order.status!=='awaiting' || order.expiresAt<=new Date()) {
      await db.update(bankTelegramRequests).set({sentAt:new Date()}).where(eq(bankTelegramRequests.id,claimed.id)); continue
    }
    try {
      const message=await telegramCall<{message_id:number}>('sendMessage',{
        chat_id:config.chatId,
        text:`[MIRO 입금 확인 요청]\n${order.amountMinor.toLocaleString('ko-KR')}원 · ${order.units?.toLocaleString('ko-KR')} 토큰\n입금자명: ${order.depositorName}\n대조 코드: ${order.referenceCode}\n주문: ${order.id}\n\n은행에서 실제 입금을 확인한 뒤 승인해 주세요.`,
        reply_markup:{inline_keyboard:[[{text:'✅ 입금 확인 · 승인',callback_data:`miro_approve:${order.id}`}]]},
      })
      await db.update(bankTelegramRequests).set({sentAt:new Date(),messageId:message.message_id,leaseUntil:null}).where(eq(bankTelegramRequests.id,claimed.id)); sent++
    } catch { /* Lease expires; maintenance retries. Never mark failure as delivery success. */ }
  }
  return {sent}
}

/** Approval, audit, credit grant and settlement are one transaction. Cron cannot double-grant. */
export async function approveTelegramBankOrder(orderId:string, adminId:string, telegramUserId:string) {
  if (!UUID.test(orderId) || !UUID.test(adminId)) throw new Error('INVALID_ORDER')
  return db.transaction(async tx=>{
    const [admin]=await tx.select().from(adminUsers).where(eq(adminUsers.id,adminId)).limit(1).for('update')
    if (!admin || admin.role!=='superadmin' || admin.disabledAt) throw new Error('NOT_AUTHORIZED')
    const [order]=await tx.select().from(bankTransferOrders).where(eq(bankTransferOrders.id,orderId)).limit(1).for('update')
    if (!order || order.kind!=='recharge' || !Number.isSafeInteger(order.units) || !order.units || order.units<=0 || order.amountMinor<=0 || order.currency!=='KRW') throw new Error('ORDER_NOT_FOUND')
    if (order.settledAt) return {approved:false,units:order.units,amount:order.amountMinor}
    if (!['awaiting','approved'].includes(order.status) || (order.status==='awaiting' && order.expiresAt<=new Date())) throw new Error('ORDER_NOT_PENDING')
    const now=new Date(), note=`Telegram 입금 승인 · ${telegramUserId}`
    const ref=`bank_rc:${order.id}`,validDays=order.productId?rechargeProduct(order.productId)?.validDays:undefined
    await tx.insert(rechargeGrants).values({userId:order.userId,amount:order.units,source:'purchase',provider:'bank_transfer',externalRef:ref,
      expiresAt:validDays?new Date(now.getTime()+validDays*86400000):null}).onConflictDoNothing()
    await tx.insert(paymentEvents).values({userId:order.userId,provider:'bank_transfer',externalEventId:`bank:${order.id}`,externalRef:ref,type:'purchase',
      payload:{source:'telegram',orderId:order.id,amountMinor:order.amountMinor,decidedBy:adminId}}).onConflictDoNothing()
    if (order.status==='awaiting') await tx.insert(adminActions).values({adminId,action:'bank_order_approve',bankOrderId:order.id,previousStatus:'awaiting',newStatus:'approved',note})
    await tx.update(bankTransferOrders).set({status:'approved',settledAt:now,decidedAt:order.decidedAt??now,decidedBy:order.decidedBy??adminId,note:order.note||note}).where(eq(bankTransferOrders.id,order.id))
    return {approved:true,units:order.units,amount:order.amountMinor}
  })
}
