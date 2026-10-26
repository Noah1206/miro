import { afterEach,it,expect,vi } from 'vitest'
import { speechAudioSeconds,speechAmount,speechProducts,speechTrial } from '../speech/credits-policy'
import { testWav } from '../../../../tooling/test-wav'
afterEach(()=>vi.unstubAllEnvs())
it('measures actual PCM duration and rejects silent/truncated/unrecognized data',()=>{
 expect(speechAudioSeconds(testWav(2.2))).toBeCloseTo(2.2)
 const silent=testWav(1);new Uint8Array(silent).fill(0,44);expect(()=>speechAudioSeconds(silent)).toThrow()
 expect(()=>speechAudioSeconds(testWav(1).slice(0,60))).toThrow()
 expect(()=>speechAudioSeconds(new ArrayBuffer(100))).toThrow()
 const corrupt=testWav(1);new DataView(corrupt).setUint32(28,1234,true);expect(()=>speechAudioSeconds(corrupt)).toThrow()
 const nonfinite=testWav(1);const view=new DataView(nonfinite);view.setUint16(20,3,true);view.setUint16(34,32,true);view.setUint16(32,4,true);view.setUint32(28,64000,true);view.setFloat32(44,NaN,true)
 expect(()=>speechAudioSeconds(nonfinite)).toThrow()
})
it('accepts only server-owned amounts, catalogs and bounded trial grants',()=>{
 expect(speechAmount(undefined)).toBe('standard');expect(speechAmount('extended')).toBe('extended');expect(()=>speechAmount('unlimited')).toThrow()
 vi.stubEnv('MIRO_SPEECH_PRODUCTS','[{"id":"a","seconds":-1,"units":0}]');expect(()=>speechProducts()).toThrow()
 vi.stubEnv('MIRO_SPEECH_TRIAL_SECONDS','10000');expect(()=>speechTrial()).toThrow()
})
