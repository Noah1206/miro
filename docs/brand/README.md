# MIRO brand — 2026-10-10

확정 방향은 03번 심볼(둥근 네 곡면 + 중앙의 날카로운 틈), 흰색 기본 로고와 라벤더 #B8A6FF 포인트다.
앱 UI는 다크 전용이며 레이아웃·정보 구조는 기존 패턴을 따른다.

## 색상

- 기본 화면 #111015, 카드 #19171F, 입력·시트 #211E29, 높은 표면 #2C2737.
- Primary #B8A6FF, Hover #D8CCFF, Pressed #A087F4, On primary #171320.
- 선택 배경 #1E162F, 강한 강조 배경 #30204F.
- 성공 #83E0CC, 주의 #E8C57C, 오류 #F18C9C, 안내 #89B4FF.
- 본문 #F5F2FA, 보조 #AFA8BD, 메타 #968DA5, 비활성 #625B70.
- 메타 글자와 입력창 경계는 Surface 3에서도 읽히도록 승인 시안에서 소폭 밝기를 보정했다.
- 전체 단계·역할의 HEX 값은 [palette.json](palette.json)에 있다. 실제 UI 역할 토큰은 app/globals.css에 있다.

## 로고

[logo-symbol.svg](logo-symbol.svg)가 편집 가능한 원본이다. 승인한 03번 시안의 곡면을 벡터로 정리했다.
기본 로고 SVG는 평면 단색이다. 파비콘은 자수정 그라데이션 바탕에 흰색 마크를 사용한다.

- public/logo-mark.svg / logo-mark.png: 흰색 기본 로고.
- public/logo-mark-lavender.svg / logo-mark-lavender.png: 라벤더 포인트 버전.
- public/logo-m.png / logo-s.png: 인트로·빈 대화 목록에서 만나는 좌우 곡면.
- public/icon-180.png / icon-192.png / icon-512.png: 검정 바탕·라벤더 심볼, 마크 폭 62%.
- public/favicon.svg / favicon.png: 자수정 타일·흰색 심볼(마크 폭 76%).
- public/favicon-16.png / favicon-32.png / favicon.ico: 브라우저 탭용 작은 크기, ICO에는 16·32·48px 포함.
- logo-mark-source.png: 이전 M 시안의 기록. 현재 자산 생성에는 사용하지 않는다.

## 자산 생성

Node.js와 sharp가 필요하다. sharp가 로컬 패키지 경로에 있으면:

~~~sh
node docs/brand/make-logo-assets.mjs
~~~

bundled runtime을 사용할 때는 MIRO_ASSET_NODE_MODULES를 sharp가 있는 node_modules 절대 경로로 설정한다.
기존 Python 실행 경로는 같은 Node 생성기로 연결된다.
PNG 크기·색상·조각은 모두 하나의 SVG에서 생성하므로 자산마다 다른 모양을 관리하지 않는다.
