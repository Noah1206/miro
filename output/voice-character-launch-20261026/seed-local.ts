import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { db,sql } from '../../packages/db/src'
import { testDatabaseUrl } from '../../tooling/test-database'
async function main(){
testDatabaseUrl(process.env.DATABASE_URL)
const [session]=await db.execute<{id:string;user_id:string;character_id:string;name:string;current_location:string;current_time:string}>(sql`
 SELECT r.id,r.user_id,r.character_id,c.name,w.current_location,w.current_time FROM roleplay_sessions r
 JOIN users u ON u.id=r.user_id JOIN characters c ON c.id=r.character_id JOIN world_states w ON w.session_id=r.id
 WHERE u.email='speech-1792851492634@miro.dev' AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1`)
if(!session)throw new Error('Create the local QA conversation through the UI first')
const [existingVoice]=await db.execute<{id:string}>(sql`SELECT id FROM official_voices WHERE provider_voice_id=${'a'.repeat(64)}`)
const voice=existingVoice?.id??'launch-local-tone-only'
await db.execute(sql`INSERT INTO official_voices(id,label,provider,provider_voice_id,status,samples,rights,approval)
 VALUES(${voice},'로컬 기능검사용','gpt-sovits',${'a'.repeat(64)},'active','[]','{"test":true}','{"test":true}') ON CONFLICT(id) DO NOTHING`)
await db.execute(sql`UPDATE characters SET voice_id=${voice} WHERE id=${session.character_id}`)
const blocks=[{type:'narrative',text:'분위기 묘사는 화면에만 남긴다. 이 줄은 음성 요청에 들어가면 안 된다.'},
 {type:'dialogue',speaker:session.name,text:'오늘 하루는 어땠어? 네 이야기를 듣고 싶어.'},
 {type:'dialogue',speaker:session.name,text:'잠깐만, 가까이 와 봐. 조용히 말해 줄게.',delivery:{tone:'whisper',emotion:'neutral',pace:'slow',intensity:'soft',pauseAfterMs:300}},
 {type:'dialogue',speaker:session.name,text:'오늘은 서두르지 않아도 돼. 잠깐 쉬었다가 네가 편해졌을 때 천천히 이야기해 줘. 나는 여기서 기다리고 있을게.'}]
const messageId=randomUUID()
await db.execute(sql`INSERT INTO messages(id,session_id,role,kind,content,blocks,turn_index) VALUES(${messageId},${session.id},'character','text','로컬 기능 검사 대사',${JSON.stringify(blocks)}::jsonb,20)`)
await db.execute(sql`INSERT INTO recharge_grants(user_id,amount,source,provider,external_ref) VALUES(${session.user_id},1000,'purchase','local_fixture',${'launch:'+session.user_id}) ON CONFLICT DO NOTHING`)
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const asset={characterId:session.character_id,mode:'normal',url:png,location:session.current_location}
await db.execute(sql`UPDATE characters SET images=images || ${JSON.stringify([png])}::jsonb WHERE id=${session.character_id} AND NOT images @> ${JSON.stringify([png])}::jsonb`)
writeFileSync('output/voice-character-launch-20261026/local-fixture.json',JSON.stringify({sessionId:session.id,userId:session.user_id,characterId:session.character_id,messageId,sceneAssets:[asset],allAudioIsToneFixture:true,allImagesAreFixture:true},null,2))
console.log('Local fixture ready; no production data or model generation used.')
process.exit(0)
}
main().catch(e=>{console.error(e.message);process.exit(1)})
