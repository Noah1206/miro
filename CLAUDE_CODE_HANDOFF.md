# Claude Code 인수인계 — Miro (2026-09-23)

이 문서는 현재 로컬 작업공간의 **시점 스냅샷**이다. 이미 구현한 기능을 다시 만들거나 사용자가 제거하라고 한 UI를 복원하지 말고, 먼저 실제 Git·환경 상태를 다시 확인한다. 비밀값, 세션, 운영 데이터, 사용자 업로드 원본은 이 문서에 담지 않는다.

## 현재 상태와 이전 제외 범위

- 저장소: `/Users/johyeon-ung/Desktop/Miro`, 브랜치 `main`, 원격 `origin` (`https://github.com/Noah1206/miro.git`). 마지막 누적 기능 커밋 `b17df11a741bc029f1af932ada1c2c962af04079` (96개 파일); 이 문서 작성 직전 `git ls-remote origin refs/heads/main`도 같은 SHA였고 앞섬/뒤짐은 0/0이었다.
- 이 인수인계 파일 `CLAUDE_CODE_HANDOFF.md`는 **이번 요청에서 로컬에 새로 작성했으며 커밋·푸시하지 않는다.** 작성 전 다른 dirty 상태는 수정된 `.Codex/config.toml`과 미추적 `.claude/launch.json` 두 파일이었다. 이후에는 이 문서까지 미추적이어야 한다. 실제 상태는 `git status --short`로 재확인한다.
- `localhost:3000`은 이번 확인에서 Next 서버가 LISTEN 중이었다. 기존 인앱 브라우저 탭은 `/home/search`의 강태준 검색, 드라마·느와르 두 장르 선택, 결과 카드와 `/home` 화살표를 표시했다. 이는 로컬 개발 서버 화면 확인이지 배포 확인이 아니다. 서버를 종료하거나 원래 체크아웃의 `.next`를 빌드로 덮지 않는다.
- `.Codex/config.toml`은 **이미 Git 추적 중**이며 남은 diff는 Supabase MCP 연결 설정(프로젝트 식별자와 활성 기능 범위) 추가다. 문자열에 토큰/암호는 보이지 않지만 특정 프로젝트에 저장소 기본 설정을 결합하고 DB 접근 기능을 노출하므로 지난 push에서 보수적으로 제외했다. dotfile이어서 무조건 개인 파일이라는 뜻은 아니며, 팀 공용 설정으로 원하는지 별도로 판단할 수 있다.
- `.claude/launch.json`은 **미추적** 로컬 웹 실행 구성이다(설정명 `web`, 셸 실행, 자동 포트, 설정 포트 3050). 확인한 구조에 비밀값은 없으며, 재사용 가능한 프로젝트 설정일 수도 있다. 지난 push에서는 사용자의 로컬 런처 선택을 범위에 포함할지 불명확해서 제외했다. 두 파일 모두 지우지 않았고 같은 로컬 체크아웃의 Claude는 읽을 수 있다. 다만 `.Codex` 설정을 Claude Code가 자동으로 적용한다거나 `.claude/launch.json`을 자동으로 실행한다고 가정하지 말고 Claude 측 동작을 확인한다.
- 마지막 push에서 빌드·E2E·배포 조회·운영 DB 마이그레이션을 하지 않은 것은 **불가능해서가 아니라 범위와 안전성에 따른 선택**이었다. Node 24 타입 검사와 DB 없는 단위 테스트, diff 검사는 실행했다. 활성 `:3000`의 `.next`와 충돌할 수 있는 원본 체크아웃 빌드 대신 격리 복제 빌드가 가능하다. E2E는 보호된 로컬 `_test` DB와 단독 실행을 준비해야 한다. 배포 상태는 읽기 전용으로 따로 조회할 수 있다. 운영 마이그레이션은 push만으로 승인되거나 자동 완료되지 않으며 큰 테이블의 온라인 인덱스·백필·플래그 순서와 별도 실행 결정을 요구한다.

## 확정된 제품 동작

