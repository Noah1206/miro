"""견본 길이 실험(11/11) — 학습 없이, 같은 목소리의 견본을 길게·여러 개 주면 턴마다 목소리가 더 고정되나.
원본 녹음(예: ~/Desktop/유라.mp3)을 정리(Demucs)·조각(8~25초)·받아쓰기한 뒤, 견본 묶음 4가지로 연속 턴 6줄(운영 지시 그대로)을 만든다.
  cur = 지금 운영 견본(약 30초) / r30·r75·r150 = 원본에서 고른 조각 누적 약 30·75·150초([Reference 1..n])
잣대: 견본에 안 쓴 실제 녹음 조각들의 평균 목소리(중심)와의 유사도, 6줄끼리 유사도, 받아쓰기 오류. 운영 서버는 건드리지 않는다. 약 20분·H200.
  modal run tooling/voice/modal_drama3_ref_length_probe.py --source ~/Desktop/유라.mp3 --voice 92cb9367…   → output/voice-reflen/<voice8>/
"""
import json
from pathlib import Path
import modal
from modal_drama3_serve import voices, user_voices, USER_VOICES, WEIGHTS, VOICES, SAMPLING
from modal_drama3_compare import image as base_image
from modal_drama3_delivery_probe import C_LINES, bracket

app = modal.App('miro-drama3-reflen-probe')
SETS, SEEDS, HOLDOUT = {'r75': 75, 'r150': 150}, 1, 5   # 11/11 첫 실행은 결과를 못 받아(로컬 numpy 없음) 줄여서 다시: r30 뺌·씨앗 1
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'}).pip_install('fastapi[standard]', 'demucs==4.0.1')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare', 'modal_drama3_serve', 'modal_drama3_delivery_probe', 'voice_clean'))


def chunks(wave, rate, lo=8.0, hi=25.0):
    """조용한 곳에서만 잘라 8~25초 조각으로 — (시작, 끝) 샘플."""
    import librosa
    out, start, end = [], None, None
    for a, b in librosa.effects.split(wave, top_db=35, frame_length=2048, hop_length=512):
        if start is None: start, end = a, b
        elif (b - start) / rate <= hi and (a - end) / rate < 1.0: end = b
        else:
            if (end - start) / rate >= lo: out.append((start, end))
            start, end = a, b
    if start is not None and (end - start) / rate >= lo: out.append((start, end))
    return out


