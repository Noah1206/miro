"""Local listening board for the real35B matched Full FT experiment."""
import argparse,json,html
from pathlib import Path


def build(root):
    root=Path(root);manifest=json.loads((root/'manifest.json').read_text())
    status=json.loads((root/'status.json').read_text()) if (root/'status.json').exists() else {}
    comparison=json.loads((root/'training_comparison.json').read_text()) if (root/'training_comparison.json').exists() else None
    arms=(comparison or status).get('listening_arms',['original','baseline','korean_teacher'])
    if len(arms)!=len(set(arms)) or 'original' not in arms or any(x not in ['original','baseline','korean_teacher'] for x in arms):
        raise ValueError('Invalid listening arms')
    names={'original':'원본 Drama 3','baseline':'Miro · 기존 방식 Full FT','korean_teacher':'Miro · 한국어 티처 Full FT'}
    esc=html.escape
    reports={}
    for arm in arms:
        path=root/arm/'report.json'
        reports[arm]={(item['id'],item['seed']):item for item in json.loads(path.read_text())['items']} if path.exists() else {}
    def audio(path):
        return '<audio controls preload="none" src="'+esc(str(path),quote=True)+'"></audio>' if (root/path).exists() else '<p class="pending">생성·다운로드 대기</p>'
    header=''
    if comparison is not None:
        values=[]
        for arm in [x for x in arms if x!='original']:
            rows=comparison['arms'][arm]['validation'];values.append((arm,rows[0]['speech_loss_mean'],rows[-1]['speech_loss_mean']))
        header='<div class="metrics">'+''.join('<div><small>'+esc(names[arm])+'</small><strong>'+f'{before:.4f} → {after:.4f}'+'</strong><span>동일한 검증 문장 · 음성 손실</span></div>' for arm,before,after in values)+'</div>'
        if len(values)==2:
            delta=(values[1][2]-values[0][2])/values[0][2]*100
            header+='<p class="note">검증 음성 손실은 낮을수록 좋습니다. 한국어 티처의 기존 방식 대비 변화 '+f'{delta:+.2f}%'+'이며, 이 수치는 사람 같은 연기의 청취 점수가 아닙니다.</p>'
        else:
            header+='<p class="note">동일 모델의 학습 전후 검증 음성 손실입니다. 사람 같은 연기의 청취 점수가 아닙니다. 티처 없는 모델은 별도로 학습하지 않았으므로, 변화의 원인을 한국어 티처만으로 구분할 수 없습니다.</p>'
    order={'acting':0,'long':1,'whisper':2,'heldout':3};requests=sorted(enumerate(manifest['requests']),key=lambda pair:(order[pair[1]['group']],pair[0]))
    cards=[]
    for _,request in requests:
        filename=request['id']+'_s'+str(request['seed'])+'.wav'
        cells=''
        for arm,label in zip(arms,['A','B'] if len(arms)==2 else ['원본 대조군','A','B']):
            item=reports[arm].get((request['id'],request['seed']),{})
            caption=('<p class="note">'+f"{item['seconds']:.2f}초"+(' · 길이 한도 도달' if item.get('truncated') else '')+'</p>') if item else ''
            cells+='<div class="take"><h3 data-real="'+esc(names[arm],quote=True)+'" data-blind="'+label+'">'+esc(names[arm])+'</h3>'+audio(Path(arm)/filename)+caption+'</div>'
        human=''
        if request.get('source_clip_id'):
            human='<div class="human"><span>같은 대사의 실제 007번 녹음</span>'+audio(Path('real_recordings')/(request['source_clip_id']+'.wav'))+'</div>'
        cards.append('<section class="card"><div class="line"><h2>'+esc(request['label'])+'</h2><small>생성 시드 '+str(request['seed'])+'</small></div><p class="dialogue">'+esc(request['text'])+'</p>'+
             ('<p class="scene">'+esc(request['scene'])+'</p>' if request.get('scene') else '')+'<div class="takes">'+cells+'</div>'+human+'</section>')
    complete=sum((root/arm/(r['id']+'_s'+str(r['seed'])+'.wav')).exists() for arm in arms for r in manifest['requests'])
    page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Miro · 실제 모델 Full FT 비교</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f4f8;color:#182039;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}main{max-width:1260px;margin:0 auto;padding:48px 28px 90px}h1{font-size:32px;letter-spacing:-1.3px;margin:8px 0 16px}h2{font-size:20px;margin:0}h3{font-size:14px;color:#4d5670;margin:0 0 10px}p{margin:8px 0}.eyebrow{color:#6550a7;font-size:13px;font-weight:750;letter-spacing:.08em}.intro{max-width:850px;color:#626b80}.badge{display:inline-block;font-size:12px;padding:5px 12px;border-radius:20px;background:#e7e2f4;color:#544184;margin-right:6px}.bar{position:sticky;top:0;z-index:1;background:rgba(243,244,248,.96);border-bottom:1px solid #dde0e8;padding:16px 0;display:flex;gap:24px;align-items:center;flex-wrap:wrap}.bar label{font-size:14px}.bar button{border:1px solid #cdd2df;border-radius:9px;padding:9px 15px;background:white;color:#303b59;cursor:pointer}.card{background:white;padding:26px 28px;margin-top:20px;border-radius:16px;border:1px solid #e2e5ed;box-shadow:0 3px 15px #1a244c04}.line{display:flex;align-items:center;justify-content:space-between;gap:20px}.line small,.scene{color:#7b8293;font-size:13px}.dialogue{font-size:18px;max-width:1020px;color:#303b55;margin:12px 0 18px}.takes{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.take{background:#f7f8fb;padding:16px;border-radius:10px}audio{width:100%;height:42px}.human{border-top:1px solid #e9ebf1;margin-top:20px;padding-top:16px;display:flex;align-items:center;gap:20px;font-size:13px;color:#666f83}.human audio{max-width:450px}.reference{background:#eae6f5;padding:20px 24px;border-radius:14px;display:flex;align-items:center;gap:28px;margin:26px 0 16px}.reference audio{max-width:450px}.reference small{display:block;color:#70637e}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:26px 0 12px}.metrics>div{background:white;border:1px solid #e2e5ed;border-radius:14px;padding:20px}.metrics small,.metrics span{display:block;color:#70798a;font-size:12px}.metrics strong{display:block;font-size:28px;color:#544184;margin:6px 0}.note{font-size:13px;color:#6a7284}.pending{color:#9aa0af;font-size:13px}footer{margin-top:36px;color:#8990a0;font-size:12px}a{color:#6550a7} @media(max-width:800px){main{padding:24px 16px 60px}.takes{grid-template-columns:1fr}.card{padding:20px}.reference{display:block}.metrics{grid-template-columns:1fr}.human{display:block}h1{font-size:26px}.line{align-items:flex-start}}
