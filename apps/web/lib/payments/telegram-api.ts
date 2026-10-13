import { telegramPaymentConfig } from './telegram-config'
export async function telegramCall<T>(method:'sendMessage'|'answerCallbackQuery'|'editMessageText', body:Record<string,unknown>):Promise<T> {
  const config=telegramPaymentConfig()
  if (!config) throw new Error('TELEGRAM_UNAVAILABLE')
  const res=await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(8000), cache:'no-store',
  })
  const data=await res.json() as {ok:boolean;result:T}
  // Never surface request URLs or the token in logs/errors.
  if (!res.ok || !data.ok) throw new Error('TELEGRAM_DELIVERY_FAILED')
  return data.result
}