@app.function(image=image, gpu='H200', cpu=8, memory=131072, timeout=3600, retries=0, volumes={'/voices': voices, USER_VOICES: user_voices})
def run(source: bytes, voice: str):
    import io, os, re, subprocess, tempfile, zlib, numpy as np, soundfile as sf, torch, librosa
    from faster_whisper import WhisperModel
    from voice_clean import separate_vocals
    hangul = lambda t: re.sub('[^가-힣]', '', t)
    tmp = tempfile.mkdtemp(); open(f'{tmp}/in', 'wb').write(source)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{tmp}/in', '-ac', '1', '-ar', '44100', f'{tmp}/in.wav'], check=True)
    raw, rate = sf.read(f'{tmp}/in.wav', dtype='float32')
    vocals, background_db, rate = separate_vocals(raw, rate, 'cuda'); torch.cuda.empty_cache()
    vocals = vocals / max(1e-6, float(np.abs(vocals).max())) * .95
    asr = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16', download_root='/voices/_drama3/asr')
    segs = []
    for a, b in chunks(vocals, rate):
        w = vocals[a:b]; found = list(asr.transcribe(librosa.resample(w, orig_sr=rate, target_sr=16000), language='ko', beam_size=5)[0])
        text = ' '.join(s.text.strip() for s in found).strip(); secs = (b - a) / rate
        logprob = float(np.mean([s.avg_logprob for s in found])) if found else -9
        # 보통 말 조각만: 받아쓰기 확신·글자 빠르기(신음·숨만 있는 조각은 글자가 거의 없다)
        segs.append({'start': round(a / rate, 1), 'seconds': round(secs, 1), 'text': text, 'logprob': round(logprob, 2), 'rate': round(len(hangul(text)) / secs, 2),
                     'ok': bool(logprob > -.6 and 2.5 <= len(hangul(text)) / secs <= 9), 'wave': w})
    good = sorted([s for s in segs if s['ok']], key=lambda s: -s['logprob'])
    info = {'background_db': round(background_db, 1), 'source_seconds': round(len(raw) / 44100, 1), 'segments': len(segs), 'usable_segments': len(good),
            'usable_seconds': round(sum(s['seconds'] for s in good), 1), 'segments_detail': [{k: v for k, v in s.items() if k != 'wave'} for s in segs]}
    if len(good) < HOLDOUT + 3: return {'error': 'not enough clean speech', **info}, {}
    # 견본에 안 쓰는 실제 조각(목소리 중심용)은 번갈아 뽑아 품질이 한쪽에 몰리지 않게
    hold, pool = good[1::max(2, len(good) // HOLDOUT)][:HOLDOUT], None
    pool = [s for s in good if all(s is not h for h in hold)]
    picks, acc = {}, 0
    for name, want in SETS.items():
        k = 0
        while k < len(pool) and sum(s['seconds'] for s in pool[: k + 1]) <= want + 8: k += 1
        picks[name] = pool[: max(1, k)]
    info['sets'] = {n: {'seconds': round(sum(s['seconds'] for s in p), 1), 'clips': len(p)} for n, p in picks.items()}
    print('INFO', json.dumps(info, ensure_ascii=False), flush=True)   # 결과를 못 받아도 로그에 남게

    del asr; torch.cuda.empty_cache()
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, encode_audio, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.sampling_profiles import sampling_profile
    weights = Path(WEIGHTS)
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
    model.eval(); codec = load_codec_model(weights / 'codec.pth', 'cuda:0', torch.bfloat16).eval()
    home = f'{VOICES}/{voice}' if os.path.isfile(f'{VOICES}/{voice}/ref.wav') else f'{USER_VOICES}/{voice}'
    def enc(w):
        p = f'{tmp}/seg.wav'; sf.write(p, w, rate, subtype='PCM_16'); return encode_audio(p, codec, 'cuda:0').cpu().long()
    refs = {'cur': ([open(f'{home}/ref.txt', encoding='utf-8').read().strip()], [encode_audio(f'{home}/ref.wav', codec, 'cuda:0').cpu().long()])}
    for name, p in picks.items(): refs[name] = ([s['text'] for s in p], [enc(s['wave']) for s in p])
    out_rate, wavs, items = codec.sample_rate, {}, []
    for name, (texts, codes) in refs.items():
        for n, (text, tags) in enumerate(C_LINES):
            for seed in range(SEEDS):
                torch.manual_seed(zlib.crc32(voice.encode()) + seed)
                try:
                    with torch.inference_mode():
                        prompt = build_drama3_prompt('<|speaker:0|>' + bracket(tags) + text, model.tokenizer, model.config, ['<|speaker:0|>' + t for t in texts], codes)
                        frames, finish = generate_drama3(model, prompt, max_new_tokens=768, **sampling_profile(SAMPLING))
                        wave = decode_to_audio(frames[:, 1:].T.contiguous().to('cuda:0'), codec).float().cpu().numpy().squeeze()
                except Exception as e:
                    print('failed', name, n, type(e).__name__, str(e)[:200], flush=True); info.setdefault('failed', []).append(f'{name}: {type(e).__name__} {str(e)[:120]}'); break
                f = f'{name}/{n + 1}-s{seed}.wav'; buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), out_rate, format='WAV', subtype='PCM_16'); wavs[f] = buf.getvalue()
                items.append({'file': f, 'set': name, 'line': n + 1, 'seed': seed, 'spoken': text, 'finish': finish, 'prompt_rows': len(prompt)})
                print('done', f, finish, len(prompt), flush=True)
    del model; torch.cuda.empty_cache()

    from transformers import AutoFeatureExtractor, WavLMForXVector
    fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache')
    sv = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache').cuda().eval()
    asr = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16', download_root='/voices/_drama3/asr')
    def emb(a):
        with torch.inference_mode(): e = sv(**{k: x.cuda() for k, x in fe(a, sampling_rate=16000, return_tensors='pt').items()}).embeddings[0]
        return torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    def load16(b):
        a, sr = sf.read(io.BytesIO(b)); return librosa.resample(a.astype(np.float32), orig_sr=sr, target_sr=16000)
    def cer(want, hyp):
        ga, gb = hangul(want), hangul(hyp); d = list(range(len(gb) + 1))
        for x, ca in enumerate(ga, 1):
            prev, d[0] = d[0], x
            for y, cb in enumerate(gb, 1): prev, d[y] = d[y], min(d[y] + 1, d[y - 1] + 1, prev + (ca != cb))
        return d[-1] / max(1, len(ga))
    H = np.stack([emb(librosa.resample(s['wave'], orig_sr=rate, target_sr=16000)) for s in hold])
    center = H.mean(0); center /= np.linalg.norm(center)
    info['real_to_center'] = round(float(np.mean(H @ center)), 4)   # 실제 녹음끼리는 이 정도(위쪽 한계의 참고값 — 중심에 자기 자신이 들어가 조금 높게 나온다)
    info['real_pair_mean'] = round(float(np.mean((H @ H.T)[np.triu_indices(len(H), 1)])), 4)
    E = {}
    for it in items:
        a = load16(wavs[it['file']]); E[it['file']] = e = emb(a)
        it['sim'] = round(float(e @ center), 4); it['cer'] = round(cer(it['spoken'], ''.join(s.text for s in asr.transcribe(a, language='ko', beam_size=5)[0])), 3)
    summary = {}
    for name in refs:
        rows = [r for r in items if r['set'] == name]
        if not rows: continue
        pair = []
        for seed in range(SEEDS):
            M = np.stack([E[r['file']] for r in rows if r['seed'] == seed])
            if len(M) > 1: pair += list((M @ M.T)[np.triu_indices(len(M), 1)])
        summary[name] = {'ref_seconds': info['sets'][name]['seconds'] if name in info['sets'] else None, 'prompt_rows': rows[0]['prompt_rows'],
                         'sim_mean': round(float(np.mean([r['sim'] for r in rows])), 4), 'sim_min': float(min(r['sim'] for r in rows)),
                         'pair_mean': round(float(np.mean(pair)), 4), 'pair_min': round(float(np.min(pair)), 4),
                         'cer': round(float(np.mean([r['cer'] for r in rows])), 3), 'not_eos': sum(r['finish'] != 'eos' for r in rows)}
    print('SUMMARY', json.dumps(summary, ensure_ascii=False), json.dumps({k: info[k] for k in ['real_to_center', 'real_pair_mean']}), flush=True)
    # 채택하면 바로 쓸 수 있게 고른 견본 조각도 돌려준다
    for name, p in picks.items():
        for k, s in enumerate(p):
            buf = io.BytesIO(); sf.write(buf, s['wave'], rate, format='WAV', subtype='PCM_16'); wavs[f'refs/{name}-{k + 1}.wav'] = buf.getvalue()
        info['sets'][name]['texts'] = [s['text'] for s in p]
    return {'summary': summary, **info, 'items': items}, wavs


@app.local_entrypoint()
def main(source: str, voice: str):
    report, wavs = run.remote(Path(source).expanduser().read_bytes(), voice)
    out = Path(__file__).parents[2] / 'output/voice-reflen' / voice[:8]
    for f, b in wavs.items(): (out / f).parent.mkdir(parents=True, exist_ok=True); (out / f).write_bytes(b)
    out.mkdir(parents=True, exist_ok=True); (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in report.items() if k not in ('items', 'segments_detail')}, ensure_ascii=False, indent=1))
