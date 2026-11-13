'use client'
/** 포트원 V2 브라우저 SDK — 본인인증(10/2)과 카드 결제(11/13)가 같이 쓴다. 필요한 화면에서 누를 때 한 번만 불러온다. */
type Result = { code?: string; message?: string; paymentId?: string; transactionId?: string } | undefined
export type PortOneSDK = {
  requestIdentityVerification(req: Record<string, unknown>): Promise<Result>
  requestPayment(req: Record<string, unknown>): Promise<Result>
}
let loading: Promise<PortOneSDK> | null = null
export function portOne(): Promise<PortOneSDK> {
  const w = window as unknown as { PortOne?: PortOneSDK }
  if (w.PortOne) return Promise.resolve(w.PortOne)
  return loading ??= new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.portone.io/v2/browser-sdk.js'
    s.onload = () => (w.PortOne ? ok(w.PortOne) : fail(new Error('portone_sdk')))
    s.onerror = () => { loading = null; fail(new Error('portone_sdk')) }
    document.head.append(s)
  })
}