- 홈은 공개 또는 공식 `chat`·`reality` 캐릭터 전체를 보여 주고, 미로 탭은 `reality` 전용이다. 강태준 (`c8613d38-58b7-43bc-b2f7-88b02d5b3afa`)은 `reality`이며 홈·미로·통합 검색에서 보인다. 본인 비공개 캐릭터를 허용하는 **검색**과 공개/공식만 보이는 **홈**의 권한 차이는 의도적이다.
- 검색의 유형 필터는 제거했다. 기존 `type=chat`/`type=reality` URL은 유형 제한 없이 canonical URL로 정리한다. 검색 입력은 항상 보이며 검색 헤더의 MIRO 로고와 큰 ‘검색’ 제목 대신 `/home`으로 직접 가는 `홈으로 돌아가기` 화살표가 있다. 헤더 X, 보이는 ‘최신순’ 문구, 검색 중 이전 결과 안내문은 다시 넣지 않는다. 다만 결과 정렬은 생성 시각·ID 내림차순을 유지한다. 입력 안의 `검색어 지우기` 버튼은 별개로 남아 있다.
- 홈/검색/만들기·수정은 최대 5개 장르를 선택할 수 있다. 장르끼리는 OR, `q`·`tag`·장르 조건 사이에는 AND. 장르 선택지가 16개이고 직접 입력도 지원한다. `worlds.genre`의 nullable text에 최대 5개(각 20자)를 ` · `로 연결해 기존 스키마/데이터와 호환한다. 장르는 세계 장르 조각의 **정확한 일치**이고 `tag`는 장르 및 관계 키워드의 별도 정확한 조건이다. 일반 `q`는 이름·설명 등 텍스트 검색이며 장르 선택이나 태그 조건과 혼동하지 않는다.
- 캐릭터 상세는 ‘이 사람에 대해’를 세계관보다 위에 항상 펼쳐 두고 해시태그를 보여 준다. 대화 시작 옆 북마크/번개와 ‘이어서 대화하기’ 버튼은 제거했다. `apps/web/app/(main)/character/[slug]/page.tsx`가 기준이다.

## 검색 구현의 불변 조건

- 핵심 파일: `apps/web/lib/home.ts`, `apps/web/lib/search-params.ts`, `apps/web/lib/genres.ts`, `apps/web/app/(main)/home/search/{page,search,grid}.tsx`, `apps/web/app/(main)/home/search/restore.ts`, `apps/web/app/api/home/search/cards/route.ts`, `apps/web/app/(main)/create/{parse,character-form}.tsx`. 전체 배경/검증은 `docs/search-ux-plan.md`를 읽는다.
- 검색어는 trim 후 최대 40자, 비교는 공백 제거·소문자화하며 문자 그대로의 `%`·`_`도 다룬다. 장르 URL은 반복 `genre`를 최대 5개로 정규화·중복 제거·정렬하고 비정상 값은 거부한다. 빈 조건은 대규모 기본 검색을 실행하지 않는다. 입력은 제출형이라 타이핑 자체가 DB 검색을 만들지 않으며 IME 조합 중 Enter를 검색 제출로 취급하지 않는다. URL의 확정 `q`와 편집 중 초안을 구분하여 뒤로/앞으로 이동과 지연 RSC 응답에도 동기화를 유지한다.
- 첫 페이지와 더 보기는 **12+1 keyset**, 같은 조건 fingerprint를 가진 커서, 대표 이미지 1장, 중복 ID 제거를 사용한다. 더 보기 fetch에는 AbortController와 generation 검사로 늦은 응답을 무시한다. 취소가 이미 시작된 DB 작업을 반드시 중단한다는 보장은 없다. 최초/추가 실패 재시도와 빈 결과를 구분한다. 현재 사용자 기준 공개/공식/본인 비공개 가드를 모든 페이지에 다시 적용한다. 검색 API는 `private, no-store`이며 비공개 결과를 공유 캐시에 넣지 않는다.
- 상세로 간 뒤 복귀할 때 `sessionStorage`에는 카드/개인 데이터 대신 **viewer ID를 포함한 조건 키, 페이지 수, 스크롤 Y, 저장 시각**만 둔다. 유효 기간은 5분, 페이지 상한은 100이다. 결과는 서버에서 재조회하며 페이지 수·스크롤을 복원한다. 복귀 직후 검색창에 불필요하게 재초점하지 않는다. `apps/web/app/(main)/home/search/restore.ts`가 저장 규칙이다.

## 이미지와 전환 피드백

