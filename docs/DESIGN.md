# MIRO Design System

> **Design Direction:** Dark Cinematic × Human × Sharp Minimal  
> **Brand Principle:** UI는 조용하게, 캐릭터와 세계는 강하게.  
> **Core Idea:** MIRO는 “AI 채팅 앱”이 아니라, 관계와 세계가 변화하는 **관계 시뮬레이션 플랫폼**이다.

UI 구현·수정 시 컴포넌트/UX 규칙은 [MIRO_DESIGN_PATTERNS.md](MIRO_DESIGN_PATTERNS.md)가 기준이다
(최소 글자 12px, 터치 영역 44px, 버튼 상태, 그룹핑, 상태 설계 등). 이 문서는 브랜드·색·모션의 방향을 정한다.
두 문서가 어긋나면 패턴 문서가 이긴다.

---

## 1. Brand Identity

MIRO의 디자인은 흔한 AI 서비스처럼 보이면 안 된다.

사용자가 첫 화면을 봤을 때 느껴야 하는 감정은 아래와 같다.

- “AI 도구 같다” → X
- “챗봇 같다” → X
- “게임 메뉴 같다” → X
- “이 사람과 뭔가 시작될 것 같다” → O
- “하나의 세계에 들어가는 느낌이다” → O
- “관계가 살아서 움직이는 것 같다” → O

MIRO의 비주얼 시스템은 다음 3가지 키워드를 중심으로 설계한다.

### Dark Cinematic
검은색은 음침함을 위한 것이 아니라 **캐릭터와 장면을 강조하는 무대**로 사용한다.

### Human
UI가 앞에 나서지 않고, 캐릭터의 감정과 관계 변화를 중심으로 보여준다.

### Sharp Minimal
모든 요소를 둥글게 만들지 않는다.  
부드러운 곡선과 약간의 날카로운 방향성을 함께 사용한다.

---

## 2. Logo Usage

MIRO 로고는 다음 원칙을 따른다.

- 기본 배경: `#000000`
- 기본 로고: `#FFFFFF`
- Gradient 사용 금지
- Glow 사용 금지
- 3D 효과 사용 금지
- 과도한 그림자 금지
- 텍스트 없이 Symbol 단독 사용 가능
- 앱 아이콘에서도 식별 가능해야 한다

로고는 MIRO의 UI 패턴에도 영향을 준다.

특히 아래 요소에서 로고의 형태 언어를 재사용한다.

- 카드 모서리
- 이미지 마스크
- 섹션 전환
- Sheet
- Modal
- Page Transition
- Loading Motion
- Divider Shape

---

## 3. Color System

무채색 기반 + 주황 포인트. 색은 콘텐츠(캐릭터 사진)에서 나오고 UI 는 비켜선다 —
인스타그램처럼 화면 자체는 거의 흑백이고, 주황은 '지금 이것' 을 가리킬 때만 켜진다.

### Core Colors

```css
:root {
  --color-bg: #141417;
  --color-bg-deep: #000000;

  --color-surface-1: #1D1D22;
  --color-surface-2: #26262C;
  --color-surface-3: #2F2F36;

  --color-border: #33333A;
  --color-border-strong: #3E3E46;

  --color-text-primary: #F5F5F7;
  --color-text-secondary: #A1A1A8;
  --color-text-tertiary: #8E8E96;
  --color-text-disabled: #4D4D52;

  --color-white: #FFFFFF;
  --color-black: #000000;

  --color-danger: #E65A5A;
  --color-success: #5CBF88;
}
```

### Accent (Orange)

```css
:root {
  --color-accent: #C2410C;        /* 짙은 주황. 채움 */
  --color-accent-bright: #D9480F; /* 눌림·호버에서 한 단 밝게 */
  --color-accent-on: #FFFFFF;     /* 주황 채움 위의 글자 */
  --color-accent-text: #E8590C;   /* 어두운 바탕 위 주황 글자 — 채움보다 밝게 유지 */
  --color-accent-soft: rgba(194, 65, 12, 0.09);
}
```

