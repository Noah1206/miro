"""Use Miro's configured Gemini model for a joint three-scene acting plan.

Only authored benchmark text is sent. API credentials never enter artifacts.
"""
import argparse,json,urllib.request
from pathlib import Path
from qwen_frame_control import validate_plan


def main():
    p=argparse.ArgumentParser();p.add_argument('--benchmark',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    env={}
    for line in Path('.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key,value=line.split('=',1);env[key.strip()]=value.strip().strip('"').strip("'")
    model=env['GEMINI_MODEL'];key=env['GEMINI_API_KEY'];benchmark=json.loads(Path(a.benchmark).read_text())
    system='''너는 한국어 캐릭터 오디오드라마의 연기 감독이다. 같은 대사를 세 맥락에서 실제 배우에게 다르게 연기하도록 지도한다. 직전 대화·인물의 의도에만 근거하고 없는 사건을 만들어내지 마라. 분노를 곧 고함으로, 위로를 곧 슬픔으로 치환하지 마라. 각 문장의 핵심 의도와 속도·강약 흐름을 정한다. 두 개의 문장은 required_phrases 순서 그대로 각각 독립 구절로 반환한다.
세 장면을 함께 비교해서 위로, 억눌린 분노, 안도의 연기 차이를 수치에도 반영하라. 무작위로 차이만 만드는 것이 아니라 장면에서 근거를 설명하라. 같은 문장의 세 장면이 같은 숫자로 복사되면 안 된다. 속도는 구절 평균 목표, 에너지는 평소 캐릭터 발화 대비 구절 시작/중간/끝의 목표다. 에너지 수치는 재생 볼륨이 아니다. 긴장이 풀린 안도와, 상대에게 안정감을 주는 위로를 구분하라.
JSON 형식: items 배열에 각 id, evidence, inner_emotion, outward_delivery, phrases를 반환한다. phrases의 각 항목은 text, rate_relative_to_character(0.7~1.3), energy_start_db(-5~4), energy_mid_db(-5~4), energy_end_db(-5~4), pause_after_ms(0~700)를 갖는다. 마지막 구절의 pause_after_ms는0. 단어 추가·삭제 금지. 모든 숫자는 제안이며 검증된 정답이 아니다. 지시 대상이 현재 여성007번인 점을 유지한다. 속삭임·신음·숨·웃음 등 학습하지 않은 발성을 요청하지 않는다.'''
    body={'systemInstruction':{'parts':[{'text':system}]},'contents':[{'role':'user','parts':[{'text':json.dumps(benchmark['cases'],ensure_ascii=False)}]}],
          'generationConfig':{'responseMimeType':'application/json','maxOutputTokens':4096,'thinkingConfig':{'thinkingLevel':'minimal'}}}
    request=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','x-goog-api-key':key})
    with urllib.request.urlopen(request,timeout=55) as response:raw=json.load(response)
    parts=raw['candidates'][0]['content']['parts'];content=''.join(p.get('text','') for p in parts if not p.get('thought'));parsed=json.loads(content);byid={x['id']:x for x in parsed['items']};items=[]
    for case in benchmark['cases']:
        plan={k:v for k,v in byid[case['id']].items() if k!='id'};validate_plan(plan,case['text'])
        if [p['text'] for p in plan['phrases']]!=case['required_phrases'] or plan['phrases'][-1]['pause_after_ms']!=0:raise ValueError('Director phrase schema mismatch')
        items.append({'case':case,'plan':plan,'raw_attempts':[content]})
    controls=[json.dumps(x['plan']['phrases'],sort_keys=True,ensure_ascii=False) for x in items]
    if len(set(controls))!=len(items):raise ValueError('Director produced identical scene controls')
    result={'planner':model,'model_version':raw.get('modelVersion'),'system':system,'items':items,'usage':raw.get('usageMetadata'),'synthetic_context_plans_not_actor_annotations':True}
    Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'planner':model,'cases':len(items),'distinct_controls':len(set(controls))},ensure_ascii=False))


if __name__=='__main__':main()
