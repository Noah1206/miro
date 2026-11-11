"""방 단위 목소리 기억 실험(11/11 밤) — 턴마다 처음부터 새로 시작하지 않고, 앞에서 말한 소리를 이어 받으면 목소리·감정이 턴 사이에 이어지나.
사용자 구상: 최근 몇 턴만이 아니라, 지난 턴을 자동으로 잘라(줄 단위) 쓸 만한 조각만 골라 참조한다 — 고르는 일은 유저가 입력하는 동안 뒤에서.
모델 입력 자리: build_drama3_prompt(history=[(글, 코드[칸, 프레임])]) — 견본 뒤에 "앞 대사 → 그 소리"가 대화처럼 들어간다(지금 운영은 안 씀).
같은 방의 턴을 순서대로, 세 가지로 만든다(지시 없음 = 지금 운영):
  indep = 턴마다 새로 시작(지금 운영) / prev1 = 바로 앞 턴 전체를 이어 받기
  mem   = 기억: 지난 턴들을 줄 단위로 자른 조각 가운데 실제 녹음과 가장 닮은 2개 + 바로 앞 턴의 마지막 줄(감정 잇기) — 이상하게 나온 조각은 기억에 안 들어간다
잣대: 실제 녹음 중심과의 유사도, 턴끼리 유사도, 이웃 턴의 음높이 차이, 빠르기·세기, 받아쓰기 오류. 운영 서버는 건드리지 않는다.
  modal run tooling/voice/modal_drama3_session_memory.py --turns <turns.json> --voice 92cb… --speaker 백리연화 --real output/voice-reflen/92cb9367/refs
  → output/voice-memory/{indep,prev1,mem}/<n>.wav + report.json
"""
import json
from pathlib import Path
import modal
from modal_drama3_serve import voices, user_voices, USER_VOICES, WEIGHTS, VOICES, SAMPLING, frame_limit, split_points
from modal_drama3_compare import image as base_image

app = modal.App('miro-drama3-session-memory')
image = (base_image.env({'FISH_DRAMA3_FP8_EXPERTS': '0'}).pip_install('fastapi[standard]')
         .add_local_python_source('drama3_fullft', 'modal_drama3_compare', 'modal_drama3_serve'))
KEEP = 2   # 기억에 두는 조각 수(바로 앞 턴의 마지막 줄은 따로)


