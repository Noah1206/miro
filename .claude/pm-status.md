# PM Status — MIRO

**Last briefing**: 2026-09-14 18:40
**Current focus**: 만들기·편집·상세 UI 마무리 단계 → 실서비스(비공개 베타) 준비로 전환
**Active sprint goal**: 비공개 베타 — 실제 LLM 1개(Haiku) + 실제 소셜 로그인 + 개발 플래그 제거 + Vercel 배포

## 상태 요약 (2026-09-14)
- 기획서 13영역 중 완료 8, 부분 5 (만들기 이미지 저장소, 통화 실시간 미디어, 사진 영구 저장, 성인 인증 실 provider, 결제 실 PG), 없음 0(네이티브 푸시는 웹앱 결정)
- 실행 중인 provider: llm mock / image mock / push live / voice·video mock / adultVerification mock / payment mock / oauth mock(E2E)
- DB 34 테이블 / 마이그레이션 20 (0017~0019 는 psql 직접 적용, journal 수동)
- 테스트: e2e 14파일 40케이스, 단위·통합 ≈258 케이스, CI(.github/workflows/ci.yml) 이번 세션 미실행

## 결정 로그
- 2026-09-14: 멀티 캐릭터(한 세계관에 여러 명)는 유저 확보 후로 보류. 1캐릭터=1세계관 유지
- 2026-09-14: AI 초안(Quick Create) 경로 제거 — 만들기는 수동 폼만. 기획서 2.2 수용기준 2 는 의도적 미충족
- 2026-09-14: 만들기·편집은 같은 폼(character-form.tsx). 탭 6 + 미리보기. 세계·설정 탭 제거, 공개 스위치는 편집에만
- 2026-09-14: 첫 장면·상황 예시를 LLM system 프롬프트에 포함 (없으면 통째로 생략)
- 2026-09-14: 비용 방침 — 개발 중엔 mock(0원), 실대화는 Haiku 4.5 부터. 사진·통화·결제·성인인증은 베타에서 끔
- 2026-09-14: 안내 말풍선은 만들기 화면에만 (탭별 6단계 투어)

## 미해결 질문
- [ ] 결제 PG: Stripe(어댑터 있음, KRW·국내 카드 제약) vs 토스페이먼츠/포트원(새로 작성) — 베타에선 결제 끄고 Free 만
- [ ] 통화: v1 을 텍스트 대체(현행)로 낼지, LiveKit 실시간 + TTS 를 넣을지
- [ ] 성인 콘텐츠: v1 포함 여부. 포함하면 실 성인인증 provider 필수
- [ ] Vercel 플랜: Hobby 는 크론 빈도 제한 [추정] → 선연락 15분 크론이면 Pro 필요, 아니면 하루 1회로 낮춤
- [ ] 정책 숫자(policy.ts 전부 DEV_DEFAULT): Free 하루 대화 횟수, Pro 가격, 보존 기간

## 차기 마일스톤
**M-베타(비공개)** — 잔여 7개: env 실키(LLM·OAuth·CRON), 개발 플래그 제거, policy 확정, .env.example 보강, Vercel 배포+크론, 이미지 업로드 저장소(Supabase Storage), 사용량 한도 검증
**M-공개** — 결제 PG, 사진 영구 저장, 성인 인증, 통화 실시간, rate limit, 문서 갱신(IMPLEMENTATION_PLAN·README)
