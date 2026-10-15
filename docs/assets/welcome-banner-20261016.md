# 백도현 화이트 웰컴 배너 — 2026-10-16

- 인물: 공개 공식 캐릭터 백도현. 원래 얼굴·긴 흑발·동그란 철테 안경·은 이어커프·장갑을 참조했다.
- 주 카피: **가입하면 1,000토큰 무료**. 가입 조건과 무료 지급량을 가장 큰 두 줄로 표시하고, **첫 대화는, 내가 살게요.**는 작은 보조 문구로 둔다.
- 조건: 신규 계정당 1회, 가입 설정 완료 시 지급, 지급 후 7일 사용. WELCOME_GRANT를 300→1,000으로 변경했다. 기존 계정의 과거 지급 행을 소급 변경하지 않는다.
- 제작: 기본 내장 image_gen. 그림은 생성 이미지, 문구는 번역 가능한 HTML로 구성했다.
- 웹 자산: `apps/web/public/banners/welcome-baek-v1-1080.webp` (33,676 bytes), `welcome-baek-v1-2172.webp` (92,550 bytes). 이미지 형식 최적화만 수행했다.
- 완성 PNG: 작업 공간의 `output/imagegen/miro-welcome-white-banner-v2.png` (무료 1,000토큰 강조 버전, 실제 운영 모바일 배너 캡처, 358×120). 이전 시안은 `miro-welcome-white-banner.png`로 보존한다.
- 검증: 온보딩 저장·1,000 지급·동일 계정 재지급 방지·7일 만료 검사 4건 통과. 루트·웹 타입 검사 통과, en/ja/zh 번역 누락 0. 운영 390×844 및 1280×800에서 얼굴·텍스트 배치 확인. `/api/health` 정상. DB 마이그레이션 없음.

## 이미지 생성 최종 프롬프트

```text
Create a polished promotional banner BACKGROUND illustration for MIRO, a Korean character chat app. Deliver a very wide 3:1 landscape composition, preferably 2304x768. Reference image 1 is the exact character identity to preserve: Baek Dohyun, an adult man aged 33, pale skin, gray eyes, thin ROUND wire glasses, long loose black hair tied low with stray bangs, silver ear cuff, white shirt, black waistcoat, black leather gloves. Preserve his recognizable face, hair, glasses, outfit and beautifully rendered high-quality Korean romance manhwa/illustration style. He should have a subtle inviting confident half smile and direct eye contact, one gloved hand near his glasses or cheek. Reference image 2 is ONLY a guide to the broad advertising composition: blank white text area on left and striking large character closeup on the right. Do not copy its character or lettering. Pure warm WHITE background, a restrained extremely pale lavender-gray vignette only behind the character. LEFT 58 percent must remain clean blank white negative space for real HTML typography that will be added separately. RIGHT 42 percent is a dramatic head-and-shoulders portrait, his face occupying the rightmost upper third, hair lightly cropped at the top, shoulders extend off the bottom/right edges. The face must remain entirely in the right 40 percent so it will not overlap type. Use the character from reference 1 in a newly composed upright closeup, not the lying-down pose. The character's silhouette can softly taper into white near the bottom left. Minimal editorial finish, crisp fine linework, refined soft cel shading, no gifts, no coins, no UI controls, no banners within the banner, no logos, NO TEXT whatsoever, no letters or watermarks. White should dominate, with black clothing and hair as the strong contrast. This is a finished high-end advertising illustration asset, not a mockup.
```
