import { randomUUID } from 'node:crypto'
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db,users,adminUsers,adminActions,bankTransferOrders,bankTelegramRequests,rechargeGrants } from '@miro/db'
import { createBankOrder,settleApprovedOrders } from '../bank-transfer'
import { requestBankDeposit,deliverBankTelegramRequests,approveTelegramBankOrder } from '../telegram'
const {send}=vi.hoisted(()=>({send:vi.fn()}))
vi.mock('../telegram-api',()=>({telegramCall:send}))
const describeDb=process.env.DATABASE_URL?describe:describe.skip
describeDb('Telegram deposit request and atomic settlement',()=>{
  const userIds:string[]=[],adminIds:string[]=[]
  beforeEach(()=>{
    vi.stubEnv('MIRO_BANK_ACCOUNT',JSON.stringify({bank:'국민은행',number:'123-456-789',holder:'test'}))
    vi.stubEnv('MIRO_RECHARGE_PRODUCTS',JSON.stringify([{id:'telegram-test',name:'test',units:100,priceMinor:1000,currency:'KRW'}]))
    for(const [key,value] of Object.entries({MIRO_TELEGRAM_BOT_TOKEN:'test',MIRO_TELEGRAM_CHAT_ID:'123',MIRO_TELEGRAM_APPROVER_ID:'123',MIRO_TELEGRAM_ADMIN_ID:randomUUID(),MIRO_TELEGRAM_WEBHOOK_SECRET:'test-secret'}))vi.stubEnv(key,value)
    send.mockReset();send.mockResolvedValue({message_id:1})
  })
  afterEach(()=>vi.unstubAllEnvs())
  afterAll(async()=>{
    for(const id of userIds)await db.delete(users).where(eq(users.id,id))
    for(const id of adminIds){await db.delete(adminActions).where(eq(adminActions.adminId,id));await db.delete(adminUsers).where(eq(adminUsers.id,id))}
  })
  async function fixture(role:'superadmin'|'viewer'='superadmin'){
    const [u]=await db.insert(users).values({email:`tg-${randomUUID()}@miro.dev`}).returning();userIds.push(u!.id)
    const [a]=await db.insert(adminUsers).values({email:`tg-admin-${randomUUID()}@miro.dev`,passwordHash:'test',role}).returning();adminIds.push(a!.id)
    const order=await createBankOrder({userId:u!.id,kind:'recharge',productId:'telegram-test',requestId:randomUUID()})
    return{userId:u!.id,adminId:a!.id,order}
  }
  it('sends every intentional request and deduplicates retries of the same request',async()=>{
    const f=await fixture(),id=randomUUID()
    expect(await requestBankDeposit(f.userId,f.order.id,id)).toEqual({sent:true})
    expect(await requestBankDeposit(f.userId,f.order.id,id)).toEqual({sent:true})
    expect(send).toHaveBeenCalledTimes(1)
    await requestBankDeposit(f.userId,f.order.id,randomUUID());expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]![1].reply_markup.inline_keyboard[0][0].callback_data).toBe(`miro_approve:${f.order.id}`)
  })
  it('rejects another user and persists failed delivery for retry',async()=>{
    const f=await fixture(),id=randomUUID()
    await expect(requestBankDeposit(randomUUID(),f.order.id,id)).rejects.toThrow('ORDER_NOT_PENDING')
    send.mockRejectedValueOnce(new Error('network'))
    expect(await requestBankDeposit(f.userId,f.order.id,id)).toEqual({sent:false})
    await db.update(bankTelegramRequests).set({leaseUntil:new Date(0)}).where(eq(bankTelegramRequests.id,id))
    expect(await deliverBankTelegramRequests(id)).toEqual({sent:1})
  })
  it('concurrent approvals and the legacy cron credit exactly once immediately',async()=>{
    const f=await fixture()
    const results=await Promise.all([approveTelegramBankOrder(f.order.id,f.adminId,'123'),approveTelegramBankOrder(f.order.id,f.adminId,'123')])
    expect(results.filter(r=>r.approved)).toHaveLength(1)
    await settleApprovedOrders()
    const grants=await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId,f.userId));expect(grants).toHaveLength(1);expect(grants[0]!.amount).toBe(100)
    const [order]=await db.select().from(bankTransferOrders).where(eq(bankTransferOrders.id,f.order.id));expect(order!.settledAt).not.toBeNull()
    expect(await db.select().from(adminActions).where(eq(adminActions.bankOrderId,f.order.id))).toHaveLength(1)
  })
  it('rejects unprivileged administrators and expired orders without a grant',async()=>{
    const f=await fixture('viewer')
    await expect(approveTelegramBankOrder(f.order.id,f.adminId,'123')).rejects.toThrow('NOT_AUTHORIZED')
    const x=await fixture();await db.update(bankTransferOrders).set({expiresAt:new Date(0)}).where(eq(bankTransferOrders.id,x.order.id))
    await expect(approveTelegramBankOrder(x.order.id,x.adminId,'123')).rejects.toThrow('ORDER_NOT_PENDING')
    expect(await db.select().from(rechargeGrants).where(eq(rechargeGrants.userId,x.userId))).toHaveLength(0)
  })
})
