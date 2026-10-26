import type { PhotoContext } from '@miro/domain'
type SceneAsset={characterId:string;mode:'normal'|'unveil';url:string;location:string;time?:string;mood?:string;outfit?:string;sessionId?:string}
const normalized=(s:string)=>s.trim().toLocaleLowerCase().replace(/\s+/g,' ')
/** Explicit metadata only. Untagged gallery pictures must not impersonate the current scene. */
export function matchSceneAsset(raw:unknown,input:{characterId:string;sessionId:string;mode:'normal'|'unveil';context:PhotoContext;publicUrls:string[]}) {
  if(!Array.isArray(raw))return null
  return (raw as SceneAsset[]).filter(a=>a&&a.characterId===input.characterId&&a.mode===input.mode&&typeof a.url==='string'
    && typeof a.location==='string'&&!!a.location.trim()&&normalized(a.location)===normalized(input.context.location)
    && (input.mode==='normal'?input.publicUrls.includes(a.url):a.sessionId===input.sessionId&&/^\/api\/messenger-images\/[0-9a-f-]{36}$/i.test(a.url))
    && (['time','mood','outfit'] as const).every(key=>a[key]===undefined||typeof a[key]==='string'&&normalized(a[key]!)===normalized(input.context[key]))
  ).sort((a,b)=>['time','mood','outfit'].filter(k=>b[k as keyof SceneAsset]!==undefined).length-['time','mood','outfit'].filter(k=>a[k as keyof SceneAsset]!==undefined).length)[0]??null
}
