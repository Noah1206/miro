"""신음 녹음을 무음 기준으로 클립으로 자른다. 사용: python3 split_moans.py 입력.mp3... -o 출력폴더"""
import argparse, re, subprocess
from pathlib import Path

NOISE_DB, MIN_SIL, PAD, MIN_LEN = "-25dB", 0.35, 0.15, 0.4

def segments(src):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", f"silencedetect=n={NOISE_DB}:d={MIN_SIL}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", log).groups()
    total = int(h) * 3600 + int(m) * 60 + float(s)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    cur, out = 0.0, []
    for s, e in zip(starts, ends):
        if s - cur >= MIN_LEN: out.append((cur, s))
        cur = e
    if total - cur >= MIN_LEN: out.append((cur, total))
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("files", nargs="+"); ap.add_argument("-o", required=True)
    a = ap.parse_args(); out = Path(a.o); out.mkdir(parents=True, exist_ok=True)
    rows = ["clip,source,start,end,dur,mean_db"]
    for f in a.files:
        stem = Path(f).stem[-8:]
        for i, (s, e) in enumerate(segments(f)):
            s, e = max(0, s - PAD), e + PAD
            name = f"{stem}_{i:03d}.wav"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", f, "-ss", str(s), "-to", str(e), "-ac", "1", "-ar", "44100", str(out / name)], check=True)
            vol = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(out / name), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
            m = re.search(r"mean_volume: (-?[\d.]+)", vol)
            rows.append(f"{name},{Path(f).name},{s:.2f},{e:.2f},{e-s:.2f},{m.group(1) if m else ''}")
    (out / "clips.csv").write_text("\n".join(rows) + "\n")
    print(len(rows) - 1, "clips ->", out)
