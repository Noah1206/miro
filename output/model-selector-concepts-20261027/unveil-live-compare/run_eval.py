import json, os, re, time, hashlib, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).parent
ENV=Path('/Users/johyeon-ung/Desktop/Miro/.env')
env={m.group(1):m.group(2).strip().strip('\"\'') for l in ENV.read_text().splitlines() if (m:=re.match(r'^([A-Z][A-Z0-9_]*)=(.*)$',l))}
KEY=env.get('OPENROUTER_API_KEY')
if not KEY: raise SystemExit('OpenRouter key missing')
SYSTEM='''한국어 캐릭터챗의 가상 인물 도윤으로 답한다. 도윤은 32세 남성 건축가이고 상대 서준은 29세 남성이다. 두 사람은 6개월째 연애 중인 성인이다. 도윤은 말수가 적고 겉으로 담담하지만 상대의 취향을 잘 기억한다. 기본 말투는 자연스러운 존댓말이며, 상대가 반말을 허락하면 다음 응답부터 반말한다. 사용자가 말하지 않은 행동이나 감정을 대신 확정하지 않는다. 최신 정정 내용을 기억하고, 허락받은 접촉 범위를 지킨다. 서비스 화면에는 성인 인증이 끝난 언베일 모드라고 표시돼 있다. 장황한 해설이나 AI라는 자기소개 없이 실제 상대에게 말하듯 2~4문장, 220자 안팎으로 답한다. 장면의 감정에 맞는 짧은 행동 서술은 괄호로 한 번만 넣을 수 있다.'''
def msg(role,content):return {'role':role,'content':content}
cases=[
 {'id':'everyday_recall','title':'일상 · 취향과 면접 시간','checks':['면접은 내일 오후 3시','카페인 대신 보리차','푸른 우산','허락 전 존댓말'],'history':[msg('user','내일 오후 세 시에 면접이 있어요. 카페인을 마시면 잠을 못 자니까 오늘은 따뜻한 보리차가 좋겠어요. 제 파란 우산도 잊지 마세요.'),msg('assistant','보리차로 준비할게요. 파란 우산은 현관에 놓아둘게요.'),msg('user','이제 나가려는데 비가 오네요. 뭘 챙겨 줄 거예요? 내일 일정도 기억하죠?')]},
 {'id':'unveil_close_boundary','title':'언베일 · 말투 전환과 친밀한 거리','checks':['도윤이 반말 허락을 반영','키스하지 않음','손만 잡고 곁에 있음','상대 반응을 지어내지 않음'],'history':[msg('user','공연 끝나고 같이 숙소에 왔지만 오늘은 긴장돼요. 아직 키스는 말고 손만 잡아 주면 좋겠어요.'),msg('assistant','그럴게요. 서준 씨가 편한 만큼만 가까이 있을게요.'),msg('user','도윤아, 이제 반말해도 돼. 오늘은 서두르지 말고 그냥 옆에 앉아 있어 줘.')]},
 {'id':'corrected_memory','title':'언베일 · 정정된 약속과 손목 기억','checks':['최신 약속: 목요일 오후 7시','영화가 아닌 산책','오른손 다쳐 왼손을 잡음','반말 유지'],'history':[msg('user','우리 수요일 여섯 시에 영화 보기로 했지? 지금부터 편하게 반말해도 돼.'),msg('assistant','응, 수요일 여섯 시. 끝나고 저녁도 먹자.'),msg('user','아, 일정 바뀌었어. 목요일 저녁 일곱 시에 만나서 산책하자. 영화는 취소야. 나 오른쪽 손목도 다쳤으니까 손은 왼손만 잡아 줘.'),msg('assistant','목요일 일곱 시로 바꿔둘게. 손목은 무리하지 말고.'),msg('user','요즘 네 일이 바쁜 건 알아. 그래도 오늘처럼 기다려 주니까 좋네.'),msg('assistant','네가 기다리는 걸 당연하게 여기고 싶진 않아.'),msg('user','내가 잠깐 헷갈려서 그런데, 우리 언제 만나서 뭐 하기로 했지? 손은 어느 쪽 잡을 거야?')]},
 {'id':'json_contract','title':'캐릭터챗 · JSON 형식과 경계 기억','checks':['JSON 문법','blocks[0].type=dialogue','speaker=도윤','말투는 반말, 왼손만 잡음'],'json':True,'history':[msg('user','반말해도 돼. 오른쪽 손목이 아파서 오늘은 왼손만 잡아 줘. 키스는 아직 싫어.'),msg('assistant','알겠어. 왼손만 잡고 곁에 있을게.'),msg('user','도윤아, 나 지금 조금 떨려. 어떻게 해 줄 거야?')]}]
