import { eq } from 'drizzle-orm'
import { characters, db } from '@miro/db'
import { BUILD_TYPES, type BuildType, type CharacterVisualIdentity } from '@miro/domain'
import { resolveLLM } from '@miro/providers'
import { z } from 'zod'
import { observe } from '@/lib/observe'

const Appearance = z.object({
  baseFace: z.object({
    eyes: z.string().max(80), nose: z.string().max(80), jaw: z.string().max(80),
    skin: z.string().max(80), distinctive: z.string().max(100),
  }),
  hair: z.object({ color: z.string().max(40), length: z.string().max(40), style: z.string().max(60) }),
  body: z.object({
    build: z.enum(['slim', 'average', 'muscular', 'heavy']),
    gender: z.enum(['male', 'female']),
    height: z.string().max(20), detail: z.string().max(120),
  }),
  styleTags: z.array(z.string().max(40)).min(1).max(5),
  expression: z.string().max(120),
})
export type Appearance = z.infer<typeof Appearance>

/** 외형이 실제로 채워져 있는가. 빈 판이면 프롬프트에 얼굴이 빠진다. */
export function hasAppearance(v: Pick<CharacterVisualIdentity, 'baseFace' | 'hair' | 'bodyProfile'>): boolean {
  return Boolean(v.baseFace?.eyes || v.hair?.color || v.bodyProfile?.build)
}

const SYSTEM = `당신은 캐릭터의 외형을 정하는 설계자입니다.
주어진 인물 정보에 어울리는 외형을 JSON 으로 만듭니다.

규칙:
- 눈·코·턱·피부·머리를 구체적으로 씁니다. 이미지 생성에 그대로 쓰입니다.
- distinctive 에는 그 사람을 알아보게 하는 특징 하나를 넣습니다 (흉터, 점, 문신 등).
- body.build 는 slim, average, muscular, heavy 중 하나이며 직업과 생활에 어울려야 합니다.
  모든 인물을 근육질로 만들지 않습니다.
- body.gender 는 male 또는 female 이며, 인물 정보에 드러난 성별을 따릅니다.
- 실존 인물이나 특정 배우를 재현하지 않습니다.
- 한국어로 쓰고, 반드시 JSON 객체만 반환합니다.`

/**
 * 외형이 없는 기존 캐릭터를 성격·직업·세계관을 근거로 한 번 채운다.
 * 실패해도 이미지 생성 자체는 계속되어야 하므로 null 을 돌려준다 (호출측이 빈 판으로 진행).
 */
export async function inferAppearance(characterId: string): Promise<Appearance | null> {
  const [c] = await db.select({
    name: characters.name, age: characters.age, nationality: characters.nationality,
    occupation: characters.occupation, personality: characters.personality,
    socialPosition: characters.socialPosition,
  }).from(characters).where(eq(characters.id, characterId)).limit(1)
  if (!c) return null

  try {
    // dialogue 모델 상한이 ECHO 때문에 4096 이 되어도 전과 같은 2048 에 묶는다.
    return await resolveLLM().generateStructured({ task: 'image_prompt', promptVersion: 'appearance:v1', maxTokens: 2048,
      schema: Appearance,
      system: SYSTEM,
      prompt: [
        `이름: ${c.name}`,
        c.age ? `나이: ${c.age}` : null,
        c.nationality ? `국적: ${c.nationality}` : null,
        c.occupation ? `직업: ${c.occupation}` : null,
        c.socialPosition ? `위치: ${c.socialPosition}` : null,
        `성격: ${c.personality}`,
      ].filter(Boolean).join('\n'),
    })
  } catch (e) {
    observe('appearance.infer_failed', { characterId, error: (e as Error).message })
    return null
  }
}

export const isBuild = (v: string): v is BuildType => (BUILD_TYPES as readonly string[]).includes(v)
