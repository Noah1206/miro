"""지시(괄호 태그) 실험(11/11) — ① 놀람·다급함이 무엇으로 들리나 ② 말투·빠르기·세기 태그 조합이 목소리를 얼마나 바꾸나.
운영 가중치·견본·샘플링·씨앗 그대로, 운영 서버는 건드리지 않는다. 약 25분·H200(추정 $2).
  A(놀람): 대사 3 × 지시 7(없음 / 지금 운영 [anxious, fast speech, strong voice] / [surprised] / [shocked, fast speech] / [panicked] / 소리 글자만 / [surprised]+소리 글자) × 목소리 3
  B(조합): 같은 문장 × 운영에 실제로 많이 붙는 태그 조합 8 × 목소리 3
잣대: 화자 유사도(WavLM-SV), 감정 판별(emotion2vec+ — surprised·fearful 점수), 말 빠르기(글자/초), 음높이(중앙값·폭), 세기, 받아쓰기 오류.
  modal run tooling/voice/modal_drama3_delivery_probe.py   → output/voice-delivery/{A,B}/*.wav + report.json
"""
import json
from pathlib import Path
import modal
from modal_drama3_serve import voices, user_voices, USER_VOICES, WEIGHTS, VOICES, PREWARM_VOICES, SAMPLING
from modal_drama3_compare import image as base_image

app = modal.App('miro-drama3-delivery-probe')
VOICE_IDS = PREWARM_VOICES[:3]
STARTLE = {'grab': '뭐, 뭐 하는 거야 갑자기?', 'hide': '잠깐, 누가 와! 빨리 숨어!', 'who': '어? 언제부터 거기 있었어?'}
SOUND = {'grab': '앗! ', 'hide': '헉, ', 'who': '헉! '}   # 소리 글자(화면 대사엔 없고 음성에만)
A_TAGS = {'none': '', 'now': '[anxious, fast speech, strong voice] ', 'surprised': '[surprised] ', 'shocked': '[shocked, fast speech] ', 'panicked': '[panicked] '}
B_TEXT = '나 오늘 너 때문에 기분이 이상해.'
B_TAGS = {'none': '', 'firm': '[firm] ', 'playful': '[playful] ', 'gentle': '[gentle] ', 'whisper': '[whispering] ', 'slowsoft': '[slow speech, soft voice] ',
          'anx4': '[anxious, whispering, slow speech, soft voice] ', 'startle4': '[anxious, firm, fast speech, strong voice] '}
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'}).pip_install('fastapi[standard]', 'funasr>=1.2', 'modelscope')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare', 'modal_drama3_serve'))


# C(연속 턴): 서로 다른 대사 6줄을 한 턴씩 — now = 운영에 실제로 붙는 4축 조합, trained = 학습한 태그만·최대 2개, none = 지시 없음
TRAINED = ['happy', 'sad', 'curious', 'hurt', 'jealous', 'angry', 'anxious', 'whispering', 'playful', 'firm', 'fast speech']
C_LINES = [('왔어? 오늘은 좀 늦었네.', ['firm']), ('뭐, 뭐 하는 거야 갑자기?', ['anxious', 'firm', 'fast speech', 'strong voice']),
           ('아니야, 싫다는 건 아니고.', ['anxious', 'gentle', 'slow speech', 'soft voice']), ('그냥 좀 놀라서 그래. 바보.', ['playful']),
           ('조금만 더 이러고 있자.', ['whispering', 'slow speech', 'soft voice']), ('내일도 올 거지? 약속해.', ['happy', 'fast speech'])]
bracket = lambda tags: '[' + ', '.join(tags) + '] ' if tags else ''
def trained_only(tags):
    """학습한 태그만, 감정 하나 + 나머지 하나까지(firm 은 다른 것이 있으면 뺀다 — 가장 흔히 덧붙는 군더더기)."""
    keep = [t for t in tags if t in TRAINED]
    if len(keep) > 2: keep = [t for t in keep if t != 'firm']
    return keep[:2]

assert trained_only(['anxious', 'firm', 'fast speech', 'strong voice']) == ['anxious', 'fast speech'] and trained_only(['whispering', 'slow speech', 'soft voice']) == ['whispering']


