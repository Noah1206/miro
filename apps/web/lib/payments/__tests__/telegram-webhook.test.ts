import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { POST } from '@/app/api/telegram/payments/route'
const {approve,send}=vi.hoisted(()=>({approve:vi.fn(),send:vi.fn()}))
vi.mock('../telegram',()=>({approveTelegramBankOrder:approve}))
vi.mock('../telegram-api',()=>({telegramCall:send}))
const order='12345678-1234-1234-1234-123456789abc'
function request(secret='test-secret',userId=123,chatId=123){return new Request('http://localhost/api/telegram/payments',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({callback_query:{id:'callback',from:{id:userId},data:`miro_approve:${order}`,message:{message_id:1,chat:{id:chatId}}}})})}
describe('Telegram approval webhook authorization',()=>{
 beforeEach(()=>{
  for(const [k,v]of Object.entries({MIRO_TELEGRAM_BOT_TOKEN:'test',MIRO_TELEGRAM_CHAT_ID:'123',MIRO_TELEGRAM_APPROVER_ID:'123',MIRO_TELEGRAM_ADMIN_ID:order,MIRO_TELEGRAM_WEBHOOK_SECRET:'test-secret'}))vi.stubEnv(k,v)
  approve.mockReset();send.mockReset();approve.mockResolvedValue({approved:true,amount:1000,units:100});send.mockResolvedValue({})
 })
 afterEach(()=>vi.unstubAllEnvs())
 it('rejects spoofed requests and a different chat or sender',async()=>{
  expect((await POST(request('wrong'))).status).toBe(401)
  expect((await POST(request('test-secret',999))).status).toBe(403)
  expect((await POST(request('test-secret',123,999))).status).toBe(403)
  expect(approve).not.toHaveBeenCalled()
 })
 it('approves the allowlisted sender and removes the approval button',async()=>{
  expect((await POST(request())).status).toBe(200);expect(approve).toHaveBeenCalledWith(order,order,'123')
  expect(send).toHaveBeenCalledWith('editMessageText',expect.objectContaining({reply_markup:{inline_keyboard:[]}}))
 })
 it('retries storage failures without claiming approval succeeded',async()=>{
  approve.mockRejectedValue(new Error('database'));expect((await POST(request())).status).toBe(503);expect(send).not.toHaveBeenCalled()
 })
 it('checks the live connection without approving an order or granting tokens',async()=>{
  const req=request(),body=await req.json();body.callback_query.data='miro_connection_test'
  const res=await POST(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(body)}))
  expect(res.status).toBe(200);expect(approve).not.toHaveBeenCalled()
 })
 it('normalizes newlines introduced by environment-variable input',async()=>{
  for(const key of ['MIRO_TELEGRAM_BOT_TOKEN','MIRO_TELEGRAM_CHAT_ID','MIRO_TELEGRAM_APPROVER_ID','MIRO_TELEGRAM_ADMIN_ID','MIRO_TELEGRAM_WEBHOOK_SECRET'])vi.stubEnv(key,process.env[key]+'\n')
  expect((await POST(request())).status).toBe(200);expect(approve).toHaveBeenCalledOnce()
 })
})