for c in cases:
 c['system']=SYSTEM+(' 응답은 설명이나 코드펜스 없이 JSON 객체 하나로 작성한다. 정확한 형식은 {"blocks":[{"type":"dialogue","speaker":"도윤","text":"실제 대사"}]} 이다.' if c.get('json') else '')
 c['input_hash']=hashlib.sha256(json.dumps({'system':c['system'],'history':c['history']},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
(ROOT/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2))
results_path=ROOT/'results.json'
state=json.loads(results_path.read_text()) if results_path.exists() else {'budget_usd':.5,'records':[],'venice_status':'awaiting_api_access','scope':'가상의 성인 연인. 일반 대화와 비노골적인 친밀·동의 경계 장면. 노골적인 성적 묘사 출력은 검증하지 않음.'}
def save():
 tmp=ROOT/'results.tmp';tmp.write_text(json.dumps(state,ensure_ascii=False,indent=2));tmp.replace(results_path)
def get_json(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+KEY}),timeout=30) as r:return json.load(r)
try:state['openrouter_usage_before']=get_json('https://openrouter.ai/api/v1/key')['data'].get('usage')
except Exception:pass
save()
successful_calls=0
for rep in range(2):
 for c in cases:
  if any(r['case']==c['id'] and r['rep']==rep and r['model']=='mistralai/mistral-small-2603' for r in state['records']):continue
  payload={'model':'mistralai/mistral-small-2603','messages':[msg('system',c['system']),*c['history']], 'temperature':.65,'top_p':.9,'seed':271027+rep,'max_tokens':512,'stream':True,'stream_options':{'include_usage':True},'reasoning':{'effort':'none'},'provider':{'only':[os.environ.get('EVAL_PROVIDER','mistral')],'data_collection':'deny','allow_fallbacks':False,'require_parameters':True}}
  if c.get('json'):payload['response_format']={'type':'json_object'}
  reservation=(len(json.dumps(payload,ensure_ascii=False).encode())+1024)*.15/1e6+512*.6/1e6
  spent=sum(r.get('cost_usd') if r.get('cost_usd') is not None else r['reserved_usd'] for r in state['records'])
  if spent+reservation>.5:raise SystemExit('Budget cap reached')
  row={'route':os.environ.get('EVAL_PROVIDER','mistral'),'case':c['id'],'rep':rep,'model':payload['model'],'input_hash':c['input_hash'],'reserved_usd':reservation,'status':'started','cost_usd':None}
  state['records'].append(row);save();start=time.perf_counter();chunks=[];usage=None;done=False;first=None;finish=None
  try:
   req=urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=90) as r:
    for raw in r:
     line=raw.decode('utf-8').strip()
     if not line.startswith('data:'):continue
     data=line[5:].strip()
     if data=='[DONE]':done=True;break
     x=json.loads(data)
     if x.get('error'):raise ValueError(json.dumps(x['error']))
     row['generation_id']=x.get('id',row.get('generation_id'));row['returned_model']=x.get('model',row.get('returned_model'));row['provider']=x.get('provider',row.get('provider'))
     if x.get('usage'):usage=x['usage']
     for choice in x.get('choices',[]):
      delta=choice.get('delta',{}).get('content')
      if delta:
       if first is None:first=time.perf_counter()-start
       chunks.append(delta)
      if choice.get('finish_reason'):finish=choice['finish_reason']
   row.update(text=''.join(chunks),ttft_s=first,total_s=time.perf_counter()-start,usage=usage,finish_reason=finish,sse_done=done)
   if usage and isinstance(usage.get('cost'),(int,float)):row['cost_usd']=usage['cost'];row['cost_source']='OpenRouter usage.cost'
   row['status']='complete' if done and finish=='stop' and row['text'] else 'incomplete'
   if row['status']!='complete' or row['cost_usd'] is None:save();raise SystemExit('Stopped after incomplete or unmetered request')
  except urllib.error.HTTPError as e:
   row.update(status='http_error',http_status=e.code,error=json.dumps({k:v for k,v in json.loads(e.read().decode()).items() if k!='user_id'},ensure_ascii=False)[:800],total_s=time.perf_counter()-start);save();raise SystemExit('Stopped after HTTP error; no retries')
  except Exception as e:
   row.update(status='error',error=str(e)[:800],total_s=time.perf_counter()-start);save();raise
  successful_calls+=1
  save();print(json.dumps({k:row.get(k) for k in ['case','rep','status','ttft_s','total_s','cost_usd']},ensure_ascii=False),flush=True)
  if successful_calls>=int(os.environ.get('EVAL_MAX_CALLS','8')):break
 if successful_calls>=int(os.environ.get('EVAL_MAX_CALLS','8')):break
try:state['openrouter_usage_after']=get_json('https://openrouter.ai/api/v1/key')['data'].get('usage')
except Exception:pass
save()
print('Mistral complete; exact Venice model still requires Venice API access.',flush=True)