def jobs(groups='AB'):
    out = []
    if 'C' in groups:
        for n, (text, tags) in enumerate(C_LINES):
            for name, t in [('now', tags), ('trained', trained_only(tags)), ('none', [])]: out.append((f'C/{name}-{n + 1}', bracket(t) + text, text))
    if 'A' not in groups: return out
    for key, text in STARTLE.items():
        for name, tag in A_TAGS.items(): out.append((f'A/{key}-{name}', tag + text, text))
        out.append((f'A/{key}-sound', SOUND[key] + text, SOUND[key] + text))
        out.append((f'A/{key}-surprised+sound', '[surprised] ' + SOUND[key] + text, SOUND[key] + text))
    for name, tag in B_TAGS.items(): out.append((f'B/{name}', tag + B_TEXT, B_TEXT))
    return out

assert len(jobs()) == 3 * 7 + 8


@app.function(image=image, gpu='H200', cpu=8, memory=131072, timeout=3600, retries=0, volumes={'/voices': voices, USER_VOICES: user_voices})
def run(groups='AB'):
    import io, os, re, zlib, numpy as np, soundfile as sf, torch, librosa
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, encode_audio, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.sampling_profiles import sampling_profile
    weights = Path(WEIGHTS)
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
    model.eval(); codec = load_codec_model(weights / 'codec.pth', 'cuda:0', torch.bfloat16).eval()
    home = {v: f'{VOICES}/{v}' if os.path.isfile(f'{VOICES}/{v}/ref.wav') else f'{USER_VOICES}/{v}' for v in VOICE_IDS}
    rate, wavs, items = codec.sample_rate, {}, []
    for v in VOICE_IDS:
        ref_text = open(f'{home[v]}/ref.txt', encoding='utf-8').read().strip(); codes = encode_audio(f'{home[v]}/ref.wav', codec, 'cuda:0').cpu().long()
        for name, prompt_text, spoken in jobs(groups):
            torch.manual_seed(zlib.crc32(v.encode()))   # 운영과 같은 씨앗
            with torch.inference_mode():
                prompt = build_drama3_prompt('<|speaker:0|>' + prompt_text, model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [codes])
                frames, finish = generate_drama3(model, prompt, max_new_tokens=768, **sampling_profile(SAMPLING))
                wave = decode_to_audio(frames[:, 1:].T.contiguous().to('cuda:0'), codec).float().cpu().numpy().squeeze() if len(frames) else np.zeros(1, 'float32')
            group, case = name.split('/'); f = f'{group}/{v[:8]}-{case}.wav'
            buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), rate, format='WAV', subtype='PCM_16'); wavs[f] = buf.getvalue()
            items.append({'file': f, 'group': group, 'case': case, 'voice': v[:8], 'prompt': prompt_text, 'spoken': spoken, 'finish': finish})
            print('done', f, finish, flush=True)
    del model; torch.cuda.empty_cache()

    from faster_whisper import WhisperModel
    from transformers import AutoFeatureExtractor, WavLMForXVector
    from funasr import AutoModel
    fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache')
    sv = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache').cuda().eval()
    asr = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16', download_root='/voices/_drama3/asr')
    e2v = AutoModel(model='emotion2vec/emotion2vec_plus_large', hub='hf', disable_update=True)
    def load16(src):
        a, sr = sf.read(src if isinstance(src, str) else io.BytesIO(src)); a = a.mean(1) if a.ndim > 1 else a
        return librosa.resample(a.astype(np.float32), orig_sr=sr, target_sr=16000)
    def emb(a):
        with torch.inference_mode(): e = sv(**{k: x.cuda() for k, x in fe(a, sampling_rate=16000, return_tensors='pt').items()}).embeddings[0]
        return torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    hangul = lambda t: re.sub('[^가-힣]', '', t)
    def cer(want, hyp):
        ga, gb = hangul(want), hangul(hyp); d = list(range(len(gb) + 1))
        for x, ca in enumerate(ga, 1):
            prev, d[0] = d[0], x
            for y, cb in enumerate(gb, 1): prev, d[y] = d[y], min(d[y] + 1, d[y - 1] + 1, prev + (ca != cb))
        return d[-1] / max(1, len(ga))
    ref = {v[:8]: emb(load16(f'{home[v]}/ref.wav')) for v in VOICE_IDS}
    E = {}
    for it in items:
        a = load16(wavs[it['file']]); E[it['file']] = e = emb(a)
        voiced = librosa.effects.trim(a, top_db=35)[0]; secs = max(.1, len(voiced) / 16000)
        f0 = librosa.pyin(voiced, fmin=70, fmax=600, sr=16000)[0]; f0 = f0[np.isfinite(f0)]
        r = e2v.generate(a, granularity='utterance', extract_embedding=False)[0]
        score = {l.split('/')[-1]: float(s) for l, s in zip(r['labels'], r['scores'])}
        hyp = ''.join(s.text for s in asr.transcribe(a, language='ko', beam_size=5)[0])
        it.update(sim=round(float(e @ ref[it['voice']]), 4), seconds=round(secs, 2), chars_per_s=round(len(hangul(it['spoken'])) / secs, 2),
                  f0_median=round(float(np.median(f0)), 1) if len(f0) else None,
                  f0_range_st=round(float(12 * np.log2(np.percentile(f0, 95) / np.percentile(f0, 5))), 2) if len(f0) > 5 else None,
                  rms=round(float(np.sqrt(np.mean(voiced ** 2))), 4), e2v=max(score, key=score.get),
                  startle=round(score.get('surprised', 0) + score.get('fearful', 0), 3), cer=round(cer(it['spoken'], hyp), 3))

    mean = lambda rows, k: round(float(np.mean([r[k] for r in rows if r[k] is not None])), 3)
    def table(group):
        out = {}
        for case in dict.fromkeys(r['case'].split('-', 1)[-1] if group == 'A' else r['case'] for r in items if r['group'] == group):
            rows = [r for r in items if r['group'] == group and (r['case'].split('-', 1)[-1] if group == 'A' else r['case']) == case]
            out[case] = {k: mean(rows, k) for k in ['sim', 'startle', 'chars_per_s', 'f0_median', 'f0_range_st', 'rms', 'cer']} | {'e2v': sorted(r['e2v'] for r in rows), 'not_eos': sum(r['finish'] != 'eos' for r in rows)}
        return out
    if 'C' in groups:   # 변형마다: 같은 목소리의 6줄끼리 유사도 + 줄 사이 출렁임(표준편차/평균)
        out = {}
        for var in ['now', 'trained', 'none']:
            rows = [r for r in items if r['case'].startswith(var + '-')]; pair = []
            for v in VOICE_IDS:
                M = np.stack([E[r['file']] for r in rows if r['voice'] == v[:8]]); pair += list((M @ M.T)[np.triu_indices(len(M), 1)])
            spread = lambda k: round(float(np.mean([np.std(x) / np.mean(x) for x in ([r[k] for r in rows if r['voice'] == v[:8] and r[k]] for v in VOICE_IDS)])), 3)
            out[var] = {'sim_mean': mean(rows, 'sim'), 'sim_min': min(r['sim'] for r in rows), 'pair_mean': round(float(np.mean(pair)), 4), 'pair_min': round(float(np.min(pair)), 4),
                        'rms_spread': spread('rms'), 'speed_spread': spread('chars_per_s'), 'f0_spread': spread('f0_median'), 'cer': mean(rows, 'cer')}
        return {'C': out, 'items': items}, wavs
    pair = []   # B: 같은 목소리에서 태그 조합끼리 유사도(조합이 바뀔 때 목소리가 얼마나 유지되나)
    for v in VOICE_IDS:
        M = np.stack([E[r['file']] for r in items if r['group'] == 'B' and r['voice'] == v[:8]]); pair += list((M @ M.T)[np.triu_indices(len(M), 1)])
    return {'A': table('A'), 'B': table('B'), 'B_pair_mean': round(float(np.mean(pair)), 4), 'B_pair_min': round(float(np.min(pair)), 4), 'items': items}, wavs


@app.local_entrypoint()
def main(groups: str = 'AB'):
    report, wavs = run.remote(groups)
    out = Path(__file__).parents[2] / 'output/voice-delivery'
    for f, b in wavs.items(): (out / f).parent.mkdir(parents=True, exist_ok=True); (out / f).write_bytes(b)
    (out / ('report.json' if groups == 'AB' else f'report-{groups}.json')).write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in report.items() if k != 'items'}, ensure_ascii=False, indent=1))