짙은 주황 위의 글자는 **반드시 흰색**이다. 검정은 3.6:1 이라 본문 기준(4.5:1)에 못 미친다
(흰색은 5.2:1). `--color-accent-on` 이 그 값을 들고 있으니 버튼마다 다시 고르지 않는다.
글자로 쓰는 주황(`--color-accent-text`)은 채움색보다 밝다 — 짙은 채움색을 어두운 바탕 위
글자로 쓰면 4.5:1 아래로 떨어진다.

MIRO 는 **다크 전용**이다. 밝은 모드는 만들지 않는다 — 검은색은 음침함이 아니라
캐릭터와 장면을 세우는 무대이고, 흰 바탕에서는 그 무대가 사라진다.

---

## 4. Accent Color Rule

MIRO는 기본적으로 Black & White 브랜드다.

Accent Color는 장식용으로 사용하지 않는다.

### Accent는 의미가 있을 때만 사용

가능:
- 선택된 탭 / Navigation Active
- 주요 CTA (화면당 하나)
- 온라인 상태
- 관계 변화
- 새 Event · 안 읽은 것
- 특별한 Reality 메시지 (캐릭터가 앱 밖에서 먼저 연락한 순간)

금지:
- 모든 카드 테두리를 Accent로 처리
- 섹션 제목·구분선 같은 구조 요소에 사용 (구조는 무채색)
- 단순 장식용 Gradient
- Glow / Neon / 발광 효과

즉, 색은 **UI 장식이 아니라 상태 변화의 신호**여야 한다.

---

## 5. Typography

### 기본 원칙

- 장식적인 폰트보다 읽기 쉬운 Sans-serif
- 감정 표현은 Typography보다 Layout과 Spacing으로 만든다
- 작은 글씨를 과도하게 사용하지 않는다
- 캐릭터 이름은 명확하게 강하게
- 시스템 정보는 조용하게

### 추천 Size Scale

```css
--font-hero: 48px;
--font-display: 36px;
--font-title-1: 28px;
--font-title-2: 22px;
--font-title-3: 18px;
--font-body-lg: 17px;
--font-body: 15px;
--font-caption: 13px;
--font-micro: 11px;
```

### Font Weight

```css
--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
```

Bold는 남발하지 않는다.

---

## 6. Radius System

토스처럼 모든 요소를 둥글게 만들지 않는다.

```css
--radius-xs: 6px;
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
```

### Rule

- 일반 버튼: `10px ~ 12px`
- 카드: `12px ~ 16px`
- 큰 이미지: `12px ~ 20px`
- Sheet: 상단만 `16px ~ 20px`
- Pill 형태: 꼭 필요한 Chip / Tag에서만 허용

### 금지

- 모든 UI에 `24px+`
- 모든 버튼 pill 형태
- 모든 카드가 둥글고 말랑한 느낌

---

## 7. Spacing System

8px 기반 Grid를 사용한다.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;
--space-9: 96px;
```

Spacing은 넉넉하게 사용한다.

MIRO는 정보 밀도를 높이는 서비스가 아니라, **감정과 장면을 보여주는 서비스**다.

---

## 8. Layout Principle

MIRO는 SaaS Dashboard처럼 만들지 않는다.

### 피해야 할 구조

```text
Title
[Card] [Card] [Card]
[Card] [Card] [Card]
Button
```

### 권장 구조

```text
Character / Scene
↓
Short emotional context
↓
Primary action
↓
World / Relationship continuation
```

---

## 9. Home Screen

홈은 캐릭터 탐색 화면이 아니라 **세계로 들어가는 입구**다.

### Hero Section

화면의 60~75%를 Character Visual이 차지해도 된다.

예:

```text
[Character Cinematic Image]

한서윤

"오늘은 안 올 줄 알았는데."

3시간 전, 당신을 떠올렸다.

[ 세계로 들어가기 ]
```

### CTA Copy

권장:
- 세계로 들어가기
- 다시 만나기
- 이어서 보기
- 오늘의 장면 보기
- 관계 계속하기

지양:
- 채팅 시작
- AI와 대화하기
- Start Chat
- New Conversation

---

## 10. Character Card

Character Card는 상품 카드처럼 보이면 안 된다.

### 보여줄 것

- 캐릭터 이미지
- 이름
- 현재 관계 맥락
- 한 줄 상황
- 최근 변화

### 숨길 것

- 과도한 Rating
- 좋아요 수
- 대화 횟수
- Token 수
- AI Model 이름
- Provider 이름

### Example

```text
한서윤
같은 과 선배

