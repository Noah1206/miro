"""
유튜브 원본 오디오 → ASMR 용 GPT-SoVITS 학습 데이터셋. Modal GPU 에서 돌린다(modal_train.py).
원칙(10/21 사용자): 효과음(브러싱·귀 청소·두드림·바스락)이 겹친 조각은 버리고, 속삭임·숨소리·떨림은 살린다.
참고: GPT-SoVITS 공식 흐름(UVR5 → 슬라이서 → 전사), michsethowusu/yt-tts-dataset(PANNs 비음성 점수·말속도 필터).

  python prepare_dataset.py <원본 폴더> <출력 폴더> <이름>
  환경: GSV_ROOT(/gsv), MIRO_ASR_MODEL(large-v3), MIRO_MAX_CLIPS(200), MIRO_DEVICE(cuda|cpu)
  출력: Miro_Dataset_Output/<이름>_NNN.wav(32k 모노 16bit), raw_manhwa_voice.list, report.json, refs.json(말투별 참조 후보)

단계:
  1 demucs 보컬 분리 — 반주가 보컬보다 20dB 이상 작으면(음악 없음) 원본 사용. 분리 흔적이 11kHz 삐 소리로 남는다(남자 6)
  2 음량은 영상 전체에 한 번만 -23 LUFS — 조각마다 맞추면 속삭임이 보통 말 크기로 키워져 숨결이 평평해진다
  3 슬라이서: 1~12초, 앞뒤 무음 0.8초까지 남겨 들숨·날숨을 붙인다
  4 PANNs(AudioSet 527종)로 조각 소리 판별 — 말·속삭임·숨·한숨·웃음 외 소리(브러싱·두드림·물·음악·잡음…)가 0.2 넘으면 버림. 말투 태그(whisper/breath/normal)
  5 잡음 바닥: 조각 안 하위 10% 프레임과 상위 10% 의 차이가 12dB 미만이면 버림
  6 faster-whisper large-v3 — 보통 말은 엄격(no_speech 0.5·logprob -1.0), 속삭임은 완화(logprob -1.6), 글자 없는 숨은 숨 표시로 남김(전체의 10% 까지)
  7 화자 임베딩은 보통 말 조각에만(속삭임은 임베딩이 달라 다른 사람으로 오판된다)
  8 말투별 비율을 지키며 점수 높은 순으로 MIRO_MAX_CLIPS 개
"""
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

GSV = os.environ.get("GSV_ROOT", "/gsv")
SR = 32000
MAX_CLIPS = int(os.environ.get("MIRO_MAX_CLIPS", "200"))
ASR_MODEL = os.environ.get("MIRO_ASR_MODEL", "large-v3")
DEVICE = os.environ.get("MIRO_DEVICE") or ("cuda" if __import__("torch").cuda.is_available() else "cpu")
report = {"dropped": {}, "steps": [], "styles": {}}

# 목소리로 치는 AudioSet 소리(말·속삭임·숨·감정 소리) + 무해한 공간 태그. 나머지는 전부 '효과음·잡음'
VOICE = {"Speech", "Male speech, man speaking", "Female speech, woman speaking", "Child speech, kid speaking", "Conversation",
         "Narration, monologue", "Speech synthesizer", "Whispering", "Breathing", "Sigh", "Gasp", "Pant", "Laughter", "Chuckle, chortle",
         "Giggle", "Snicker", "Humming", "Groan", "Grunt", "Whimper", "Sniff", "Yawn", "Babbling",
         "Inside, small room", "Inside, large room or hall", "Silence"}
BREATHY = {"Breathing", "Sigh", "Gasp", "Pant", "Yawn", "Sniff"}
EFFECT_MAX = 0.2


def drop(reason):
    report["dropped"][reason] = report["dropped"].get(reason, 0) + 1


def step(msg):
    print(f"PREP {msg}", flush=True); report["steps"].append(msg)


def separate_vocals(src, work):
    out = os.path.join(work, "demucs")
    r = subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-d", DEVICE, "-o", out, src], capture_output=True, text=True)
    hits = glob.glob(os.path.join(out, "htdemucs", "*", "vocals.wav"))
    if r.returncode != 0 or not hits:
        step(f"demucs 실패 → 원본 사용: {r.stderr.strip()[-200:]}"); return src
    v, _ = sf.read(hits[0]); n, _ = sf.read(hits[0].replace("vocals.wav", "no_vocals.wav"))
    ratio_db = 10 * np.log10((np.mean(n ** 2) + 1e-12) / (np.mean(v ** 2) + 1e-12))
    report.setdefault("accompaniment_db", []).append(round(float(ratio_db), 1))
    if ratio_db < -20:
        step(f"반주 {ratio_db:.0f}dB — 음악 없음, 보컬 분리 안 함(원본 사용)"); return src
    step(f"반주 {ratio_db:.0f}dB — 음악 있음, 보컬 분리 사용"); return hits[0]


