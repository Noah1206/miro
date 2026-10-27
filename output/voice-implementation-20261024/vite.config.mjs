const base='/Users/johyeon-ung/Desktop/Miro'
const root=base+'/output/voice-implementation-20261024'
export default {root,publicDir:base+'/apps/web/public',esbuild:{jsx:'automatic'},plugins:[{
 name:'free-preview-boundaries',enforce:'pre',
 resolveId(id,importer){
  if(id==='./actions' && importer?.endsWith('/persona/form.tsx'))return '\0preview-persona-actions'
  if(id==='../character/[slug]/sections' && importer?.endsWith('/create/form-parts.tsx'))return '\0preview-line'
  if(id==='./delivery' && /messages\/\[sessionId\]\/(thread|composer)\.tsx$/.test(importer??''))return '\0preview-messenger'
  if(id==='next/font/google')return '\0preview-font'
 },
 load(id){
  if(id==='\0preview-persona-actions')return 'export async function savePersonaAction(){return {error:"미리보기에서는 저장하지 않아요."}};export const saveConversationPersonaAction=savePersonaAction;'
  if(id==='\0preview-line')return 'export const Line=()=>null;'
  if(id==='\0preview-messenger')return 'const items=Array.from({length:40},(_,i)=>({id:String(i),role:i%2?"character":"user",kind:"text",content:"문자 "+(i+1)+" · 오늘도 곁에 있어 줘서 고마워. 함께 천천히 이야기하자.",blocks:[],readAt:null})); export const useMessenger=()=>({items,send(){},retry(){}});'
  if(id==='\0preview-font')return 'export const Outfit=()=>({className:""});'
 }
}],resolve:{alias:[
 {find:/^@\/components\/ui$/,replacement:root+'/preview-ui.ts'},
 {find:'@/components/wallet/provider',replacement:root+'/preview-wallet.ts'},
 {find:'next/navigation',replacement:root+'/preview-navigation.ts'},
 {find:'next/link',replacement:root+'/preview-link.tsx'},
 {find:'@',replacement:base+'/apps/web'},
 {find:'react',replacement:base+'/apps/web/node_modules/react'},
 {find:'react-dom',replacement:base+'/apps/web/node_modules/react-dom'}
]},server:{host:'127.0.0.1',port:8810,strictPort:true,fs:{allow:[base]}}}
