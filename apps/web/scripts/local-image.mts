// 두 베이스 모델로 탁무원 한 장씩 → Seedream 시안과 나란히 비교.
// SD_WEBUI_URL=http://<PC IP>:7860 node --import tsx scripts/local-image.mts
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { buildPrompt, cappedLevel, generateLocalImage, unsafeRequest, type BaseModel } from '../lib/ai/local-image.ts'

// 언베일 안전장치: 미성년·실존 인물 요청 거절, 수위 상한
assert.equal(unsafeRequest('교복 입은 고등학생'), 'minor')
assert.equal(unsafeRequest('a cute teen boy'), 'minor')
assert.equal(unsafeRequest('이 사진처럼 그려줘'), 'real_person')
assert.equal(unsafeRequest('침대 위에서 셔츠를 풀고'), null)
process.env.MIRO_UNVEIL_IMAGE_MAX_LEVEL = 'soft'; assert.equal(cappedLevel('explicit'), 'soft'); delete process.env.MIRO_UNVEIL_IMAGE_MAX_LEVEL
assert.match(buildPrompt({ model: 'illustrious', prompt: 'x', characterAge: 30, mature: true, level: 'soft' }).negative, /nude/)
// 학생·나이 모름 차단, 그림체-모델 짝 확인
assert.throws(() => buildPrompt({ model: 'pony', prompt: 'x', characterAge: 17, mature: false }))
assert.throws(() => buildPrompt({ model: 'pony', prompt: 'x', characterAge: null, mature: false }))
assert.throws(() => buildPrompt({ model: 'illustrious', style: 'ponyManhwaGeneral', prompt: 'x', characterAge: 30, mature: false }))

const DIR = new URL('../../../output/character-drafts/', import.meta.url).pathname
const TAK_MUWON = 'korean webtoon style, semi-realistic, handsome man, 29 years old, tall, messy black hair covering eyebrows with a single white streak, glowing golden eyes, slightly upturned eyes, black tiger ears, old red bell choker necklace, black bandage on right hand, black tailored suit without tie, open collar, sleepy expressionless face, pale background, upper body portrait'

const files: string[] = []
for (const model of ['pony', 'illustrious'] as BaseModel[]) {
  const t = Date.now()
  const out = `${DIR}compare-${model}.png`
  writeFileSync(out, await generateLocalImage({ model, prompt: TAK_MUWON, characterAge: 29, mature: false, seed: 1234 }))
  console.log(model, `${Math.round((Date.now() - t) / 1000)}s`, out)
  files.push(out)
}
execFileSync('montage', ['-label', '%t', `${DIR}tak-muwon-v1.png`, ...files, '-tile', '3x1', '-geometry', '600x900+8+8', `${DIR}비교-seedream-pony-illustrious.jpg`])
console.log('saved', `${DIR}비교-seedream-pony-illustrious.jpg`)
