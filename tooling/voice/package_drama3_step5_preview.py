"""Local, unprocessed audio comparison for a saved step5 model and cached controls."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import numpy as np
import soundfile as sf


def measure(path):
    y, sr = sf.read(path, dtype='float32')
    if y.ndim != 1 or not len(y) or not np.isfinite(y).all():
        raise ValueError('Invalid generated audio: ' + str(path))
    frame = round(sr * .02)
    blocks = y[:len(y)//frame*frame].reshape(-1, frame)
    db = 20*np.log10(np.sqrt(np.mean(blocks**2, axis=1)) + 1e-10)
    active = db > np.percentile(db, 95)-30
    return {'seconds':len(y)/sr, 'sample_rate':sr, 'peak':float(np.abs(y).max()),
        'active_rms_median_dbfs':float(np.median(db[active])),
        'relative_pause_ratio':float(1-active.mean()),
        'energy_p90_p10_db':float(np.percentile(db[active],90)-np.percentile(db[active],10))}


def build(root):
    root = Path(root)
    manifest = json.loads((root/'manifest.json').read_text())
    digest = hashlib.sha256(json.dumps(manifest,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    reports = {arm:json.loads((root/arm/'report.json').read_text()) for arm in ['original','korean_teacher']}
    rows = []
    for arm, report in reports.items():
        if report['status'] != 'complete' or report['manifest_sha256'] != digest:
            raise ValueError('Incomplete or unmatched generation report')
        expected = {(r['id'],r['seed']) for r in manifest['requests']}
        if {(r['id'],r['seed']) for r in report['items']} != expected:
            raise ValueError('Missing predeclared takes')
        for item in report['items']:
            file = root/arm/item['file']
            if hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('Audio hash mismatch')
            request = next(r for r in manifest['requests'] if (r['id'],r['seed']) == (item['id'],item['seed']))
            for key in ['text','tagged_text','max_new_tokens']:
                if item[key] != request[key]:
                    raise ValueError('Changed generation conditions')
            rows.append({'arm':arm,'id':item['id'],'seed':item['seed'],'file':str(file.relative_to(root)),
                         'truncated':item['truncated'],**measure(file)})
    if hashlib.sha256((root/'reference.wav').read_bytes()).hexdigest() != manifest['reference_sha256']:
        raise ValueError('Changed reference recording')
    lookup = {(r['arm'],r['id'],r['seed']):r for r in rows}
    (root/'audio_measurements.json').write_text(json.dumps({'items':rows,'same_manifest_sha256':digest,
        'naturalness_score':None,'human_preference_evaluated':False,
        'notes':['No time, pitch, gain, pause or loudness postprocessing.','Duration and energy are descriptive measurements, not quality scores.',
                 'Relative pause threshold is each file P95 RMS minus30dB; whisper is threshold-sensitive.']},indent=2))
    esc = html.escape
    def player(path):
        return '<audio controls preload="metadata" src="'+esc(path,quote=True)+'"></audio>'
    labels = {'original':'기존 Drama 3', 'korean_teacher':'Miro · 한국어 티처 Full FT · 5회'}
    order = {'acting':0,'whisper':1,'long':2,'heldout':3}
    requests = sorted(enumerate(manifest['requests']),key=lambda p:(order[p[1]['group']],p[0]))
    cards = []
    for _, request in requests:
        filename = request['id']+'_s'+str(request['seed'])+'.wav'
        takes = ''
        for arm, blind in [('original','A'),('korean_teacher','B')]:
            item = lookup[arm,request['id'],request['seed']]
            takes += '<div class="take"><h3 data-real="'+esc(labels[arm],quote=True)+'" data-blind="'+blind+'">'+esc(labels[arm])+'</h3>'+player(arm+'/'+filename)
            takes += '<p class="small">'+f"{item['seconds']:.2f}초"+(' · <b>생성 길이 한도 도달</b>' if item['truncated'] else '')+'</p></div>'
        human = ''
        if request.get('source_clip_id'):
            human = '<div class="human"><span>실제 007번 녹음</span>'+player('real_recordings/'+request['source_clip_id']+'.wav')+'</div>'
        cards.append('<section id="'+esc(request['id'])+'_'+str(request['seed'])+'"><div class="row"><h2>'+esc(request['label'])+'</h2><span class="small">시드 '+str(request['seed'])+'</span></div><p class="line">'+esc(request['text'])+'</p>'+
            ('<p class="scene">'+esc(request['scene'])+'</p>' if request.get('scene') else '')+
            '<div class="takes">'+takes+'</div>'+human+'</section>')
    original_bad = sum(x['truncated'] for x in rows if x['arm']=='original')
    trained_bad = sum(x['truncated'] for x in rows if x['arm']=='korean_teacher')
    page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>007번 · 기존 Drama 3와 Miro 5회 비교</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#222539;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}main{max-width:1120px;margin:auto;padding:38px 24px 80px}h1{font-size:32px;letter-spacing:-1px;line-height:1.3}h2{font-size:20px;margin:0}h3{font-size:14px;margin:0 0 10px}.intro,.small,.scene{color:#687083}.small,.scene{font-size:13px}.badges{display:flex;gap:8px;flex-wrap:wrap}.badges span{background:#e9e5f5;color:#594278;padding:5px 12px;border-radius:18px;font-size:13px}.bar{position:sticky;top:0;z-index:2;background:#f5f5f7f5;padding:14px 0;border-bottom:1px solid #dedee6;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.bar button{cursor:pointer;background:white;border:1px solid #c8cada;border-radius:8px;padding:9px 14px;color:#34374e}section{margin-top:18px;padding:24px;background:white;border:1px solid #e1e2e9;border-radius:14px;scroll-margin-top:90px}.row{display:flex;align-items:center;justify-content:space-between;gap:16px}.line{font-size:18px}.takes{display:grid;grid-template-columns:1fr 1fr;gap:18px}.take{background:#f6f7fa;padding:17px;border-radius:10px}audio{width:100%;height:42px}.reference{background:#eae6f4;margin:25px 0;padding:20px;border-radius:12px}.reference audio{max-width:500px}.human{border-top:1px solid #e8e9ed;margin-top:18px;padding-top:16px;color:#73788b;font-size:13px;display:flex;gap:20px;align-items:center}.human audio{max-width:460px}a{color:#654893}.links{display:flex;gap:18px;flex-wrap:wrap;margin:16px 0}.note{font-size:13px;color:#72798c}footer{margin-top:32px;color:#84899b;font-size:12px}@media(max-width:720px){main{padding:24px 15px 60px}h1{font-size:26px}.takes{grid-template-columns:1fr}section{padding:19px}.human{display:block}}</style>
<main><p class="small">MIRO VOICE / 007</p><h1>기존 Drama 3와<br>저장된 Miro 5회 모델을 들어보세요.</h1><p class="intro">같은 007번 참조 음성·대사·감정 지시·생성 시드로 비교했습니다. 기존 음성은 그대로 재사용했고, 저장된 5회 가중치로만 새 음성을 만들었습니다.</p><div class="badges"><span>5 / 25회 업데이트 중간 모델</span><span>추가 학습 0회</span><span>같은 조건 16쌍 · 32개 음성</span><span>속도·강약 후처리 없음</span></div><p class="note">여기서 5회는 전체 데이터 5바퀴가 아니라 옵티마이저 업데이트 5번입니다. 한국어 티처 없이 학습한 대조 모델이 없으므로, 차이가 있다면 Full FT 전체의 변화이며 티처만의 효과로 구분할 수는 없습니다.</p>
<nav class="links"><a href="#comfort_1234">위로</a><a href="#contained_anger_1234">억눌린 분노</a><a href="#relief_1234">안도</a><a href="#whisper_1234">속삭임</a><a href="#long_comfort_1234">긴 대사</a><a href="#heldout_D-A3-A-007-0244_1234">실제 녹음과 비교</a></nav>'''
    page += '<div class="reference"><b>공통 참조 · 실제 007번</b><p class="small">'+esc(manifest['reference_text'])+'</p>'+player('reference.wav')+'</div>'
    page += '<p class="note">생성 길이 한도에 도달한 결과: 기존 '+str(original_bad)+'/16 · 5회 모델 '+str(trained_bad)+'/16. 해당 결과도 제외하지 않고 표시했습니다. 길이 변화 자체는 품질 점수가 아닙니다.</p>'
    page += '<div class="bar"><button id="blind">A/B 이름 가리고 듣기</button><label class="small">공통 음량 <input id="volume" type="range" min="0" max="1" step=".05" value=".75"></label><span class="small">음성 32 / 32개 준비 완료</span></div>'
    page += ''.join(cards)+'''<footer>권리 확보된 007번 녹음 · 실제 35.9B BF16 모델 · 모든 사전 지정 결과 공개 · Built with Fish Audio<br><a href="RESULTS.txt">실험 결과·비용</a> · <a href="manifest.json">생성 조건</a></footer></main><script>let hidden=false;const players=[...document.querySelectorAll('audio')];for(const a of players){a.volume=.75;a.addEventListener('play',()=>players.filter(b=>b!==a).forEach(b=>b.pause()))}document.querySelector('#volume').oninput=e=>players.forEach(a=>a.volume=+e.target.value);document.querySelector('#blind').onclick=e=>{hidden=!hidden;document.querySelectorAll('h3[data-real]').forEach(h=>h.textContent=hidden?h.dataset.blind:h.dataset.real);e.target.textContent=hidden?'모델 이름 보기':'A/B 이름 가리고 듣기'}</script></html>'''
    (root/'compare.html').write_text(page)
    print(json.dumps({'pairs':len(manifest['requests']),'truncated_original':original_bad,'truncated_step5':trained_bad}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('folder');build(parser.parse_args().folder)