def load_normalized(path):
    """영상 전체를 한 번만 -23 LUFS 로. 조각 사이 크기 차이(속삭임 < 보통 말)는 그대로 남는다."""
    import librosa, pyloudnorm as pyln
    y, _ = librosa.load(path, sr=SR, mono=True)
    try:
        loud = pyln.Meter(SR).integrated_loudness(y)
        if np.isfinite(loud): y = pyln.normalize.loudness(y, loud, -23.0)
    except ValueError:
        pass
    peak = np.abs(y).max()
    return (y / peak * 0.98 if peak > 0.98 else y).astype(np.float32)


def slice_audio(y):
    sys.path.insert(0, os.path.join(GSV, "tools"))
    from slicer2 import Slicer
    coarse = Slicer(sr=SR, threshold=-45, min_length=3000, min_interval=400, hop_size=20, max_sil_kept=800)
    fine = Slicer(sr=SR, threshold=-38, min_length=2000, min_interval=200, hop_size=20, max_sil_kept=500)
    out = []
    for item in coarse.slice(y):
        c = item[0] if isinstance(item, (list, tuple)) else item  # slicer2 는 (조각, 시작, 끝), 짧은 입력이면 조각만
        pieces = [c] if len(c) <= 12 * SR else [(f[0] if isinstance(f, (list, tuple)) else f) for f in fine.slice(c)]
        for p in pieces:
            if len(p) < 1 * SR: drop("too_short"); continue
            if len(p) > 12 * SR: drop("too_long"); continue
            out.append(p)
    return out


def noise_floor_ok(y):
    hop = int(SR * 0.02)
    rms = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, "valid")[::hop] + 1e-12)
    lo, hi = np.percentile(rms, 10), np.percentile(rms, 90)
    return 20 * np.log10(hi / lo) >= 12


def classify(paths):
    """PANNs 로 조각마다 (효과음 최대 확률과 이름, 말투)."""
    import librosa
    from panns_inference import AudioTagging, labels
    at = AudioTagging(checkpoint_path=None, device=DEVICE)
    idx_voice = [i for i, l in enumerate(labels) if l in VOICE]
    missing = sorted(VOICE - set(labels))
    if missing: step(f"AudioSet 에 없는 라벨(무시): {missing}")
    other = np.ones(len(labels), bool); other[idx_voice] = False
    i_wh = labels.index("Whispering"); i_br = [labels.index(l) for l in BREATHY if l in labels]; i_sp = labels.index("Speech")
    out = {}
    for p in paths:
        y, _ = librosa.load(p, sr=32000, mono=True)
        prob, _ = at.inference(y[None, :])
        prob = prob[0]
        j = int(np.argmax(np.where(other, prob, -1)))
        style = "whisper" if prob[i_wh] >= 0.15 else "breath" if max(prob[i_br]) >= 0.3 and prob[i_sp] < 0.3 else "normal"
        out[p] = (float(prob[j]), labels[j], style)
    return out


def breath_text(sec):
    return "하아..." if sec > 2.5 else "흡..."


