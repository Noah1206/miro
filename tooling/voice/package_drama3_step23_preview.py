"""Local three-way comparison; verifies reused controls and every unprocessed take."""
import hashlib,html,json
from pathlib import Path
from package_drama3_step5_preview import measure

def digest(manifest):
    return hashlib.sha256(json.dumps(manifest,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def build(root):
    root=Path(root);manifest=json.loads((root/'manifest.json').read_text());source=json.loads((root/'source_manifest.json').read_text())
    assert {k:v for k,v in manifest.items() if k!='requests'}=={k:v for k,v in source.items() if k!='requests'}
    assert all(r in source['requests'] for r in manifest['requests'])
    labels={'original':'기존 Drama 3','step5':'Miro · 5회 모델','step23':'Miro · 23회 모델'}
    reports={a:json.loads((root/a/'report.json').read_text()) for a in labels};rows=[];cards=[]
    assert hashlib.sha256((root/'reference.wav').read_bytes()).hexdigest()==manifest['reference_sha256']
    for arm,report in reports.items():
        assert report['status']=='complete'
        assert report['manifest_sha256']==digest(manifest if arm=='step23' else source)
        assert report['precision']=='bfloat16' and report['fp8_experts'] is False
        assert report['reference_id']==manifest['reference_clip_id'] and report['waveform_postprocessing'] is False
    for req in manifest['requests']:
        takes=[]
        for arm,label in labels.items():
            item=next(i for i in reports[arm]['items'] if (i['id'],i['seed'])==(req['id'],req['seed']))
            for key in ['text','tagged_text','max_new_tokens']:assert item[key]==req[key]
            path=root/arm/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
            row={'arm':arm,'id':req['id'],'seed':req['seed'],'file':str(path.relative_to(root)),'truncated':item['truncated'],'finish_reason':item['finish_reason'],**measure(path)};rows.append(row)
            warning=' · <b>생성 길이 한도 도달</b>' if item['truncated'] else ''
            takes.append(f'<div class="take"><h3 data-real="{html.escape(label)}" data-blind="{chr(65+list(labels).index(arm))}">{label}</h3><audio controls preload="metadata" src="{row["file"]}"></audio><p>{row["seconds"]:.2f}초{warning}</p></div>')
        cards.append(f'<section><h2>{html.escape(("긴 대사 · " if req["group"]=="long" else "")+req["label"])} <small>시드 {req["seed"]}</small></h2><p class="line">{html.escape(req["text"])}</p><p class="scene">{html.escape(req.get("scene",""))}</p><div class="takes">'+''.join(takes)+'</div></section>')
    counts={a:sum(r['truncated'] for r in rows if r['arm']==a) for a in labels}
    result={'take_count':len(manifest['requests']),'audio_count':len(rows),'additional_training_updates':0,'truncated_counts':counts,'items':rows,'conditions_verified':True,'human_preference_evaluated':False,'quality_improvement_confirmed':False,'same_reference_and_per_request_settings':True,'reused_source_manifest_sha256':digest(source),'new_subset_manifest_sha256':digest(manifest),'notes':['23 and5 mean optimizer updates, not full dataset epochs.','Teacher effect cannot be isolated without a matched no-teacher training control.','No waveform time, gain, pitch or pause postprocessing. All predeclared takes are shown.']}
    (root/'comparison_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>007번 · Drama 3 / Miro 5회 / 23회</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#222539;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}main{max-width:1250px;margin:auto;padding:36px 24px 80px}h1{font-size:32px;line-height:1.35}h2{font-size:20px;margin:0}h3{font-size:15px;margin:0 0 12px}small,.note,.scene,.take p{font-size:13px;color:#687083}section{background:white;border:1px solid #e1e2e9;border-radius:14px;padding:24px;margin:20px 0}.takes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.take{background:#f5f6fa;padding:18px;border-radius:12px}audio{width:100%;height:42px}.line{font-size:18px}.bar{position:sticky;top:0;padding:14px;background:#f5f5f7f5;z-index:2;border-bottom:1px solid #ddd;display:flex;gap:20px;align-items:center}button{background:white;border:1px solid #bfc3d0;border-radius:9px;padding:10px;cursor:pointer}.reference{background:#eae6f4;padding:20px;border-radius:12px}.reference audio{max-width:520px}b{color:#a34636}a{color:#654893}@media(max-width:900px){.takes{grid-template-columns:1fr}h1{font-size:26px}main{padding:24px 14px}.bar{flex-wrap:wrap}}</style><main><p class="note">MIRO VOICE / 007</p><h1>기존 Drama 3 · Miro 5회 · Miro 23회</h1><p>같은 007번 참조·대사·감정 지시·시드로 비교합니다. 기존과 5회 음성은 재사용하고, 저장된 23회 모델로만 새로 생성했습니다.</p><p class="note">추가 학습 0회 · 8가지 조건 / 24개 음성 · 속도·강약 후처리 없음<br>5회와 23회는 전체 데이터 반복 횟수가 아닌 학습 업데이트 수입니다. 이 비교로 한국어 티처만의 효과를 분리할 수는 없습니다.</p>'''
    page+=f'<p class="note">생성 길이 한도 도달: 기존 {counts["original"]}/8 · 5회 {counts["step5"]}/8 · 23회 {counts["step23"]}/8. 해당 결과도 모두 공개합니다. 길이 변화 자체는 품질 점수가 아닙니다.</p>'
    page+='<div class="reference"><strong>공통 참조 · 실제 007번 녹음</strong><p class="note">'+html.escape(manifest['reference_text'])+'</p><audio controls src="reference.wav"></audio></div><div class="bar"><button id="blind">모델 이름 가리고 듣기</button><label>공통 음량 <input id="volume" type="range" min="0" max="1" step=".05" value=".75"></label></div>'
    page+=''.join(cards)+'''<p class="note">권리 확보된 007번 · 실제 35.9B BF16 · Built with Fish Audio<br><a href="RESULTS.txt">결과와 비용</a> · <a href="manifest.json">생성 조건</a></p></main><script>const players=[...document.querySelectorAll('audio')];for(const a of players){a.volume=.75;a.onplay=()=>players.filter(b=>b!==a).forEach(b=>b.pause())}document.querySelector('#volume').oninput=e=>players.forEach(a=>a.volume=+e.target.value);let blind=false;document.querySelector('#blind').onclick=e=>{blind=!blind;document.querySelectorAll('h3[data-real]').forEach(h=>h.textContent=blind?h.dataset.blind:h.dataset.real);e.target.textContent=blind?'모델 이름 보기':'모델 이름 가리고 듣기'}</script></html>'''
    (root/'compare.html').write_text(page);print(json.dumps({k:result[k] for k in ['take_count','audio_count','truncated_counts']}))

if __name__=='__main__':
    import sys
    build(sys.argv[1])
