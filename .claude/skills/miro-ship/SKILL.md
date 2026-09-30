---
name: miro-ship
description: MIRO 변경을 한 번에 내보낸다 — 타입 검사 → 커밋 → (새 마이그레이션이 있으면 운영 DB 먼저) → 운영 배포 → 상태 확인 → origin 푸시. 사용자가 "올려줘", "배포해줘", "한번에 진행해줘", "/miro-ship" 이라고 할 때 쓴다.
---

# miro-ship — 커밋·배포·푸시 한 번에

사용자가 내보내라고 하면 아래를 **멈추지 않고 끝까지** 한다. 중간에 실패하면 그 자리에서 멈추고 무엇이 실패했는지 보고한다(다음 단계로 넘어가지 않는다).
테스트(단위·e2e·실측)는 돌리지 않는다 — 사용자가 따로 말할 때만. 보고에 "테스트는 돌리지 않았다"를 적는다.

## 1. 확인
```bash
cd /Users/johyeon-ung/Desktop/Miro
git checkout apps/web/tsconfig.json 2>/dev/null   # dev 서버가 넣는 .next-* 경로 되돌리기
git status --short
```
- 바뀐 것이 없고 origin 과 같으면: "내보낼 변경이 없다"고 말하고 끝.
- 커밋은 됐는데 배포·푸시만 남았으면 해당 단계부터.

## 2. 타입 검사 (Node 24)
```bash
PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH pnpm -s typecheck 2>&1 | grep -v "trust settings"
(cd apps/web && PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "trust settings")
```
오류가 하나라도 있으면 멈춘다. 화면 문구를 바꿨으면 번역 누락도 본다:
```bash
(cd apps/web && PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH node scripts/i18n-keys.mts --missing)   # 세 언어 모두 0 missing 이어야 한다
```

## 3. 커밋
`git add -A && git commit` — 메시지는 한국어 한 줄 요약(무엇을 왜), 끝에 Co-Authored-By 줄. 공개 저장소다: 비밀값·.env·백업 파일이 섞이지 않았는지 `git status` 로 본다.

## 4. 운영 DB 마이그레이션 (있을 때만)
이번에 올리는 커밋들에 `packages/db/migrations/*.sql` 이 새로 있으면 **코드보다 먼저** 운영에 적용한다(화면이 새 컬럼을 읽는다).
```bash
URL=$(grep '^DIRECT_DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
psql -X -q -v ON_ERROR_STOP=1 --single-transaction "$URL" -f packages/db/migrations/<파일>.sql
```
확인은 읽기 전용 트랜잭션으로만: `begin read only; select …; commit;` (여러 문장은 heredoc 으로). 풀러(DATABASE_URL, 6543)에 세션 SET 을 절대 보내지 않는다. 적용이 실패하면 배포하지 않는다. 네트워크가 필요하므로 sandbox 해제로 실행.

## 5. 운영 배포 (Node 20, 깨끗한 복제본에서)
```bash
D=/private/tmp/claude-501/-Users-johyeon-ung-Desktop-Miro/<session>/scratchpad/deploy && rm -rf $D && git clone -q . $D \
  && mkdir -p $D/.vercel && cp .vercel/project.json $D/.vercel/ \
  && cd $D && PATH=$HOME/.nvm/versions/node/v20.19.6/bin:$PATH vercel deploy --prod --yes 2>&1 | grep -E "Aliased:|Error|error"
cd / && rm -rf $D
```
작업 트리가 아니라 커밋된 상태를 올린다(복제본). `Aliased: https://miro-web-ashen.vercel.app` 이 나와야 성공.

## 6. 상태 확인
```bash
curl -s https://miro-web-ashen.vercel.app/api/health | head -c 80
```
`"ok":true` 와 `"schema":"ready"` 가 아니면 보고하고 멈춘다(푸시하지 않는다).

## 7. origin 푸시
```bash
git push origin main && git status -sb | head -1   # main...origin/main 이면 끝
```

## 보고
짧게: 커밋 해시, 배포 주소·상태, 마이그레이션 적용 여부, 푸시 범위(`a..b`), "테스트는 돌리지 않았다", 화면을 운영에서 직접 확인했는지(안 했으면 안 했다고).
