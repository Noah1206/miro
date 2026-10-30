"""신음 녹음 → 클립·화자 군집·받아쓰기 초안. 비용 없음, 로컬 전용.

사용: GPT-SoVITS/venv/bin/python -I prepare_moan_dataset.py -o 출력폴더 파일...
결과: wavs/*.wav(원본 표본 그대로, 모노 44.1k), clips.json, label.html(듣고 확정하는 화면)
자동 결과는 전부 초안이다. 화자·종류·글자는 사람이 듣고 확정한 것만 학습에 쓴다.
"""
import argparse, hashlib, html, json
from pathlib import Path
import librosa, numpy as np, soundfile as sf

SR = 44100
ACTIVE_DB = 12      # 파일별 소음 바닥(p10)보다 이만큼 크면 소리 있음
MERGE_GAP = 0.5     # 이보다 짧은 쉼은 한 클립으로 묶음
MIN_LEN, MAX_LEN, PAD = 0.6, 12.0, 0.15


def segments(y):
    hop = int(SR * 0.02)
    db = 20 * np.log10(librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0] + 1e-9)
    active = db > np.percentile(db, 10) + ACTIVE_DB
    edges = np.flatnonzero(np.diff(np.r_[0, active.astype(np.int8), 0]))
    runs = [[a * hop / SR, b * hop / SR] for a, b in zip(edges[::2], edges[1::2])]
    merged = []
    for s, e in runs:
        if merged and s - merged[-1][1] < MERGE_GAP: merged[-1][1] = e
        else: merged.append([s, e])
    out = []
    for s, e in merged:
        # ponytail: 긴 구간은 같은 길이로 자름. 경계가 소리 중간에 걸리면 사람이 확인 단계에서 버린다.
        n = int(np.ceil((e - s) / MAX_LEN))
        step = (e - s) / n
        out += [(s + i * step, s + (i + 1) * step) for i in range(n) if step >= MIN_LEN]
    dur = len(y) / SR
    return [(max(0, s - PAD), min(dur, e + PAD)) for s, e in out]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('files', nargs='*'); ap.add_argument('-o', required=True)
    ap.add_argument('--whisper', default='small')
    ap.add_argument('--stage', choices=['prep', 'asr', 'finish'], default='prep')
    ap.add_argument('--shard', default='0/1', help='asr 단계에서 i/n — 여러 프로세스로 나눠 돌림')
    a = ap.parse_args(); root = Path(a.o); (root / 'wavs').mkdir(parents=True, exist_ok=True)
    if a.stage == 'asr': return asr(root, a.whisper, *map(int, a.shard.split('/')))
    if a.stage == 'finish': return finish(root)

    clips = []
    for fi, path in enumerate(a.files):
        y, _ = librosa.load(path, sr=SR, mono=True)
        for i, (s, e) in enumerate(segments(y)):
            cid = f"src{fi:02d}_{i:04d}"
            wav = root / 'wavs' / f"{cid}.wav"
            sf.write(wav, y[int(s * SR):int(e * SR)], SR, subtype='PCM_16')
            clips.append({'clip_id': cid, 'source': Path(path).name, 'recording_id': f"src{fi:02d}",
                          'start': round(s, 2), 'end': round(e, 2), 'duration': round(e - s, 2),
                          'audio': f"wavs/{cid}.wav", 'sha256': hashlib.sha256(wav.read_bytes()).hexdigest()})
        print('segmented', Path(path).name, sum(c['recording_id'] == f"src{fi:02d}" for c in clips), flush=True)

    from resemblyzer import VoiceEncoder, preprocess_wav
    from sklearn.cluster import KMeans
    enc = VoiceEncoder('cpu')
    emb = np.stack([enc.embed_utterance(preprocess_wav(root / c['audio'])) for c in clips])
    km = KMeans(2, n_init=10, random_state=0).fit(emb)
    dist = km.transform(emb)
    for c, lab, d in zip(clips, km.labels_, dist):
        c['speaker_draft'] = 'AB'[lab]
        c['speaker_margin'] = round(float(abs(d[0] - d[1])), 3)  # 작을수록 애매함
    print('clustered', {k: int((km.labels_ == i).sum()) for i, k in enumerate('AB')}, flush=True)
    (root / 'clips.json').write_text(json.dumps(clips, ensure_ascii=False, indent=1))