@app.function(image=image, gpu='H200', cpu=8, memory=131072, timeout=3600, retries=0, volumes={'/voices': voices, USER_VOICES: user_voices})
def run(turns: list, voice: str, real: list):
    import io, os, re, zlib, numpy as np, soundfile as sf, torch, librosa
    from fish_speech.models.text2semantic.inference import init_model, load_codec_model, encode_audio, decode_to_audio
    from fish_speech.models.text2semantic.fish_omni.generate import build_drama3_prompt, generate_drama3
    from drama3_fullft.native_inference import native_checkpoint_routing
    from drama3_fullft.sampling_profiles import sampling_profile
    from transformers import AutoFeatureExtractor, WavLMForXVector
    weights = Path(WEIGHTS)
    with native_checkpoint_routing(weights): model, _ = init_model(weights, 'cuda:0', torch.bfloat16, compile=False)
    model.eval(); codec = load_codec_model(weights / 'codec.pth', 'cuda:0', torch.bfloat16).eval()
    fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache')
    sv = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv', cache_dir='/voices/_drama3/hf-cache').cuda().eval()
    rate = codec.sample_rate
    home = f'{VOICES}/{voice}' if os.path.isfile(f'{VOICES}/{voice}/ref.wav') else f'{USER_VOICES}/{voice}'
    ref_text, ref_codes = open(f'{home}/ref.txt', encoding='utf-8').read().strip(), encode_audio(f'{home}/ref.wav', codec, 'cuda:0').cpu().long()
    def emb(a16):
        with torch.inference_mode(): e = sv(**{k: x.cuda() for k, x in fe(a16, sampling_rate=16000, return_tensors='pt').items()}).embeddings[0]
        return torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    to16 = lambda w, sr: librosa.resample(np.asarray(w, dtype=np.float32), orig_sr=sr, target_sr=16000)
    def load16(b):
        a, sr = sf.read(io.BytesIO(b)); return to16(a.mean(1) if a.ndim > 1 else a, sr)
    R = np.stack([emb(load16(b)) for b in real]); center = R.mean(0); center /= np.linalg.norm(center)

    hangul = lambda t: re.sub('[^가-힣]', '', t)
    def healthy(text, wave):
        """11/11 1차에서 본 고장 두 가지를 거른다: 거의 무음(71초짜리 침묵)과 대사를 건너뛴 생성(글자/초가 비정상적으로 빠름)."""
        a = librosa.effects.trim(to16(wave, rate), top_db=35)[0]; secs = max(.1, len(a) / 16000)
        return float(np.sqrt(np.mean(a ** 2))) >= .03 and 2.3 <= len(hangul(text)) / secs <= 7.5
    def gen(text, history):
        """고장이면 씨앗을 바꿔 다시(최대 3번). (코드, 소리, 끝 표시, 프롬프트 줄 수, 시도 횟수, 합격 여부)"""
        for k in range(3):
            torch.manual_seed(zlib.crc32(voice.encode()) + k)   # k=0 이 운영과 같은 씨앗
            with torch.inference_mode():
                prompt = build_drama3_prompt('<|speaker:0|>' + text, model.tokenizer, model.config, ['<|speaker:0|>' + ref_text], [ref_codes],
                                             history=[('<|speaker:0|>' + t, c) for t, c in history])
                frames, finish = generate_drama3(model, prompt, max_new_tokens=frame_limit(text), **sampling_profile(SAMPLING))
                wave = decode_to_audio(frames[:, 1:].T.contiguous().to('cuda:0'), codec).float().cpu().numpy().squeeze()
            if healthy(text, wave): return frames[:, 1:].T.contiguous().cpu().long(), wave, finish, len(prompt), k + 1, True
        return frames[:, 1:].T.contiguous().cpu().long(), wave, finish, len(prompt), 3, False

    gen('안녕하세요, 오늘은 날씨가 참 좋네요.', [])   # 첫 생성은 버린다
    wavs, items, plan = {}, [], [' '.join(p['text'] for p in s['parts']) for s in turns]
    # 2차(11/11): 줄 단위로 자른 조각은 글과 소리가 어긋나 대사를 건너뛰게 만들었다 → 기억에는 턴 통째로, 검사에 합격한 턴만 넣는다.
    #   indep = 턴마다 새로 시작 / prev1 = 합격한 바로 앞 턴 / mem = 그보다 앞의 합격 턴 중 실제 녹음과 가장 닮은 1개 + 합격한 바로 앞 턴
    for var in ('indep', 'prev1', 'mem'):
        good = []   # 합격한 지난 턴들 (글, 코드, 실제 녹음과 유사도)
        for n, text in enumerate(plan, 1):
            if var == 'indep' or not good: history = []
            elif var == 'prev1': history = [good[-1][:2]]
            else: history = ([max(good[:-1], key=lambda g: g[2])[:2]] if len(good) > 1 else []) + [good[-1][:2]]
            codes, wave, finish, rows, tries, ok = gen(text, history)
            if ok: good.append((text, codes, float(emb(to16(wave, rate)) @ center)))
            f = f'{var}/{n}.wav'; buf = io.BytesIO(); sf.write(buf, np.clip(wave, -1, 1), rate, format='WAV', subtype='PCM_16'); wavs[f] = buf.getvalue()
            items.append({'file': f, 'var': var, 'turn': n, 'spoken': text, 'finish': finish, 'prompt_rows': rows, 'tries': tries, 'ok': ok, 'history': [t[:20] for t, _ in history], '_w': wave})
            print('done', f, finish, rows, len(history), 'tries', tries, ok, flush=True)
    del model; torch.cuda.empty_cache()

    from faster_whisper import WhisperModel
    asr = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16', download_root='/voices/_drama3/asr')
    def cer(want, hyp):
        ga, gb = hangul(want), hangul(hyp); d = list(range(len(gb) + 1))
        for x, ca in enumerate(ga, 1):
            prev, d[0] = d[0], x
            for y, cb in enumerate(gb, 1): prev, d[y] = d[y], min(d[y] + 1, d[y - 1] + 1, prev + (ca != cb))
        return d[-1] / max(1, len(ga))
    E = {}
    for it in items:
        a = to16(it.pop('_w'), rate); E[it['file']] = e = emb(a)
        voiced = librosa.effects.trim(a, top_db=35)[0]; secs = max(.1, len(voiced) / 16000)
        f0 = librosa.pyin(voiced, fmin=70, fmax=600, sr=16000)[0]; f0 = f0[np.isfinite(f0)]
        it.update(sim=round(float(e @ center), 4), seconds=round(secs, 1), chars_per_s=round(len(hangul(it['spoken'])) / secs, 2),
                  f0_median=round(float(np.median(f0)), 1) if len(f0) else None, rms=round(float(np.sqrt(np.mean(voiced ** 2))), 4),
                  cer=round(cer(it['spoken'], ''.join(s.text for s in asr.transcribe(a, language='ko', beam_size=5)[0])), 3))
    summary = {}
    for var in ('indep', 'prev1', 'mem'):
        rows = [r for r in items if r['var'] == var]; M = np.stack([E[r['file']] for r in rows]); pair = (M @ M.T)[np.triu_indices(len(M), 1)]
        f0s = [r['f0_median'] or 0 for r in rows]
        summary[var] = {'sim_mean': round(float(np.mean([r['sim'] for r in rows])), 4), 'sim_min': float(min(r['sim'] for r in rows)), 'sim_last': rows[-1]['sim'],
                        'turn_pair_mean': round(float(pair.mean()), 4), 'turn_pair_min': round(float(pair.min()), 4),
                        'neighbor_sim_mean': round(float(np.mean([M[k] @ M[k + 1] for k in range(len(M) - 1)])), 4),
                        'f0_per_turn': f0s, 'f0_jump_mean': round(float(np.mean(np.abs(np.diff(f0s)))), 1),
                        'speed_per_turn': [r['chars_per_s'] for r in rows], 'cer': round(float(np.mean([r['cer'] for r in rows])), 3),
                        'not_eos': sum(r['finish'] != 'eos' for r in rows), 'retries': sum(r['tries'] - 1 for r in rows), 'failed': sum(not r['ok'] for r in rows), 'prompt_rows_max': max(r['prompt_rows'] for r in rows)}
    print('SUMMARY', json.dumps(summary, ensure_ascii=False), flush=True)
    return {'summary': summary, 'items': items}, wavs


@app.local_entrypoint()
def main(turns: str, voice: str, speaker: str, real: str):
    root = Path(__file__).parents[2]
    data = json.loads(Path(turns).expanduser().read_text())
    # 이 목소리의 묶음만, 한 턴에 여러 묶음이면 이어 붙인다(여러 인물 턴)
    mine = [{'parts': [p for s in t['segments'] if (s.get('speaker') or speaker) == speaker for p in s['parts']]} for t in data]
    report, wavs = run.remote([m for m in mine if m['parts']], voice, [p.read_bytes() for p in sorted((root / real).glob('r75-*.wav'))])
    out = root / 'output/voice-memory'
    for f, b in wavs.items(): (out / f).parent.mkdir(parents=True, exist_ok=True); (out / f).write_bytes(b)
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps(report['summary'], ensure_ascii=False, indent=1))
