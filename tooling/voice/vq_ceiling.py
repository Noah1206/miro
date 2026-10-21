"""
VQ 천장 시험(10/21): 학습 조각을 시멘틱 토큰(cnhubert → VQ 1024개, 25Hz)으로 바꿨다가 SoVITS 로 바로 복원한다.
GPT(억양 모델)가 완벽하게 토큰을 맞혀도 이 복원음보다 좋아질 수는 없다 — 토크나이저가 버린 정보의 크기를 잰다.
  cd ~/GPT-SoVITS && ./venv/bin/python ~/Desktop/Miro/tooling/voice/vq_ceiling.py <목소리 폴더> <데이터셋 폴더(list 있는 곳)> [조각 수]
출력: output/vq_ceiling/<이름>_{orig,resynth}.wav, 화면에 받아쓰기 오류율(CER)·화자 유사도·코드북 사용률
"""
import os, re, sys
import numpy as np
import soundfile as sf
import torch

voice_dir, ds_dir = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 6
sys.path[:0] = [os.getcwd(), os.path.join(os.getcwd(), "GPT_SoVITS")]
from TTS_infer_pack.TTS import TTS, TTS_Config

cfg = TTS_Config("GPT_SoVITS/configs/tts_infer.yaml")
cfg.device = "cpu"; cfg.is_half = False
tts = TTS(cfg)
tts.init_vits_weights(os.path.join(voice_dir, "sovits.pth"))
vq = tts.vits_model

lines = [l.split("|") for l in open(os.path.join(ds_dir, "raw_manhwa_voice.list"), encoding="utf8").read().splitlines() if l.count("|") == 3]
lines = [(os.path.join(ds_dir, "Miro_Dataset_Output", os.path.basename(w)), t) for w, *_, t in lines]
out = os.path.join("output", "vq_ceiling"); os.makedirs(out, exist_ok=True)


def codes_of(path):
    import librosa
    y, _ = librosa.load(path, sr=16000, mono=True)
    with torch.no_grad():
        h = tts.cnhuhbert_model.model(torch.from_numpy(y).unsqueeze(0))["last_hidden_state"].transpose(1, 2)
        return vq.extract_latent(h)  # (1, 1, T) 25Hz


# 1) 코드북 사용률: 전체 조각의 토큰 분포
allc = []
for w, _ in lines:
    try: allc.append(codes_of(w)[0, 0].numpy())
    except Exception: pass
allc = np.concatenate(allc); cnt = np.bincount(allc, minlength=1024); p = cnt[cnt > 0] / cnt.sum()
print(f"CODEBOOK used={int((cnt > 0).sum())}/1024 perplexity={float(np.exp(-(p * np.log(p)).sum())):.0f} tokens={len(allc)}")

# 2) 복원: 3~10초 한글 조각 N 개
import whisper
from resemblyzer import VoiceEncoder, preprocess_wav
asr = whisper.load_model("small"); enc = VoiceEncoder(verbose=False)
picked = [(w, t) for w, t in lines if 3 <= sf.info(w).duration <= 10 and len(re.findall(r"[가-힣]", t)) >= 6][:N]


def cer(a, b):
    a, b = re.sub(r"[^가-힣]", "", a), re.sub(r"[^가-힣]", "", b)
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[-1] / max(1, len(a))


rows = []
for k, (w, text) in enumerate(picked):
    codes = codes_of(w)
    phones, _, _ = tts.text_preprocessor.segment_and_extract_feature_for_text(text, "ko", tts.configs.version)
    spec = tts._get_ref_spec(w)
    spec = spec[0] if isinstance(spec, tuple) else spec  # (스펙트럼, 16k 오디오) 중 스펙트럼
    with torch.no_grad():
        audio = vq.decode(codes, torch.LongTensor(phones).unsqueeze(0), [spec])[0, 0].numpy()
    name = os.path.splitext(os.path.basename(w))[0]
    ro, rr = os.path.join(out, f"{name}_orig.wav"), os.path.join(out, f"{name}_resynth.wav")
    y, sr = sf.read(w); sf.write(ro, y, sr); sf.write(rr, audio, 32000)
    t_o = asr.transcribe(ro, language="ko")["text"]; t_r = asr.transcribe(rr, language="ko")["text"]
    sim = float(np.dot(enc.embed_utterance(preprocess_wav(ro)), enc.embed_utterance(preprocess_wav(rr))))
    rows.append((cer(text, t_o), cer(text, t_r), sim))
    print(f"CLIP {name} cer_orig={rows[-1][0]:.2f} cer_resynth={rows[-1][1]:.2f} spk_sim={sim:.2f} | {text[:40]}")
r = np.array(rows)
print(f"MEAN cer_orig={r[:,0].mean():.2f} cer_resynth={r[:,1].mean():.2f} spk_sim={r[:,2].mean():.2f}")
