import { it,expect } from 'vitest'
import { matchSceneAsset } from '../simulation/scene-assets'
const url='https://example.test/approved.jpg'
const context={location:'카페',time:'저녁',mood:'calm',outfit:'coat',visualVersion:1}
const base={characterId:'c',sessionId:'s',mode:'normal' as const,context,publicUrls:[url]}
it('uses only registered images with matching character, mode and actual scene metadata',()=>{
 const asset={characterId:'c',mode:'normal',url,location:'카페',time:'저녁',outfit:'coat'}
 expect(matchSceneAsset([asset],base)?.url).toBe(url)
 for(const patch of [{characterId:'other'},{mode:'unveil'},{location:'집'},{outfit:'suit'},{url:'https://unapproved.test/a.jpg'}])expect(matchSceneAsset([{...asset,...patch}],base)).toBeNull()
 expect(matchSceneAsset([{...asset,location:''}],base)).toBeNull()
})
it('keeps private unveil images bound to their original conversation',()=>{
 const asset={characterId:'c',mode:'unveil',url:'/api/messenger-images/12345678-1234-1234-1234-123456789012',location:'카페',sessionId:'s'}
 expect(matchSceneAsset([asset],{...base,mode:'unveil'})?.url).toBe(asset.url)
 expect(matchSceneAsset([asset],{...base,mode:'unveil',sessionId:'other'})).toBeNull()
})
