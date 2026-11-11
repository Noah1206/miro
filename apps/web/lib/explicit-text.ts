/**
 * 11/12 사용자: 언베일을 켜지 않아도 인트로의 선정적인 글·사진이 그대로 보였다 — 인트로 줄에는 '언베일 전용' 표시가 없고, 사진 가림은 표지가 언베일인 작품(coverUnveil)에만 걸려 있었다.
 * 언베일을 안 켠 사람에게는 서버가 노골적인 인트로 글을 가림 문구로 바꿔 보내고(원문이 화면으로 가지 않는다), 그런 글이 있는 작품의 인트로 사진은 흐린다.
 * ponytail: 낱말 목록으로 가린다(빠지는 표현이 있을 수 있다) — 제대로 하려면 인트로 줄·사진마다 언베일 표시를 두고 만든 사람이 고르게 한다.
 */
const EXPLICIT = /자지|보지|좆|섹스|유두|젖꼭지|삽입|사정|정액|알몸|나체|오나홀|자위|애액|음부|성기|음경|클리토|펠라|박아|박히|박힌|따먹|절정|음란|야동|딜도|콘돔|발기|젖가슴|사타구니|음모|질내|구강성교|성관계|쑤시|빨아 ?줘|가버려|가버릴/
export const explicitText = (text: string | null | undefined): boolean => !!text && EXPLICIT.test(text)
/** 가린 자리에 보이는 글(번역 키) — 언베일을 켜면 원문이 보인다. */
export const VEILED_LINE = '언베일을 켜면 볼 수 있는 장면이에요.'

if (process.argv[1]?.endsWith('explicit-text.ts')) {
  console.assert(explicitText('그녀의 보지가') && !explicitText('오늘은 날씨가 좋네요. 같이 걸을까?') && !explicitText(null))
}