“요즘 먼저 연락하는 일이 많아졌다.”
```

---

## 11. Chat / Scene UI

MIRO의 핵심은 일반 Messenger UI가 아니다.

목표는 다음 3개가 섞인 형태다.

- Chat
- Visual Novel
- Interactive Fiction

### 권장 예시

```text
학교 옥상 · 19:43
비가 조금씩 내리고 있다


“왜 나 피했어?”

서윤이 난간에서 몸을 돌린다.
아까보다 표정이 굳어 있다.


                         나:
                피한 적 없는데.
```

### 원칙

- Bubble 최소화
- Character Message는 텍스트 자체로 표현 가능
- Scene Description은 Secondary Tone
- User Message만 약한 Bubble 처리 가능
- 배경 이미지와 텍스트의 대비 확보

---

## 12. Relationship UI

관계를 숫자로 직접 보여주지 않는다.

### 금지

```text
호감도 73
질투 21
신뢰도 44
```

### 권장

```text
당신과의 관계

가까워지고 있음

“요즘 당신의 연락을 기다리는 것 같다.”
```

### 관계 상태 예시

- 낯선 사이
- 조금 익숙해짐
- 가까워지는 중
- 서로를 의식함
- 특별한 사이
- 연인
- 멀어지는 중
- 감정이 복잡함

---

## 13. Event UI

Event는 Popup처럼 뜨는 시스템 메시지가 아니라  
**세계에서 실제로 일어나는 사건**처럼 보여야 한다.

### 예

```text
오늘, 서윤이 평소보다 먼저 연락했다.

[ 확인하기 ]
```

또는

```text
새로운 장면이 열렸습니다.

학교 축제 · 밤
```

System 알림보다 Story Event처럼 디자인한다.

---

## 14. Reality Message UI

Reality Message는 일반 Push Notification처럼 보이면 안 된다.

화면 안에서는 실제 메신저의 느낌을 일부 차용해도 되지만  
MIRO만의 맥락 정보가 있어야 한다.

예:

```text
한서윤

“자?”