- Supabase width-only 이미지 변환에는 반드시 `resize=contain`을 붙인다. 생략하면 1440×2560 원본이 640×2560으로 잘리던 사례가 있었고 수정 후 비율은 약 640×1138이다. 카드 CSS의 `object-fit: cover`는 화면 프레임을 위한 별도 선택으로 유지한다. 기준: `apps/web/components/character-visual.tsx`와 인접 테스트.
- 업로드된 강태준 사진 네 장과 위 캐릭터 ID는 운영/로컬 DB·Storage 데이터이지 Git 커밋에 포함된 파일이 아니다. 인수인계 중 사진을 추출·재생성하거나 새 자산으로 커밋하지 않는다.
- `apps/web/components/page-skeletons.tsx`는 홈/미로/검색/대화/만들기/나 목적지 형태다. `apps/web/components/navigation-feedback.tsx`가 링크 대상에 따라 **80ms 후 표시만** 하고 실제 콘텐츠에는 최소 대기 시간을 넣지 않는다. 기존 본문은 `display:none`·`aria-hidden`·`inert`로 마운트를 유지해 초안/상태를 보존하며 하단 내비는 계속 보인다. 최신 이동만 적용하고 pathname commit·popstate에서 해제하며 15초 무응답 시 기존 본문으로 복귀한다. 빠른 prefetched 이동에는 스켈레톤이 나타나지 않을 수 있다. 익명 만들기 클릭의 로그인 시트 흐름과 수정키/새 탭 링크 기본 동작을 보존한다. 관련 경로: `apps/web/components/ui/transition-link.tsx`, `apps/web/lib/motion/view-transition.ts`, `apps/web/app/(main)/layout.tsx`. 검색 조건 변경은 전체 페이지가 아닌 결과 영역만 스켈레톤을 보여 헤더·초안을 유지한다. 과거 home/archive `loading.tsx`는 제거했으며 무심코 다시 추가하지 않는다.
- 구현 후 작은 브라우저 측정(400ms RSC 지연, 3회): 첫 피드백 84.0/85.1/86.2ms, 실제 검색 입력 685.7/554.0/595.5ms. 따뜻한 3회는 실제 입력 229.9/77.4/78.4ms였고 빠른 두 번은 스켈레톤이 보이지 않았다. 이는 **구현 후 반응 관측**이지 before/after 성능 개선 증거가 아니다.

## 확장성·운영 게이트

- 홈/미로/검색/대화 목록과 시뮬레이션 snapshot은 필요한 대표이미지·페이지·데이터만 가져오도록 bounded화했다. `packages/db/src/client.ts`의 Supabase pool `DB_POOL_MAX`는 기본 5, 허용 2..20이고 인스턴스 수와 곱한 총 연결 수를 별도 관리해야 한다. 공개 결과에 본인 비공개가 섞일 수 있어 전역 공유 캐시를 넣지 않았다.
- `packages/db/migrations/20260923110000_search_and_popular_indexes.sql`과 `packages/db/migrations/online/`은 검색 문서/인기·공개 피드 인덱스를 위한 단계적 절차다. 파생 자료는 `miro_perf` 스키마에 있으며 DB 역할 권한/트리거/백필 일치 수/인덱스 유효성을 확인해야 한다. `MIRO_FEATURE_INDEXED_DISCOVERY`는 기본 off. 큰 운영 테이블에서는 일반 transactional migration이 10,000건 초과를 거부하거나 blocking index가 위험할 수 있다. `docs/indexed-discovery-rollout.md`의 online 인덱스 → 스키마/트리거 → 단일 백필 → 동시 인덱스 → 검증 → 한 인스턴스 플래그 활성화 순서를 **별도로 승인·실행**한다. 운영 마이그레이션/백필/플래그 활성화는 하지 않았다.
- `MIRO_AI_DB_LEASES`도 기본 off. `packages/db/migrations/20260923174000_ai_provider_leases.sql` 적용·확인 후에만 활성화한다. admission 대기는 최대 1.5초이며 DB lease가 필요하지만 불가하면 provider 호출 전 fail closed. background·interactive 별 admission, heartbeat/release, 최대 5분 hold가 있다. abort를 무시한 provider가 물리적으로 계속 실행되면 lease가 만료된 뒤 다른 호출이 들어갈 수 있으므로 엄격한 물리 동시실행 보장은 아니다. cron 분리 마이그레이션은 유지보수 route 배포가 먼저다. `docs/ai-lease-rollout.md`를 따른다.
- `docs/performance-validation.md`의 격리 `miro_perf_test`/port 3100 실험은 10k/100의 비교 및 100k까지의 제한적 ramp를 담고 있다. 후보와 기준 소스 차이가 플래그 하나가 아니고 로컬 DB·닫힌 루프 부하이므로 인과관계나 운영 동접 수용량으로 일반화하지 않는다. 1M 및 1000 VU 검증 완료가 아니다. 현재 배포/운영 DB 상태는 이 문서만으로 알 수 없다.

