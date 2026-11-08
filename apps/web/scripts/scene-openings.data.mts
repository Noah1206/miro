/**
 * 기본이 아닌 시작 상황(도입부)의 첫 장면 설명·시작 시각·장소(10/6).
 * 시드 스크립트가 그 도입부의 첫 인트로 줄에 붙인다 — 대화방이 그 장면으로 열리면 AI 의 '첫 장면'과 화면 위 장소·시간이 이것으로 바뀐다.
 * 기본 도입부는 캐릭터의 startingContext·startingTime·세계 장소를 그대로 쓴다.
 */
export type SceneOpening = { context: string; time: string; location: string }

// 11/8 여성향(BL) 장면 삭제 — 남성향 장면은 각 데이터 파일(SCENE_OPENINGS_B 등)에 있다.
export const SCENE_OPENINGS: Record<string, Record<string, SceneOpening>> = {
}