방금
```

단, 외부 OS Push에서는 최대한 간결하게 처리한다.

---

## 15. AI Image / Face Cast

이미지는 UI 안에서 가장 중요한 콘텐츠다.

### Rule

- 이미지 위에 과도한 UI Overlay 금지
- 이미지 하단 Gradient Overlay 최소화
- 이름 / 상태 / CTA만 남긴다
- AI 생성 표시가 필요한 경우 작고 조용하게 처리

이미지를 "AI Generated Asset"처럼 보이게 하면 안 된다.

사용자에게는 **캐릭터의 장면**이어야 한다.

---

## 16. Buttons

### Primary Button

```css
background: #FFFFFF;
color: #000000;
border-radius: 10px;
font-weight: 600;
```

### Secondary Button

```css
background: #17171A;
color: #F7F7F8;
border: 1px solid #27272B;
```

### Ghost Button

```css
background: transparent;
color: #F7F7F8;
```

### 금지

- Gradient Button
- Neon Button
- 모든 버튼에 Glow
- 과한 Shadow
- 토스 스타일의 지나치게 둥근 CTA

---

## 17. Icons

- 기본 Stroke: 1.5px ~ 2px
- White / Gray
- 단순한 형태
- 지나치게 귀여운 Icon 금지
- Filled Icon 최소화

MIRO Logo의 형태와 어울리는  
조금 더 구조적이고 날렵한 Icon을 사용한다.

---

## 18. Border

Dark UI에서는 Shadow보다 Border가 중요하다.

```css
border: 1px solid #27272B;
```

Hover:

```css
border-color: #45454D;
```

Strong:

```css
border-color: #FFFFFF;
```

단, White Border는 특별한 상태에서만 사용한다.

---

## 19. Shadow

Shadow는 존재감이 거의 없어야 한다.

```css
box-shadow: 0 8px 30px rgba(0,0,0,0.24);
```

금지:
- Glow Shadow
- 컬러 Shadow
- 과도한 Floating UI

---

## 20. Gradient

### 기본 정책
Gradient는 사용하지 않는 것을 기본으로 한다.

허용:
- Character Image의 가독성 확보용 Overlay
- Scene Background Fade
- 아주 약한 Black Fade

예:

```css
background:
linear-gradient(
  to top,
  rgba(0,0,0,0.75),
  rgba(0,0,0,0)
);
```

브랜드 요소에는 Gradient를 사용하지 않는다.

---

## 21. Motion Design

MIRO Motion은 Bounce보다 **Flow와 Tension** 중심이다.

### Motion Keywords

- Slow in
- Soft settle
- Slight tension
- Fade
- Slide
- Reveal
- Cut

### Duration

```css
--motion-fast: 120ms;
--motion-normal: 220ms;
--motion-slow: 360ms;
--motion-scene: 520ms;
```

### Easing

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

---

## 22. Logo Motion

App Launch에서 로고를 활용할 수 있다.

### Sequence

1. Black Screen
2. 흰 M 은 왼쪽에서, 주황 팔은 오른쪽에서 등장
3. 서로 가까워짐
4. 하나의 Logo 완성
5. 주황 점이 제자리에서 찍힘
6. Character World가 Reveal

마크 원본은 `docs/brand/logo-mark-source.webp`. `apps/web/public` 의 `logo-mark.png`(투명 정사각형)와
세 층(`logo-m` 흰 몸통 · `logo-s` 주황 팔 · `logo-d` 주황 점), PWA 아이콘은 모두 거기서 만든다.

이 Motion은 다음 메시지를 가진다.

> 서로 다른 존재가 연결되면서 하나의 세계가 열린다.

---

## 23. Page Transition

페이지 이동은 App-like하게 처리한다.

### 권장

- Fade + Translate Y 8~16px
- Slide X는 화면 계층이 명확할 때만
- Modal → Fade + Scale 0.98 → 1
- Bottom Sheet → Translate Y

### 금지

- Bounce
- Elastic
- 과도한 Spring
- 화면 전체 Rotation
- 과한 Blur Transition

---

## 24. Loading

Loading Spinner보다 Content Skeleton을 우선한다.

캐릭터 Scene Loading에서는 아래 흐름을 사용할 수 있다.

```text
...
장면을 이어가는 중
```

또는

```text
서윤이 답을 고르고 있다
```

기계적 AI 느낌을 줄인다.

---

## 25. Navigation

Navigation은 최대한 조용해야 한다.

권장 구조:

```text
Home
World
Create
Inbox
Profile
```

단, 실제 IA에 맞게 조정 가능.

Active 상태는:

- White Icon + Label
- Inactive는 Gray
- 활성 표시(점·밑줄) 하나만 Orange — 아이콘과 글자까지 물들이지 않는다

---

## 26. Modal / Sheet

Modal은 시스템 UI처럼 보이지 않도록 한다.

### Bottom Sheet

```css
background: #17171A;
border-top: 1px solid #27272B;
border-radius: 18px 18px 0 0;
```

Sheet Handle은 필요할 때만 사용한다.

---

## 27. Forms

캐릭터 생성 / 설정 화면에서도 Dark Minimal 원칙을 유지한다.

```css
input {
  background: #111113;
  border: 1px solid #27272B;
  color: #F7F7F8;
  border-radius: 10px;
}
```

Focus:

```css
border-color: #FFFFFF;
```

Accent Color Focus Ring 사용 금지.

---

## 28. Empty State

Empty State는 제품 사용법 설명보다 감정 맥락을 사용한다.

예:

```text
아직 이어진 인연이 없어요.

누군가의 세계에 들어가 보세요.
```

---

## 29. Error State

기계적인 Error 메시지는 지양한다.

Bad:

```text
Request failed.
Error Code 502
```

Good:

```text
잠시 연결이 끊겼어요.