def transcribe(paths, tags):
    from faster_whisper import WhisperModel
    model = WhisperModel(ASR_MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
    out = {}
    for p in paths:
        style = tags[p][2]; dur = sf.info(p).duration
        segs = list(model.transcribe(p, language="ko", beam_size=5, vad_filter=False, condition_on_previous_text=False)[0])
        text = re.sub(r"\s+", " ", " ".join(s.text for s in segs)).strip() if segs else ""
        hangul = len(re.findall(r"[가-힣]", text))
        logprob = min((s.avg_logprob for s in segs), default=-9.0)
        nospeech = max((s.no_speech_prob for s in segs), default=1.0)
        comp = max((s.compression_ratio for s in segs), default=0.0)
        if hangul < 2 or re.search(r"[♪♫]", text):
            if style in ("breath", "whisper") and dur <= 6:  # 글자 없는 숨·한숨은 숨 표시로 남긴다
                out[p] = {"text": breath_text(dur), "score": -1.2, "style": "breath"}; continue
            drop("no_hangul"); continue
        if comp > 2.4: drop("repetitive"); continue
        if style == "normal":
            if nospeech > 0.5: drop("no_speech"); continue
            if logprob < -1.0: drop("low_confidence"); continue
        elif logprob < -1.6: drop("low_confidence_whisper"); continue
        cps = len(text) / dur
        if not 1.0 <= cps <= 14: drop("speaking_rate"); continue
        out[p] = {"text": text, "score": float(logprob), "style": "whisper" if style == "whisper" else "normal"}
    return out


def speaker_filter(items):
    normal = [p for p, v in items.items() if v["style"] == "normal"]
    if len(normal) < 15: step("화자 필터 건너뜀(보통 말 조각 15개 미만)"); return items
    from resemblyzer import VoiceEncoder, preprocess_wav
    enc = VoiceEncoder(device=DEVICE, verbose=False)
    embs = np.stack([enc.embed_utterance(preprocess_wav(p)) for p in normal])
    keep = np.ones(len(normal), bool)
    for thr in (0.68, 0.72):
        c = embs[keep].mean(0); c /= np.linalg.norm(c); keep = embs @ c >= thr
    for p, k in zip(normal, keep):
        if not k: drop("other_speaker"); items.pop(p)
    return items


def cap_by_style(items):
    """말투 비율을 지키며 점수 순으로 MAX_CLIPS 개. 숨은 10% 까지."""
    by = {}
    for p, v in items.items(): by.setdefault(v["style"], []).append((p, v))
    total = len(items)
    if total == 0: return items
    keep = set()
    for style, lst in by.items():
        share = round(MAX_CLIPS * len(lst) / total) if total > MAX_CLIPS else len(lst)
        if style == "breath": share = min(share, max(1, MAX_CLIPS // 10), len(lst))
        for p, _ in sorted(lst, key=lambda kv: -kv[1]["score"])[:share]: keep.add(p)
    for p in list(items):
        if p not in keep: drop("cap"); items.pop(p)
    return items


def pick_refs(items):
    """말투별 참조 후보: 3~10초, 한글 8자 이상, 점수 높은 것."""
    refs = {}
    for style in ("normal", "whisper"):
        c = [(p, v) for p, v in items.items() if v["style"] == style and 3 <= sf.info(p).duration <= 10 and len(re.findall(r"[가-힣]", v["text"])) >= 8]
        if c:
            p, v = max(c, key=lambda kv: kv[1]["score"]); refs[style] = {"file": os.path.basename(p), "text": v["text"]}
    return refs


def main(raw_dir, out_dir, name):
    work = os.path.join(out_dir, "_work"); wav_dir = os.path.join(out_dir, "Miro_Dataset_Output")
    os.makedirs(work, exist_ok=True); os.makedirs(wav_dir, exist_ok=True)
    sources = sorted(f for f in os.listdir(raw_dir) if f.lower().endswith((".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus", ".webm")))
    if not sources: raise SystemExit("원본 오디오가 없습니다")
    idx = 0; paths = []
    for f in sources:
        step(f"보컬 분리 판단: {f}")
        chunks = slice_audio(load_normalized(separate_vocals(os.path.join(raw_dir, f), work)))
        step(f"슬라이스 {len(chunks)}개: {f}")
        for c in chunks:
            if not noise_floor_ok(c): drop("noisy"); continue
            p = os.path.join(wav_dir, f"{name}_{idx:03d}.wav"); idx += 1
            sf.write(p, c, SR, subtype="PCM_16"); paths.append(p)
    step(f"소리 판별(PANNs): {len(paths)}개")
    tags = classify(paths)
    clean = []
    for p in paths:
        prob, label, _ = tags[p]
        if prob > EFFECT_MAX: drop(f"effect:{label}")
        else: clean.append(p)
    step(f"효과음 없는 조각 {len(clean)}개 → 전사({ASR_MODEL}, {DEVICE})")
    items = transcribe(clean, tags)
    step(f"전사 통과 {len(items)}개")
    items = cap_by_style(speaker_filter(items))
    for p in paths:
        if p not in items: os.remove(p)
    lines = [f"{p}|{name}|KO|{v['text']}" for p, v in sorted(items.items())]
    with open(os.path.join(out_dir, "raw_manhwa_voice.list"), "w", encoding="utf8") as fh: fh.write("\n".join(lines) + "\n")
    for v in items.values(): report["styles"][v["style"]] = report["styles"].get(v["style"], 0) + 1
    refs = pick_refs(items)
    with open(os.path.join(out_dir, "refs.json"), "w", encoding="utf8") as fh: json.dump(refs, fh, ensure_ascii=False, indent=1)
    report["dropped"] = dict(sorted(report["dropped"].items(), key=lambda kv: -kv[1]))
    report.update(kept=len(lines), total_sec=round(sum(sf.info(p).duration for p in items), 1), refs=refs)
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf8") as fh: json.dump(report, fh, ensure_ascii=False, indent=1)
    print(f"PREP DONE kept={report['kept']} sec={report['total_sec']} styles={report['styles']} dropped={report['dropped']}", flush=True)
    if len(lines) < 10: raise SystemExit(f"쓸 수 있는 조각이 {len(lines)}개뿐입니다(최소 10)")


if __name__ == "__main__":
    main(*sys.argv[1:4])
