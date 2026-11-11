"""운영 턴 다시 만들기(11/11) — 앱에서 "턴마다 다른 목소리"로 들린 방의 실제 턴을 운영과 같은 방식으로 합성해 어디서 갈리는지 본다.
입력 = 운영 코드 spokenSegments 가 만든 턴별 묶음(JSON, 대화 내용이라 저장소 밖에 둔다): [{at, segments:[{text, speech?, speaker?, delivery, parts}]}]
운영과 같게: 한 턴 통째 합성 · 감정 지시는 바뀌는 줄 앞에(turn_text) · 목소리마다 같은 씨앗 · 여러 인물 턴은 인물별로 만들어 조용한 곳에서 잘라 순서대로.
변형: now = 운영 그대로 / none = 지시 없이. 잣대: 실제 녹음 중심과의 유사도(턴 전체·3초 창 최저), 턴끼리 유사도, 음높이·빠르기·세기, 받아쓰기 오류.
  modal run tooling/voice/modal_drama3_turn_replay.py --turns <turns.json> --voices '{"백리연화":"92cb…","백리설":"a520…"}' --real output/voice-reflen/92cb9367/refs --main 백리연화
  → output/voice-replay/{now,none}/<n>.wav + report.json
"""
import json
from pathlib import Path
import modal
from modal_drama3_serve import voices, user_voices, USER_VOICES, WEIGHTS, VOICES, SAMPLING, turn_text, frame_limit, split_points, trim_tail
from modal_drama3_compare import image as base_image

app = modal.App('miro-drama3-turn-replay')
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'}).pip_install('fastapi[standard]')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare', 'modal_drama3_serve'))