다시 이어볼까요?
```

Developer Debug 환경에서는 Error Code를 별도로 표시 가능.

---

## 30. Responsive Design

MIRO는 Mobile-first.

### Mobile
- Character Visual 우선
- Full-width Scene
- Bottom Navigation
- Bottom Sheet 중심

### Tablet
- Two-column 가능
- Character Visual + Context 분리 가능

### Desktop
- 단순 Mobile 확대 금지
- Left Navigation + Main Scene + Context Panel 구조 가능

---

## 31. Desktop Example

```text
┌─────────────┬──────────────────────────────┬───────────────┐
│             │                              │               │
│ Navigation  │        Main Scene            │ Relationship  │
│             │                              │ / World       │
│             │                              │ Context       │
└─────────────┴──────────────────────────────┴───────────────┘
```

단, Main Scene이 항상 가장 넓어야 한다.

---

## 32. Image Ratio

추천:

```text
Hero Scene      16:9
Character Card  3:4
Portrait        4:5
Story Scene     16:10
Mobile Hero     4:5 / 9:16
```

---

## 33. Design Anti-Patterns

MIRO에서 아래 스타일은 금지한다.

### Toss Clone
- 지나치게 둥근 카드
- 둥근 Floating Object
- 과도한 White Space + Soft Blue
- 모든 UI가 친근하고 말랑한 느낌

### Generic AI App
- Neon Purple Gradient
- Sparkle Icon
- AI Badge 남발
- Robot Icon
- Generated 표시 전면 노출

### Gaming UI
- 수치 중심
- Level
- XP
- Health Bar
- Relationship Score
- 복잡한 HUD

### Dating App
- Swipe Card 중심
- Like / Dislike
- Match
- Profile Spec 중심

---

## 34. Brand Experience Principle

사용자는 MIRO에서 기능을 사용하는 것이 아니라  
**관계 안으로 들어간다.**

따라서 UI는 다음보다 작아야 한다.

1. Character
2. Emotion
3. Relationship
4. Scene
5. Event

그리고 UI System은 그 뒤에 있어야 한다.

---

## 35. Claude Code Design Instruction

Claude Code에게 UI 구현을 요청할 때 아래 내용을 기본 규칙으로 전달한다.

```md
MIRO의 UI는 Dark Cinematic × Human × Sharp Minimal을 따른다.

필수 규칙:
- Background는 #141417 중심
- White / Gray 중심의 Monochrome UI
- Gradient 사용 금지
- Neon / Glow 사용 금지
- 과도한 Rounded UI 금지
- Card radius는 12~16px 중심
- Primary Button은 Orange background + Black text (화면당 하나)
- Accent Color는 상태에만 사용 — 선택된 탭, 주요 CTA, 온라인, 관계 변화, 새 Event
- Character Image와 Scene이 UI보다 항상 우선
- SaaS Dashboard처럼 만들지 말 것
- AI Tool처럼 보이게 만들지 말 것
- Dating App처럼 만들지 말 것
- Gaming HUD처럼 만들지 말 것
- Chat Bubble을 최소화할 것
- 숫자형 Relationship Score를 노출하지 말 것
- 관계 상태는 문장과 상황으로 표현할 것
- Motion은 Bounce보다 Fade / Slide / Reveal 중심
- Mobile-first로 구현할 것
```

---

## 36. Final Design Statement

MIRO 디자인의 최종 목표는 다음 한 문장으로 정의한다.

> **인터페이스를 보는 것이 아니라, 한 사람의 세계 안으로 들어가는 느낌을 만든다.**

UI는 조용해야 한다.  
캐릭터는 강해야 한다.  
관계 변화는 섬세해야 한다.  
세계는 살아 있는 것처럼 느껴져야 한다.

이 원칙은 Web, Mobile App, Character Page, Chat, Reality Message, Call, Live Scene, Face Cast, Event UI 전체에 동일하게 적용한다.

## 2026-09-15 홈 적용

홈은 작은 이어하기(최근 메시지/새 연락), 취향 필터, 상황 소개를 담은 2열 추천, 중복 없는 오리지널로 구성한다. 내가 만든 사람은 홈에서 제외하고 기존 관리 화면을 사용한다. 주황 #E8590C는 선택된 필터, 실제 새 연락 점, 작은 오리지널 표시와 키보드 포커스에만 사용한다. 공개 콘텐츠의 홈 추천은 표지와 소개가 있는 항목을 대상으로 하며 원본 데이터와 발견 화면은 유지한다.
