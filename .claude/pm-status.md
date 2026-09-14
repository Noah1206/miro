# PM Status — MIRO

**Last briefing**: 2026-09-14 21:30
**Current focus**: Production Core Architecture 적용 완료 — 알파와 정식이 같은 State Update Pipeline 을 쓴다. 다음은 실 AI 키·배포
**Active sprint goal**: 비공개 베타 — 실제 LLM 1개(Haiku) + 실제 소셜 로그인 + 개발 플래그 제거 + Vercel 배포

## 상태 요약 (2026-09-14)
- 기획서 13영역 중 완료 8, 부분 5 (만들기 이미지 저장소, 통화 실시간 미디어, 사진 영구 저장, 성인 인증 실 provider, 결제 실 PG), 없음 0(네이티브 푸시는 웹앱 결정)
- 실행 중인 provider: llm mock(AI_PROVIDER 비어 있음 — gemini/cloudflare/gateway/openai 중 택1) / image mock / push live / voice·video mock / adultVerification mock / payment mock / oauth mock(E2E)
- DB 33 테이블 / 마이그레이션 21 (0017~0021 은 psql 직접 적용, journal 수동). 0021: ai_usage, roleplay_sessions.character_state, users.is_guest, alpha_sessions·alpha_ai_calls 삭제
- 테스트: e2e 14파일 40케이스, 단위·통합 ≈258 케이스, CI(.github/workflows/ci.yml) 이번 세션 미실행

## 결정 로그
- 2026-09-14: 멀티 캐릭터(한 세계관에 여러 명)는 유저 확보 후로 보류. 1캐릭터=1세계관 유지
- 2026-09-14: AI 초안(Quick Create) 경로 제거 — 만들기는 수동 폼만. 기획서 2.2 수용기준 2 는 의도적 미충족
- 2026-09-14: 만들기·편집은 같은 폼(character-form.tsx). 탭 6 + 미리보기. 세계·설정 탭 제거, 공개 스위치는 편집에만
- 2026-09-14: 첫 장면·상황 예시를 LLM system 프롬프트에 포함 (없으면 통째로 생략)
- 2026-09-14: 비용 방침 — 개발 중엔 mock(0원), 실대화는 Haiku 4.5 부터. 사진·통화·결제·성인인증은 베타에서 끔
- 2026-09-14: 안내 말풍선은 만들기 화면에만 (탭별 6단계 투어)

- 2026-09-14: Closed Alpha(/alpha) 구현 — 로그인 없이 유진 1명과 대화, 규칙 기반 관계 엔진, 리얼리티 메시지·클리프행어·웨이트리스트
- 2026-09-14: Production Core Architecture — 알파 전용 엔진 폐기. 알파 = 게스트 계정(users.is_guest) + 공식 캐릭터 'yujin' 의 정식 roleplay_session. /api/chat 과 /chat 액션이 같은 runConversationTurn 을 부른다
- 2026-09-14: 관계 수치는 코드가 정한다 — 사용자 문장 → 의미 이벤트(규칙 분류) → RELATIONSHIP_RULES delta → 성향 보정. LLM 은 ±3 뉘앙스만. 사건 규칙(EVENT_RULES)이 선연락 의도를 만들고 delayMinutes(notBefore)로 스케줄러에 넘긴다
- 2026-09-14: AI Provider 통합 — AIProvider.generate 하나, AIOrchestrator(타임아웃·재시도·fallback·usage 기록), AI_PROVIDER/AI_FALLBACK_PROVIDER 로 교체. 전부 실패하면 기분별 정해진 대사(fallback), 오류는 사용자에게 안 보인다
- 2026-09-14: 기능 플래그 MIRO_MODE=alpha|production (packages/config/features.ts). alpha 는 사진·통화·Live Scene 끔, inlineReality 켬

## 미해결 질문
- [ ] 결제 PG: Stripe(어댑터 있음, KRW·국내 카드 제약) vs 토스페이먼츠/포트원(새로 작성) — 베타에선 결제 끄고 Free 만
- [ ] 통화: v1 을 텍스트 대체(현행)로 낼지, LiveKit 실시간 + TTS 를 넣을지
- [ ] 성인 콘텐츠: v1 포함 여부. 포함하면 실 성인인증 provider 필수
- [ ] Vercel 플랜: Hobby 는 크론 빈도 제한 [추정] → 선연락 15분 크론이면 Pro 필요, 아니면 하루 1회로 낮춤
- [ ] 정책 숫자(policy.ts 전부 DEV_DEFAULT): Free 하루 대화 횟수, Pro 가격, 보존 기간

## 차기 마일스톤
**M-베타(비공개)** — 잔여 5개: env 실키(AI_PROVIDER=gemini 등·OAuth·CRON), 개발 플래그 제거, policy 확정, Vercel 배포+크론(MIRO_MODE=alpha), 이미지 업로드 저장소(Supabase Storage)
**M-공개** — 결제 PG, 사진 영구 저장, 성인 인증, 통화 실시간, rate limit, 문서 갱신(IMPLEMENTATION_PLAN·README)
