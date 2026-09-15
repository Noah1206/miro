/**
 * 계좌이체 수납 설정. 계좌 정보는 코드에 박지 않는다 — 운영에서 넣어야 비로소 열린다.
 *
 * `rechargeCatalog` 와 같은 방침이다: 값이 없거나 의심스러우면 받는 대신 멈춘다.
 * 입금을 받아 놓고 어느 계좌인지 모르는 상태를 만들지 않기 위해서다.
 */
export type BankAccount = {
  /** 은행명. 사용자가 보는 그대로. */
  bank: string
  /** 계좌번호. 사용자에게 보여 주는 값이므로 마스킹하지 않는다. */
  number: string
  /** 예금주. 입금 전에 사용자가 대조한다. */
  holder: string
}

/** 입금 기한(시간). 지나면 주문을 만료시키고 같은 사용자가 다시 주문할 수 있게 한다. */
export const BANK_TRANSFER_WINDOW_HOURS = 72

export function bankAccount(): BankAccount | null {
  const raw = process.env.MIRO_BANK_ACCOUNT
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('invalid bank account') }
  const a = parsed as Partial<BankAccount>
  const ok = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  if (!ok(a.bank, 40) || !ok(a.holder, 40)) throw new Error('invalid bank account')
  // 계좌번호는 숫자와 하이픈만. 안내 문구가 섞여 들어오면 사용자가 잘못된 곳에 보낸다.
  if (typeof a.number !== 'string' || !/^[0-9-]{8,30}$/.test(a.number)) throw new Error('invalid bank account')
  return { bank: a.bank!.trim(), number: a.number, holder: a.holder!.trim() }
}

/**
 * 계좌가 설정돼야 계좌이체를 받는다.
 *
 * **이 환경변수가 판매 스위치다.** mock 결제와 달리 계좌이체는 실제 수납 경로이므로
 * `productionRuntime()` 으로 막지 않는다 — 운영에서 쓰라고 만든 것이기 때문이다. 대신
 * 계좌를 넣는 행위가 곧 "이제 입금을 받겠다" 는 결정이 된다. 환불 기준과 1인 월 결제
 * 상한을 정하기 전에는 넣지 않는다.
 */
export function bankTransferEnabled(): boolean {
  return bankAccount() !== null
}
