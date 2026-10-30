"""
억양 분리 실험(10/22) — 같은 문장의 원본 녹음 vs 생성본을 피치·길이·에너지로 비교해 "무엇이 사라졌는지"를 숫자로 본다.
  ~/.miro/voice-venv/bin/python prosody_compare.py <폴더>   폴더 안: <id>_orig.wav, <id>_gsv.wav, <id>_qwen.wav ...
지표(원본에 가까울수록 좋음):
  f0_range  피치 폭(반음, 유성 구간 5~95%)       — 높낮이가 평평해졌는지
  f0_std    피치 흔들림(반음 표준편차)
  f0_corr   원본과 피치 곡선 상관(MFCC DTW 정렬 후) — 억양 모양이 같은지
  dur       말한 길이(앞뒤 무음 제외, 초)          — 속도
  pause     문장 안 쉼 비율
  e_range   에너지 폭(dB, 5~95%)                   — 강세·감정의 세기
"""
import glob
import os
import sys

import librosa
import numpy as np

SR = 16000


def feats(path):
    y, _ = librosa.load(path, sr=SR)
    y, _ = librosa.effects.trim(y, top_db=35)
    f0, vo, _ = librosa.pyin(y, fmin=70, fmax=600, sr=SR, frame_length=1024, hop_length=160)
    st = 12 * np.log2(f0[vo] / 100.0) if vo.any() else np.array([0.0])
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=160)[0]
    db = 20 * np.log10(rms + 1e-6)
    loud = db > db.max() - 35
    mfcc = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, hop_length=160)
    return dict(y=y, f0=f0, vo=vo, mfcc=mfcc,
                f0_range=float(np.percentile(st, 95) - np.percentile(st, 5)), f0_std=float(st.std()),
                dur=len(y) / SR, pause=float(1 - loud.mean()),
                e_range=float(np.percentile(db[loud], 95) - np.percentile(db[loud], 5)) if loud.any() else 0.0)


def f0_corr(a, b):
    """MFCC DTW 로 시간 정렬한 뒤, 양쪽 다 유성인 프레임의 반음 곡선 상관"""
    _, wp = librosa.sequence.dtw(X=a["mfcc"], Y=b["mfcc"], metric="cosine")
    i, j = wp[::-1, 0], wp[::-1, 1]
    i, j = np.minimum(i, len(a["f0"]) - 1), np.minimum(j, len(b["f0"]) - 1)
    m = a["vo"][i] & b["vo"][j]
    if m.sum() < 10: return float("nan")
    x, z = np.log2(a["f0"][i][m]), np.log2(b["f0"][j][m])
    return float(np.corrcoef(x, z)[0, 1])


def main(folder):
    keys = ["f0_range", "f0_std", "f0_corr", "dur", "pause", "e_range"]
    rows = {}
    for o in sorted(glob.glob(os.path.join(folder, "*_orig.wav"))):
        sid = os.path.basename(o)[:-9]; fo = feats(o)
        rows.setdefault("orig", []).append({**{k: fo[k] for k in keys if k != "f0_corr"}, "f0_corr": 1.0})
        for g in sorted(glob.glob(os.path.join(folder, f"{sid}_*.wav"))):
            name = os.path.basename(g)[len(sid) + 1:-4]
            if name == "orig": continue
            fg = feats(g)
            rows.setdefault(name, []).append({**{k: fg[k] for k in keys if k != "f0_corr"}, "f0_corr": f0_corr(fo, fg)})
    print(f"{'':10}" + "".join(f"{k:>10}" for k in keys) + "   (n)")
    for name, rs in rows.items():
        print(f"{name:10}" + "".join(f"{np.nanmean([r[k] for r in rs]):10.2f}" for k in keys) + f"   ({len(rs)})")


if __name__ == "__main__":
    main(sys.argv[1])
