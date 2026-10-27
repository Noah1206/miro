import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mergeConfig } from 'vitest/config'
import base from '../../vitest.config'
export default mergeConfig(base,{
 plugins:[{name:'compare-previous-usage-guard',enforce:'pre',load(id){
  if(id===resolve('apps/web/lib/usage/guard.ts'))return readFileSync(resolve('output/voice-character-launch-20261026/guard.before.txt'),'utf8')
 }}],
})
