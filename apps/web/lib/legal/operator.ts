/**
 * 운영자 정보 — 약관·처리방침·안내·광고 동의 문서가 함께 쓴다. 코드로 알 수 없는 값이라 사용자가 정한다(2026-09-30).
 * 비어 있으면 문서에 '입력 필요' 로 드러난다 — 지어낸 값을 싣지 않는다.
 */
export const OPERATOR = {
  /** 운영 주체(개인 이름 또는 상호). */
  name: '',
  /** 이용자 문의·환불·개인정보 요청을 받는 이메일. */
  email: '',
  /** 개인정보 보호책임자 이름(소규모 운영이면 보통 운영자 본인). */
  privacyOfficer: '',
  /** 사업자 정보 — 대표자, 주소, 전화, 사업자등록번호, 통신판매업 신고번호(전자상거래법 제10조·제13조, 유료 판매 시). */
  business: '',
  /**
   * 운영에서 Gemini API 를 유료 등급 키로 쓰는가. Google 약관상 무료 등급이면 대화를 Google 제품·AI 개선에 쓰고
   * 사람이 읽을 수 있어서 문구가 달라진다. null = 확인 전.
   */
  geminiPaid: null as boolean | null,
}

const need = (label: string) => `[${label} 입력 필요]`
export const operatorName = () => OPERATOR.name || need('운영자 이름·상호')
export const operatorEmail = () => OPERATOR.email || need('문의 이메일')
export const privacyOfficer = () => OPERATOR.privacyOfficer || need('개인정보 보호책임자')
export const businessInfo = () => OPERATOR.business || need('사업자 정보(대표자·주소·전화·사업자등록번호·통신판매업 신고번호)')

/** Google 이 Gemini API 로 받은 대화를 어떻게 쓰는지 — 요금 등급에 따라 다르다(Gemini API 추가 약관, 2026-04-28 갱신). */
export function geminiDataUse(): string {
  if (OPERATOR.geminiPaid === true) return 'Google은 유료 이용 조건에 따라 이 내용을 자사 AI 학습에 쓰지 않으며, 정책 위반을 감시하기 위해 제한된 기간만 보관합니다.'
  if (OPERATOR.geminiPaid === false) return 'Google은 무료 이용 조건에 따라 이 내용을 자사 제품과 AI 개선에 쓸 수 있으며, 계정 정보와 분리한 뒤 사람이 읽고 검토할 수 있습니다.'
  return need('Gemini API 요금 등급(유료/무료) — 등급에 따라 Google의 데이터 이용 방식이 다릅니다')
}