</style><main><div class="eyebrow">MIRO VOICE LAB / ACTUAL 35B</div><h1>같은 목소리, 같은 대사. 학습 방식만 바꿨습니다.</h1><p class="intro">축소 모델이 아닌 실제 Drama 3 기반 Miro 모델의 비교입니다. 기존 방식과 한국어 티처 방식은 같은 초기 가중치에서 출발해, 같은 007번 문장 400개를 같은 순서로 학습했습니다.</p><p><span class="badge">두 방식 모두 25회 업데이트</span><span class="badge">Full FT · LoRA 없음</span><span class="badge">같은 참조 · 같은 생성 시드</span></p><p class="note">짧은 비교 학습 결과입니다. 프로덕션 품질이나 감정 개선을 보장하는 결과는 아닙니다. 음성의 속도·피치·강약은 후처리하지 않았습니다.</p>'''
    if len(arms)==2:
        page=page.replace('같은 목소리, 같은 대사. 학습 방식만 바꿨습니다.','같은 목소리, 같은 대사. 한국어 티처 학습 전후를 비교합니다.')
        page=page.replace('기존 방식과 한국어 티처 방식은 같은 초기 가중치에서 출발해, 같은 007번 문장 400개를 같은 순서로 학습했습니다.',
                          '원본 Drama 3와, 권리 확보된 007번 문장 400개로 한국어 티처를 적용해 전체 가중치를 학습한 Miro 모델을 비교합니다. 티처 없는 비교 모델은 재학습하지 않습니다.')
        page=page.replace('두 방식 모두 25회 업데이트','한국어 티처 모델 · 25회 업데이트')
        page=page.replace('.takes{display:grid;grid-template-columns:repeat(3,1fr)', '.takes{display:grid;grid-template-columns:repeat(2,1fr)')
        if comparison is not None:
            result=comparison['arms']['korean_teacher']['result']
            actual=result['steps_completed'];clips=result.get('clip_presentations_total',actual*16)
            page=page.replace('한국어 티처 모델 · 25회 업데이트','한국어 티처 모델 · '+str(actual)+'회 업데이트')
            page=page.replace('007번 문장 400개로','007번 문장 '+str(clips)+'개로')
            if result.get('independent_engine_reload_verified'):
                page+='<div class="card"><b>학습 재개 검증 완료</b><p>가중치·옵티마이저·난수·데이터 위치를 저장하고, 새 학습 프로세스에서 복원한 뒤 실제 검증 계산을 통과했습니다. 원본 모델부터 재학습하지 않았습니다. 첫 1회 저장본을 이어받을 때만 옵티마이저를 새로 구성했습니다.</p></div>'
            if actual<25:
                page+='<p class="note">비용을 줄이기 위해 '+str(actual)+'회에서 멈췄습니다. 앞서 계획한 25회 학습의 완료 결과가 아니며, 연기 품질의 개선은 아직 청취 평가하지 않았습니다.</p>'
    if comparison is None:
        page=page.replace('학습했습니다.','학습하도록 설정했습니다.').replace('두 방식 모두 25회 업데이트','목표 · 두 방식 각각 25회 업데이트')
        if len(arms)==2:
            page=page.replace('한국어 티처 모델 · 25회 업데이트','목표 · 한국어 티처 모델 25회 업데이트').replace('학습한 Miro 모델을 비교합니다.','학습할 Miro 모델의 비교를 준비하고 있습니다.')
            target=status.get('planned_target_step',25)
            if target<25:
                page=page.replace('목표 · 한국어 티처 모델 25회 업데이트','목표 · 한국어 티처 모델 최대 '+str(target)+'회 업데이트')
                page=page.replace('007번 문장 400개로','007번 문장 최대 '+str(target*16)+'개로')
    if status.get('phase')=='blocked_billing':
        detail=('한국어 티처 모델은'+str(status.get('teacher_steps_completed',0))+'/25회입니다. 원본 대조 음성16개를 재사용하며, 비교용 모델은 별도로 학습하지 않습니다.' if len(arms)==2 else '기존 방식은5/25회, 한국어 티처는0/25회입니다.')
        if status.get('teacher_steps_completed',0)>0 and status.get('intermediate_tts_weights_available') is False:
            detail+=' 중간 가중치가 저장되지 않아 이 상태를 이어 학습하거나 음성으로 생성할 수 없습니다.'
        page+='<div class="card"><b>학습 대기 · Modal 계정 일시 중지</b><p>'+detail+' 학습 후 모델과 비교 음성은 아직 완성되지 않았습니다.</p><a href="https://modal.com/settings/ab40905045/usage">Modal 계정 상태 확인</a></div>'
    elif status.get('phase') in ['training_requested','preflight','training']:
        page+='<div class="card"><b>한국어 티처 모델 학습 진행 중</b><p>'+str(status.get('teacher_steps_completed',0))+'/25회 업데이트 확인. 학습·가중치 저장·음성 생성이 끝나면 같은 대사의 두 결과를 들을 수 있습니다.</p></div>'
    page+='<div class="reference"><div><b>공통 참조 · 실제 007번 목소리</b><small>'+esc(manifest['reference_text'])+'</small></div>'+audio(Path('reference.wav'))+'</div>'+header
    page+='<div class="bar"><label>공통 재생 음량 <input id="volume" type="range" min="0" max="1" step="0.05" value="0.75"></label><button id="blind">A/B 이름 가리고 듣기</button><span class="note">준비된 음성 '+str(complete)+' / '+str(len(arms)*len(manifest['requests']))+'</span></div>'
    page+=''.join(cards)+'<footer>권리 확보된 007번 녹음 · 모든 사전 지정 생성 결과 공개 · Built with Fish Audio<br><a href="RESULTS.md">실험 조건과 결과</a> · <a href="manifest.json">대사·생성 조건</a></footer></main><script>let hidden=false;const audio=[...document.querySelectorAll("audio")];audio.forEach(a=>{a.volume=.75;a.addEventListener("play",()=>audio.filter(b=>b!==a).forEach(b=>b.pause()))});document.getElementById("volume").oninput=e=>audio.forEach(a=>a.volume=+e.target.value);document.getElementById("blind").onclick=e=>{hidden=!hidden;document.querySelectorAll("h3[data-real]").forEach(h=>h.textContent=hidden?h.dataset.blind:h.dataset.real);e.target.textContent=hidden?"모델 이름 보기":"A/B 이름 가리고 듣기"}</script></html>'
    (root/'compare.html').write_text(page);print('Listening board:',complete,'/',len(arms)*len(manifest['requests']))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('folder');build(parser.parse_args().folder)
