import { SpeechError } from './policy'
import { feature } from '@miro/config'

export const speechCreditsEnabled = () => feature('characterVoice') && process.env.MIRO_SPEECH_CREDITS_ENABLED === '1'
export type SpeechAmount = 'standard' | 'extended'
export function speechAmount(value: unknown): SpeechAmount {
  if (value === undefined || value === 'standard') return 'standard'
  if (value === 'extended') return value
  throw new SpeechError('invalid_speech_amount', 400)
}
export const speechAllowance = (amount: SpeechAmount) => amount === 'extended'
  ? { seconds: 20, characters: 80 } : { seconds: 10, characters: 40 }
export function speechProducts() {
  const raw: unknown = JSON.parse(process.env.MIRO_SPEECH_PRODUCTS || '[]')
  if (!Array.isArray(raw)) throw new SpeechError('speech_policy_missing')
  const ids = new Set<string>()
  return raw.map((p: { id?: unknown; seconds?: unknown; units?: unknown }) => {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9_-]{1,48}$/.test(p.id) || ids.has(p.id)
      || !Number.isSafeInteger(p.seconds) || Number(p.seconds) < 1 || Number(p.seconds) > 3600
      || !Number.isSafeInteger(p.units) || Number(p.units) < 1 || Number(p.units) > 100000) throw new SpeechError('speech_policy_missing')
    ids.add(p.id)
    return { id: p.id, seconds: Number(p.seconds), units: Number(p.units) }
  })
}
export function speechTrial() {
  const seconds = Number(process.env.MIRO_SPEECH_TRIAL_SECONDS ?? 15)
  const users = Number(process.env.MIRO_SPEECH_TRIAL_USERS ?? 100)
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 60 || !Number.isSafeInteger(users) || users < 0 || users > 10000) throw new SpeechError('speech_policy_missing')
  return { seconds, users }
}

/** Parse server-returned PCM/float WAV; never trust a browser-reported duration. */
export function speechAudioSeconds(audio: ArrayBuffer): number {
  const b = Buffer.from(audio)
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new SpeechError('invalid_speech_audio')
  let offset = 12, byteRate = 0, dataBytes = 0, bits = 0, format = 0, channels = 0, blockAlign = 0
  const data:Buffer[]=[]
  while (offset + 8 <= b.length) {
    const kind = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4), start = offset + 8
    if (start + size > b.length) throw new SpeechError('invalid_speech_audio')
    if (kind === 'fmt ') {
      if (size < 16 || byteRate || ![1, 3].includes(b.readUInt16LE(start))) throw new SpeechError('invalid_speech_audio')
      format=b.readUInt16LE(start);channels=b.readUInt16LE(start+2);blockAlign=b.readUInt16LE(start+12)
      byteRate = b.readUInt32LE(start + 8)
      bits = b.readUInt16LE(start + 14)
      if (![16,24,32].includes(bits) || format===3&&bits!==32 || ![1,2].includes(channels)
        || blockAlign!==channels*bits/8 || byteRate!==b.readUInt32LE(start+4)*blockAlign
        || byteRate < 8000 || byteRate > 768000) throw new SpeechError('invalid_speech_audio')
    }
    if (kind === 'data') {dataBytes+=size;data.push(b.subarray(start,start+size))}
    offset = start + size + (size % 2)
  }
  if (!byteRate || !dataBytes || dataBytes%blockAlign) throw new SpeechError('invalid_speech_audio')
  let energy=0,count=0
  for(const chunk of data) {
    if(chunk.length%blockAlign)throw new SpeechError('invalid_speech_audio')
    for(let n=0;n<chunk.length;n+=bits/8) {
      const sample=format===3?chunk.readFloatLE(n):bits===16?chunk.readInt16LE(n)/32768:bits===24?chunk.readIntLE(n,3)/8388608:chunk.readInt32LE(n)/2147483648
      if(!Number.isFinite(sample)||Math.abs(sample)>1.01)throw new SpeechError('invalid_speech_audio')
      energy+=sample*sample;count++
    }
  }
  if(!count||Math.sqrt(energy/count)<.00001)throw new SpeechError('invalid_speech_audio')
  const seconds = dataBytes / byteRate
  if (!Number.isFinite(seconds) || seconds < .1 || seconds > 60) throw new SpeechError('invalid_speech_audio')
  return seconds
}
