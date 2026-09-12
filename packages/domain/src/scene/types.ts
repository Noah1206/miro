export type Scene = {
  id: string
  sessionId: string
  location: string
  time: string
  mood: string
  weather: string
  /** 동일 Scene 재생성을 막는 캐시 키. 기존 Asset 재사용은 Usage 를 소비하지 않는다. */
  sceneKey: string
  backgroundAssetId: string | null
  createdAt: Date
}

export type SceneDelta = {
  location?: string
  time?: string
  mood?: string
  weather?: string
}

/** 동일한 장면 조건이면 동일한 키 → 캐시 적중 → Usage 미소비. */
export function buildSceneKey(d: {
  location: string; time: string; mood: string; weather: string
}): string {
  return [d.location, d.time, d.mood, d.weather]
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .join('|')
}
