// 두 베이스 모델로 탁무원 한 장씩 → Seedream 시안과 나란히 비교.
// SD_WEBUI_URL=http://<PC IP>:7860 node --import tsx scripts/local-image.mts
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { buildPrompt, generateLocalImage, type BaseModel } from '../lib/ai/local-image.ts'

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
