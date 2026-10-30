"""녹음 파일의 소음 바닥·발성 비율을 잰다. 사용: python profile_audio.py 파일..."""
import sys
import librosa
import numpy as np

for path in sys.argv[1:]:
    y, sr = librosa.load(path, sr=16000, mono=True)
    rms = librosa.feature.rms(y=y, frame_length=640, hop_length=320)[0]
    db = 20 * np.log10(rms + 1e-9)
    p10, p50, p90 = np.percentile(db, [10, 50, 90])
    voiced = (db > p10 + 12).mean()
    print(f"{path.split('/')[-1][:40]:40s} {len(y)/sr/60:5.1f}min  floor(p10)={p10:6.1f}dB median={p50:6.1f} p90={p90:6.1f}  active>{p10+12:.0f}dB={voiced*100:4.0f}%")