## 검증의 시점과 미확인 항목

- **마지막 push 커밋 직전:** Node 24, `DATABASE_URL= TEST_DATABASE_URL= pnpm typecheck` 통과; 같은 빈 DB 환경의 `pnpm test`는 **325 passed / 210 skipped** (45 파일 pass / 26 skipped). `git diff --cached --check` 통과. DB 통합 테스트가 건너뛴 결과를 전체 통합 통과로 표현하지 않는다.
- **이전 단계:** 격리 port 3100 production-mode 빌드와 guarded `miro_test`/`miro_perf_test`의 검색·장르·권한·복원·브라우저/성능 검증 기록이 `docs/search-ux-plan.md`와 `docs/performance-validation.md`에 있다. 검색 복원은 17개 fixture의 12→17 더 보기/상세 복귀, 페이지 수·스크롤 복원까지 확인했다. 이들은 마지막 커밋 그대로 다시 실행한 빌드/E2E가 아니다.
- **아직 미확인:** 마지막 커밋 전체의 격리 production build, full E2E 반복 통과, 실제 서비스 배포 상태, 운영 DB 마이그레이션/백필/플래그, 실기기 모바일 IME·키보드, 실제 인증 전환 브라우저 전 경우, 1000 VU·1M 캐릭터·장시간 부하. 특히 기존 Playwright는 병렬 워커에서 flakes가 남았으므로 단일 성공을 안정성 증거로 삼지 않는다.

## Claude Code 첫 작업 체크리스트

1. 저장소 지침(`CLAUDE.md`, `AGENTS.md` 및 적용 범위의 하위 지침이 있다면)을 읽고 `git status`, 브랜치, `origin/main` SHA와 위 dirty 파일을 확인한다. 문서 작성 당시 루트에 동일 목적 handoff/지침 파일은 발견되지 않았지만 현재 파일 상태가 우선이다.
2. Node 24를 사용한다: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`. 루트 `.env`의 `DATABASE_URL`은 운영 Supabase를 가리킬 수 있으므로 테스트·fixture/reset에 쓰지 않는다. 값 자체를 문서·로그에 남기지 않는다.
3. 격리 build가 필요하면 `docs/performance-validation.md`의 복제/port 3100 방식을 참고해 `:3000` 개발 서버와 원본 `.next`를 보존한다. 읽기 전용 배포 조회는 별도로 가능하지만 main push를 서비스 배포 완료라고 단정하지 않는다.
4. E2E/DB 테스트는 `tooling/test-database.ts`로 **localhost 계열 host와 `test`/`test_*`/`*_test` DB 이름 둘 다** 확인한 후 독립 테스트 DB에서만 수행한다. `ops_cron_config`와 마이그레이션 메타데이터를 보존하고 다른 세션의 같은 DB 테스트와 겹치지 않는다. 실패는 기존 병렬 flakes와 이번 변경 회귀를 분류한다.
5. 운영 마이그레이션은 별도 실행 결정을 얻은 뒤 각 rollout 문서의 online/권한/백필/검증 절차로 진행한다. 코드 push만으로 SQL 실행·flag 활성화·운영 서비스 배포를 가정하지 않는다. 이미 완료한 UI를 재구현하거나 제거했던 버튼·유형 필터·로딩 경계를 되돌리지 않는다.

## Claude Code에 붙여 넣을 시작 프롬프트

> 이 저장소의 `CLAUDE_CODE_HANDOFF.md`를 먼저 읽고 현재 Git/원격·로컬 서버·안전 가드를 재확인해 주세요. 이미 완료된 UI와 검색/성능 작업은 보존하고, 미확인 항목(격리 빌드, guarded E2E, 읽기 전용 배포 확인)을 우선순위와 위험에 따라 검증해 주세요. 루트 운영 `.env`로 테스트 DB 작업이나 운영 마이그레이션/플래그 활성화를 하지 말고, 실행 전 계획과 결과를 구분해 보고해 주세요.