@app.function(image=image, gpu='H200', cpu=8, memory=131072, timeout=3600, retries=0, volumes={'/voices': voices, USER_VOICES: user_voices})
def run(turns: list, voice_of: dict, real: list, main_speaker: str):
    import io, os, re, zlib, numpy as np, soundfile as sf, torch, librosa
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, encode_audio, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.sampling_profiles import sampling_profile
    weights = Path(WEIGHTS)
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
    model.eval(); codec = load_codec_model(weights / 'codec.pth', 'cuda:0', torch.bfloat16).eval()
    rate, refs = codec.sample_rate, {}
    def ref(v):
        if v not in refs:
            home = f'{VOICES}/{v}' if os.path.isfile(f'{VOICES}/{v}/ref.wav') else f'{USER_VOICES}/{v}'
            refs[v] = (open(f'{home}/ref.txt', encoding='utf-8').read().strip(), encode_audio(f'{home}/ref.wav', codec, 'cuda:0').cpu().long())
        return refs[v]
    def gen(voice, prompt_text, plain):
        ref_text, codes = ref(voice)
        torch.manual_seed(zlib.crc32(voice.encode()))
        with torch.inference_mode():
            prompt = build_drama3_prompt('<|speaker:0|>' + prompt_text, model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
            frames, finish = generate_drama3(model, prompt, max_new_tokens=frame_limit(plain), **sampling_profile(SAMPLING))
            return decode_to_audio(frames[:, 1:].T.contiguous().to('cuda:0'), codec).float().cpu().numpy().squeeze(), finish
    wavs, items = {}, []
    for n, turn in enumerate(turns, 1):
        lines = [{'text': s.get('speech') or s['text'], 'voice': voice_of[s.get('speaker') or main_speaker], 'delivery': s['delivery'], 'parts': s['parts'], 'speaker': s.get('speaker') or main_speaker} for s in turn['segments']]
        groups = {}
        for i, l in enumerate(lines): groups.setdefault(l['voice'], []).append(i)
        for var in ('now', 'none'):
            text_of = (lambda ls: turn_text(ls)) if var == 'now' else (lambda ls: ' '.join(l['text'] for l in ls))
            pieces, finishes = {}, []
            for voice, idx in groups.items():
                plain = ' '.join(lines[i]['text'] for i in idx)
                wave, finish = gen(voice, text_of([lines[i] for i in idx]), plain); finishes.append(finish)
                if len(groups) == 1: pieces[idx[0]] = wave; break
                wave = trim_tail(wave, rate); cuts = [0, *split_points(wave, [len(lines[i]['text']) for i in idx], rate), len(wave)]
                for k, i in enumerate(idx): pieces[i] = trim_tail(wave[cuts[k] : cuts[k + 1]], rate)
            order = sorted(pieces); parts = []
            for k, i in enumerate(order):
                parts.append(pieces[i])
                if k < len(order) - 1: parts.append(np.zeros(int(rate * min(1.5, max(0.0, float(lines[i]['delivery'].get('pauseAfterMs', 300)) / 1000))), dtype='float32'))
            f = f'{var}/{n}.wav'; buf = io.BytesIO(); sf.write(buf, np.clip(np.concatenate(parts), -1, 1), rate, format='WAV', subtype='PCM_16'); wavs[f] = buf.getvalue()
            # 재는 건 주인공 목소리 조각만(여러 인물 턴은 주인공 조각을 이어 붙여)
            mine = np.concatenate([pieces[i] for i in order if lines[i]['speaker'] == main_speaker] or [np.zeros(1, 'float32')])
            items.append({'file': f, 'turn': n, 'at': turn['at'], 'var': var, 'voices': len(groups), 'finish': finishes, 'prompt': text_of([lines[i] for i in groups[voice_of[main_speaker]]]) if voice_of[main_speaker] in groups else '',
                          'spoken': ' '.join(lines[i]['text'] for i in order if lines[i]['speaker'] == main_speaker), '_mine': mine})
            print('done', f, finishes, flush=True)
    del model; torch.cuda.empty_cache()

    from faster_whisper import WhisperModel
    from transformers import AutoFeatureExtractor, WavLMForXVector
    fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache')
    sv = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache').cuda().eval()
    asr = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16', download_root='/voices/_drama3/asr')
    def emb(a):
        with torch.inference_mode(): e = sv(**{k: x.cuda() for k, x in fe(a, sampling_rate=16000, return_tensors='pt').items()}).embeddings[0]
        return torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    def load16(b):
        a, sr = sf.read(io.BytesIO(b)); a = a.mean(1) if a.ndim > 1 else a
        return librosa.resample(a.astype(np.float32), orig_sr=sr, target_sr=16000)
    hangul = lambda t: re.sub('[^가-힣]', '', t)
    def cer(want, hyp):
        ga, gb = hangul(want), hangul(hyp); d = list(range(len(gb) + 1))
        for x, ca in enumerate(ga, 1):
            prev, d[0] = d[0], x
            for y, cb in enumerate(gb, 1): prev, d[y] = d[y], min(d[y] + 1, d[y - 1] + 1, prev + (ca != cb))
        return d[-1] / max(1, len(ga))
    R = np.stack([emb(load16(b)) for b in real]); center = R.mean(0); center /= np.linalg.norm(center)
    E = {}
    for it in items:
        a = librosa.resample(it.pop('_mine'), orig_sr=rate, target_sr=16000); E[it['file']] = e = emb(a)
        voiced = librosa.effects.trim(a, top_db=35)[0]; secs = max(.1, len(voiced) / 16000)
        f0 = librosa.pyin(voiced, fmin=70, fmax=600, sr=16000)[0]; f0 = f0[np.isfinite(f0)]
        win = [float(emb(a[s : s + 48000]) @ center) for s in range(0, max(1, len(a) - 32000), 32000)]   # 3초 창, 2초씩
        it.update(sim=round(float(e @ center), 4), win_min=round(min(win), 4), win_first=round(win[0], 4), win_last=round(win[-1], 4), seconds=round(secs, 1),
                  chars_per_s=round(len(hangul(it['spoken'])) / secs, 2), f0_median=round(float(np.median(f0)), 1) if len(f0) else None,
                  f0_range_st=round(float(12 * np.log2(np.percentile(f0, 95) / np.percentile(f0, 5))), 2) if len(f0) > 5 else None,
                  rms=round(float(np.sqrt(np.mean(voiced ** 2))), 4), cer=round(cer(it['spoken'], ''.join(s.text for s in asr.transcribe(a, language='ko', beam_size=5)[0])), 3))
    summary = {}
    for var in ('now', 'none'):
        rows = [r for r in items if r['var'] == var]; M = np.stack([E[r['file']] for r in rows]); pair = (M @ M.T)[np.triu_indices(len(M), 1)]
        cv = lambda k: round(float(np.std([r[k] for r in rows if r[k]]) / np.mean([r[k] for r in rows if r[k]])), 3)
        summary[var] = {'sim_mean': round(float(np.mean([r['sim'] for r in rows])), 4), 'sim_min': float(min(r['sim'] for r in rows)), 'win_min': float(min(r['win_min'] for r in rows)),
                        'turn_pair_mean': round(float(pair.mean()), 4), 'turn_pair_min': round(float(pair.min()), 4),
                        'f0_spread': cv('f0_median'), 'speed_spread': cv('chars_per_s'), 'rms_spread': cv('rms'), 'cer': round(float(np.mean([r['cer'] for r in rows])), 3)}
    print('SUMMARY', json.dumps(summary, ensure_ascii=False), flush=True)
    for r in items: print('ITEM', json.dumps({k: r[k] for k in ['file', 'sim', 'win_min', 'win_first', 'win_last', 'seconds', 'chars_per_s', 'f0_median', 'rms', 'cer']}), flush=True)
    return {'summary': summary, 'real_pair_mean': round(float(np.mean((R @ R.T)[np.triu_indices(len(R), 1)])), 4), 'items': items}, wavs


@app.local_entrypoint()
def main(turns: str, voices: str, real: str, main: str):
    root = Path(__file__).parents[2]
    report, wavs = run.remote(json.loads(Path(turns).expanduser().read_text()), json.loads(voices), [p.read_bytes() for p in sorted((root / real).glob('r75-*.wav'))], main)
    out = root / 'output/voice-replay'
    for f, b in wavs.items(): (out / f).parent.mkdir(parents=True, exist_ok=True); (out / f).write_bytes(b)
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in report.items() if k != 'items'}, ensure_ascii=False, indent=1))
