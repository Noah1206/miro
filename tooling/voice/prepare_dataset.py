"""
유튜브 원본 오디오 → 정제된 GPT-SoVITS 학습 데이터셋. (10/21, Modal GPU 에서 돌리는 것이 기본 — modal_train.py prepare)
참고: GPT-SoVITS 공식 흐름(UVR5 → 슬라이서 → 전사 → 교정), michsethowusu/yt-tts-dataset(화자 단일화 → VAD 3~15초 → 비음성 점수 → ASR 교차 검증 → 말속도 필터).

  python prepare_dataset.py <원본 폴더> <출력 폴더> <이름>
  환경: GSV_ROOT(/gsv), MIRO_ASR_MODEL(large-v3), MIRO_MAX_CLIPS(200), MIRO_DEVICE(cuda|cpu)
  출력: <출력 폴더>/Miro_Dataset_Output/<이름>_NNN.wav(32k 모노 16bit, -20 LUFS), raw_manhwa_voice.list, report.json(남긴 수·버린 이유별 수)

단계와 버리는 기준:
  1 demucs htdemucs 로 보컬만(배경음악·효과음 제거) — 반주가 보컬보다 20dB 이상 작으면(음악 없음) 원본 사용: 분리 흔적이 11kHz 삐 소리로 남음
  2 GPT-SoVITS 슬라이서(RMS -40dB, 4~10초, 앞뒤 무음 0.5초까지) — 10초 넘는 덩어리는 더 잘게, 그래도 12초 넘으면 버림
  3 음량 -20 LUFS 정규화(피크 제한), 32kHz 모노
  4 faster-whisper 전사(한국어 고정, beam 5) — 말 아님(no_speech>0.5)·낮은 확신(avg_logprob<-1.0)·반복(compression>2.4)·한글 2자 미만·말속도 이상(초당 1.5~12자 밖)은 버림
  5 화자 임베딩(resemblyzer) — 전체 중심과 코사인 0.72 미만(다른 사람·잡음)은 버림, 조각 15개 미만이면 건너뜀
  6 확신 높은 순으로 MIRO_MAX_CLIPS 개만(학습 시간 상한)
숨소리·신음 조각은 글자가 없어 4단계에서 빠진다 — 옛 파이프라인의 "[(놀람)]" 라벨은 학습에 도움이 안 됐다.
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
report = {"dropped": {}, "steps": []}


def drop(reason):
    report["dropped"][reason] = report["dropped"].get(reason, 0) + 1


def step(msg):
    print(f"PREP {msg}", flush=True); report["steps"].append(msg)


def separate_vocals(src, work):
    """demucs 보컬 스템. 실패하면 원본을 그대로 쓴다(음악 없는 영상이면 손해 없음)."""
    out = os.path.join(work, "demucs")
    r = subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-d", DEVICE, "-o", out, src], capture_output=True, text=True)
    hits = glob.glob(os.path.join(out, "htdemucs", "*", "vocals.wav"))
    if r.returncode != 0 or not hits:
        step(f"demucs 실패 → 원본 사용: {r.stderr.strip()[-200:]}"); return src
    # 음악 없는 영상(ASMR·낭독)에 분리를 쓰면 11kHz 근처에 삐 소리 흔적이 남는다(10/21 남자 6 실측) → 걷어낸 반주가 보컬보다 20dB 이상 작으면 원본을 쓴다
    v, _ = sf.read(hits[0]); n, _ = sf.read(hits[0].replace("vocals.wav", "no_vocals.wav"))
    ratio_db = 10 * np.log10((np.mean(n ** 2) + 1e-12) / (np.mean(v ** 2) + 1e-12))
    report["accompaniment_db"] = round(float(ratio_db), 1)
    if ratio_db < -20:
        step(f"반주 {ratio_db:.0f}dB — 음악 없음, 보컬 분리 안 함(원본 사용)"); return src
    step(f"반주 {ratio_db:.0f}dB — 음악 있음, 보컬 분리 사용"); return hits[0]


def load_mono(path):
    import librosa
    y, _ = librosa.load(path, sr=SR, mono=True)
    return y.astype(np.float32)


def slice_audio(y):
    sys.path.insert(0, os.path.join(GSV, "tools"))
    from slicer2 import Slicer
    coarse = Slicer(sr=SR, threshold=-40, min_length=4000, min_interval=300, hop_size=20, max_sil_kept=500)
    fine = Slicer(sr=SR, threshold=-35, min_length=3000, min_interval=100, hop_size=20, max_sil_kept=300)
    out = []
    for c, *_ in coarse.slice(y):  # slicer2 는 (조각, 시작, 끝) 을 돌려준다
        pieces = [c] if len(c) <= 10 * SR else [f for f, *_ in fine.slice(c)]
        for p in pieces:
            if len(p) < 2 * SR: drop("too_short"); continue
            if len(p) > 12 * SR: drop("too_long"); continue
            out.append(p)
    return out


def normalize(y):
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    try:
        loud = meter.integrated_loudness(y)
        if np.isfinite(loud): y = pyln.normalize.loudness(y, loud, -20.0)
    except ValueError:
        pass
    peak = np.abs(y).max()
    return (y / peak * 0.98 if peak > 0.98 else y).astype(np.float32)


def transcribe_all(paths):
    from faster_whisper import WhisperModel
    model = WhisperModel(ASR_MODEL, device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
    out = {}
    for p in paths:
        segs, _ = model.transcribe(p, language="ko", beam_size=5, vad_filter=False, condition_on_previous_text=False)
        segs = list(segs)
        if not segs: drop("no_speech"); continue
        text = re.sub(r"\s+", " ", " ".join(s.text for s in segs)).strip()
        logprob = min(s.avg_logprob for s in segs); nospeech = max(s.no_speech_prob for s in segs); comp = max(s.compression_ratio for s in segs)
        hangul = len(re.findall(r"[가-힣]", text))
        dur = sf.info(p).duration
        if nospeech > 0.5: drop("no_speech"); continue
        if logprob < -1.0: drop("low_confidence"); continue
        if comp > 2.4: drop("repetitive"); continue
        if hangul < 2 or re.search(r"[♪♫]", text): drop("no_hangul"); continue
        cps = len(text) / dur
        if not 1.5 <= cps <= 12: drop("speaking_rate"); continue
        out[p] = {"text": text, "logprob": float(logprob)}
    return out


def speaker_filter(items):
    if len(items) < 15: step("화자 필터 건너뜀(조각 15개 미만)"); return items
    from resemblyzer import VoiceEncoder, preprocess_wav
    enc = VoiceEncoder(device=DEVICE, verbose=False)
    paths = list(items)
    embs = np.stack([enc.embed_utterance(preprocess_wav(p)) for p in paths])
    keep = np.ones(len(paths), bool)
    for thr in (0.68, 0.72):  # 중심을 두 번 다시 잡는다: 처음엔 타인이 섞인 중심이라 느슨하게
        c = embs[keep].mean(0); c /= np.linalg.norm(c)
        sims = embs @ c
        keep = sims >= thr
    for p, k in zip(paths, keep):
        if not k: drop("other_speaker"); items.pop(p)
    return items


def main(raw_dir, out_dir, name):
    work = os.path.join(out_dir, "_work"); wav_dir = os.path.join(out_dir, "Miro_Dataset_Output")
    os.makedirs(work, exist_ok=True); os.makedirs(wav_dir, exist_ok=True)
    sources = sorted(f for f in os.listdir(raw_dir) if f.lower().endswith((".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus", ".webm")))
    if not sources: raise SystemExit("원본 오디오가 없습니다")
    idx = 0; paths = []
    for f in sources:
        step(f"보컬 분리: {f}")
        voc = separate_vocals(os.path.join(raw_dir, f), work)
        chunks = slice_audio(load_mono(voc))
        step(f"슬라이스 {len(chunks)}개: {f}")
        for c in chunks:
            p = os.path.join(wav_dir, f"{name}_{idx:03d}.wav"); idx += 1
            sf.write(p, normalize(c), SR, subtype="PCM_16"); paths.append(p)
    step(f"전사 시작({ASR_MODEL}, {DEVICE}): {len(paths)}개")
    items = transcribe_all(paths)
    step(f"전사 통과 {len(items)}개")
    items = speaker_filter(items)
    step(f"화자 필터 통과 {len(items)}개")
    ranked = sorted(items.items(), key=lambda kv: -kv[1]["logprob"])
    for p, _ in ranked[MAX_CLIPS:]: drop("cap"); items.pop(p)
    for p in paths:
        if p not in items: os.remove(p)
    lines = [f"{p}|{name}|KO|{v['text']}" for p, v in sorted(items.items())]
    with open(os.path.join(out_dir, "raw_manhwa_voice.list"), "w", encoding="utf8") as fh: fh.write("\n".join(lines) + "\n")
    report.update(kept=len(lines), total_sec=round(sum(sf.info(p).duration for p in items), 1),
                  examples=[v["text"] for _, v in ranked[:5]])
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf8") as fh: json.dump(report, fh, ensure_ascii=False, indent=1)
    print(f"PREP DONE kept={report['kept']} sec={report['total_sec']} dropped={report['dropped']}", flush=True)
    if len(lines) < 10: raise SystemExit(f"쓸 수 있는 조각이 {len(lines)}개뿐입니다(최소 10)")


if __name__ == "__main__":
    main(*sys.argv[1:4])