def asr(root, model_name, shard, shards):
    import whisper
    clips = json.loads((root / 'clips.json').read_text())[shard::shards]
    model = whisper.load_model(model_name)
    for n, c in enumerate(clips):
        r = model.transcribe(str(root / c['audio']), language='ko', fp16=False, condition_on_previous_text=False,
                             temperature=0.0, compression_ratio_threshold=None, logprob_threshold=None)  # 신음에서 재시도 루프 방지
        seg = r['segments']
        c['asr_text'] = r['text'].strip()
        c['asr_no_speech'] = round(max((s['no_speech_prob'] for s in seg), default=1.0), 2)
        c['asr_logprob'] = round(min((s['avg_logprob'] for s in seg), default=-9.0), 2)
        c['speech_draft'] = bool(c['asr_text']) and c['asr_no_speech'] < .5 and c['asr_logprob'] > -1.0
        if n % 25 == 0: print('asr', shard, n, '/', len(clips), flush=True)
    (root / f'asr_{shard}.json').write_text(json.dumps(clips, ensure_ascii=False, indent=1))
    print('asr_done', shard, flush=True)


def finish(root):
    done = {c['clip_id']: c for p in root.glob('asr_*.json') for c in json.loads(p.read_text())}
    clips = json.loads((root / 'clips.json').read_text())
    missing = [c['clip_id'] for c in clips if c['clip_id'] not in done]
    if missing: raise SystemExit(f'받아쓰기 안 된 클립 {len(missing)}개: {missing[:5]}')
    clips = [done[c['clip_id']] for c in clips]
    (root / 'clips.json').write_text(json.dumps(clips, ensure_ascii=False, indent=1))
    write_label_page(root, clips)
    total = sum(c['duration'] for c in clips) / 60
    print(f"done {len(clips)} clips, {total:.1f} min, speech_draft={sum(c['speech_draft'] for c in clips)}")


KINDS = ['moan_low', 'moan_mid', 'moan_high', 'breath', 'mixed', 'speech', 'discard']


def write_label_page(root, clips):
    rows = []
    for c in clips:
        opts = ''.join(f'<option{" selected" if k == ("mixed" if c["speech_draft"] else "moan_mid") else ""}>{k}</option>' for k in KINDS)
        rows.append(f'''<tr data-id="{c['clip_id']}"><td>{c['clip_id']}<br><small>{c['duration']}s · margin {c['speaker_margin']}</small></td>
<td><audio controls preload="none" src="{c['audio']}"></audio></td>
<td><select class=spk><option{" selected" if c['speaker_draft']=='A' else ""}>A</option><option{" selected" if c['speaker_draft']=='B' else ""}>B</option></select></td>
<td><select class=kind>{opts}</select></td>
<td><input class=text value="{html.escape(c['asr_text'] if c['speech_draft'] else '')}" placeholder="대사가 있으면 들리는 그대로, 신음 자리는 [moan]"></td></tr>''')
    (root / 'label.html').write_text(f'''<!doctype html><meta charset=utf-8><title>신음 라벨</title>
<style>body{{font:14px sans-serif;margin:16px}}td{{padding:4px;border-bottom:1px solid #ddd}}input{{width:360px}}tr.done{{background:#eef8ee}}</style>
<p>화자(A/B)·종류·대사를 듣고 고친 뒤 <button onclick=save()>labels.json 저장</button> — 파일을 이 폴더에 넣어 주세요. 체크한 행만 확정으로 저장됩니다.</p>
<table>{''.join(rows)}</table>
<script>
document.querySelectorAll('tr[data-id]').forEach(r=>{{const b=document.createElement('input');b.type='checkbox';b.onchange=()=>r.classList.toggle('done',b.checked);const td=document.createElement('td');td.append(b);r.prepend(td)}});
function save(){{const out=[...document.querySelectorAll('tr[data-id]')].filter(r=>r.querySelector('input[type=checkbox]').checked).map(r=>({{clip_id:r.dataset.id,speaker:r.querySelector('.spk').value,kind:r.querySelector('.kind').value,text:r.querySelector('.text').value.trim(),verified:true}}));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{{type:'application/json'}}));a.download='labels.json';a.click()}}
</script>''')


if __name__ == '__main__':
    main()
