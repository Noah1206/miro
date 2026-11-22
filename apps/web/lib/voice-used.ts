/**
 * 이 브라우저에서 음성 모드를 한 번이라도 켰는지(방별 음성 켬 miro:immersive:<방>, 첫 켬 안내 miro:voice-intro:<회원>).
 * 11/19 사용자: 음성을 쓰는 사람만 서버를 미리 깨운다(GPU 비용). 홈(view-beacon)과 대화방(immersive)이 같이 쓴다.
 */
export const usedVoice = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      if ((k.startsWith('miro:immersive:') || k.startsWith('miro:voice-intro:')) && localStorage.getItem(k) === '1') return true
    }
  } catch { /* 저장소를 막은 브라우저 — 깨우지 않는다 */ }
  return false
}
