"""
미로 보이스 데이터셋 공장 — 소스(유튜브 주소 또는 로컬 녹음) → 무음 기준 슬라이스 → Whisper 한국어 전사 → GPT-SoVITS .list

  실행:  ./venv/bin/python miro_pipeline_master.py
  입력:  아래 YOUTUBE_URLS 에 주소를 넣거나, Miro_Raw_Audio/ 폴더에 .wav/.mp3/.m4a 녹음을 넣는다(둘 다 가능).
  출력:  Miro_Dataset_Output/<캐릭터>_NNN.wav + raw_manhwa_voice.list (webui 의 '1A' 단계에 그대로 넣는 형식)

권리: 본인 녹음, 동의받은 성우, 라이선스가 있는 소스만. 남의 목소리를 허락 없이 복제해 서비스에 쓰면 인격권·퍼블리시티권 침해이고
      유튜브 약관 위반이다. 미로 official_voices 의 rights 칸에 그 근거를 남긴다.
"""
import os
import re
import sys

from pydub import AudioSegment
from pydub.silence import split_on_silence

# ── [유저 설정존] ─────────────────────────────────────────────────────────────
YOUTUBE_URLS = [
    "https://www.youtube.com/watch?v=JMi1-Rc9E8U",  # 체리쉬 오디오 드라마 - 날 놔주려 하지 않는 남친 (15분)
    "https://www.youtube.com/watch?v=PhcQsE5CyL8",  # 체리쉬 Audio Drama - 날 안 좋아하는 것 같은 남친 (6분)
    "https://www.youtube.com/watch?v=V2WGIoFcuM8",  # 체리쉬 오디오 드라마 - 내 스토커는 인기 가수 (6분)
]
# 워커(tooling/voice/worker.ts)는 파일을 고치지 않고 MIRO_YOUTUBE_URLS(쉼표 구분)로 주소를 넘긴다.
YOUTUBE_URLS = [u.strip() for u in os.environ.get("MIRO_YOUTUBE_URLS", "").split(",") if u.strip()] or YOUTUBE_URLS
CHARACTER_NAME = os.environ.get("MIRO_VOICE_NAME", "Miro_Adult_Hero")   # 캐릭터(화자) 이름 — 파일명과 .list 의 화자 칸
WHISPER_MODEL = os.environ.get("MIRO_WHISPER", "small")                  # tiny·base·small·medium·large (클수록 정확하고 느림)
# ────────────────────────────────────────────────────────────────────────────

RAW_DIR = "./Miro_Raw_Audio"
OUTPUT_DIR = "./Miro_Dataset_Output"
LIST_PATH = "./raw_manhwa_voice.list"
FFMPEG = "/opt/homebrew/bin/ffmpeg"
os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
AudioSegment.converter = FFMPEG

# 숨소리·신음은 -45dB 보다 조용한 경우가 많아 끊기 기준을 낮게, 앞뒤 여백은 남긴다.
MIN_SILENCE_MS = 600
SILENCE_THRESH_DB = -45
KEEP_SILENCE_MS = 250
MIN_CHUNK_MS = 1500          # 1.5초 미만은 잡음으로 본다
MAX_CHUNK_MS = 10000         # 10초 넘는 덩어리는 학습 효율이 떨어져 다시 자른다
NO_SPEECH_PROB = 0.6         # Whisper 가 이보다 확신 있게 "말이 아니다"라고 본 조각은 호흡으로 맵핑
TARGET_SR = 32000            # GPT-SoVITS v2 는 32kHz 로 학습한다 — 16k 로 줄이면 숨소리 질감이 깎인다


def run_youtube_download():
    urls = [u for u in YOUTUBE_URLS if "youtube.com" in u or "youtu.be" in u]
    if not urls:
        print("📥 [1단계] 유튜브 주소가 없어 건너뜀 — Miro_Raw_Audio/ 의 로컬 파일만 쓴다.")
        return
    from yt_dlp import YoutubeDL
    opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(RAW_DIR, "%(title).80s.%(ext)s"),
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        "ffmpeg_location": FFMPEG,
        "quiet": False,
    }
    print(f"📥 [1단계] 유튜브 {len(urls)}개에서 오디오 추출 중...")
    with YoutubeDL(opts) as ydl:
        for url in urls:
            try:
                ydl.download([url])
            except Exception as e:  # noqa: BLE001
                print(f"❌ 다운로드 오류 ({url}): {e}")


def breath_label(duration_ms: int) -> str:
    """글자가 안 나온 구간(숨소리·신음)은 비우지 않고 호흡 기호로 맵핑한다."""
    return "..., ..., 하아..." if duration_ms > 4000 else "읏..., ..."


def split_long(chunk: AudioSegment):
    """너무 긴 덩어리는 가장 조용한 지점이 아니라 단순 등분 — 학습 입력 길이만 맞추면 된다."""
    if len(chunk) <= MAX_CHUNK_MS:
        return [chunk]
    n = -(-len(chunk) // MAX_CHUNK_MS)
    step = len(chunk) // n
    return [chunk[i * step:(i + 1) * step] for i in range(n)]


MAX_MINUTES = float(os.environ.get("MIRO_MAX_MINUTES", "25"))  # 긴 영상은 앞부분만 — 107분짜리를 통째로 올리면 8GB 맥이 스왑으로 멈춘다(10/21)


def trim_long_sources():
    """MAX_MINUTES 보다 긴 소스는 ffmpeg 로 앞부분만 남긴다(스트리밍이라 메모리를 안 쓴다). 학습엔 10~25분이면 충분하다."""
    import subprocess
    for f in sorted(os.listdir(RAW_DIR)):
        if not f.lower().endswith((".wav", ".mp3", ".m4a", ".flac", ".ogg")):
            continue
        path = os.path.join(RAW_DIR, f)
        probe = subprocess.run([FFMPEG.replace("ffmpeg", "ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
        try:
            dur = float(probe.stdout.strip())
        except ValueError:
            continue
        if dur <= MAX_MINUTES * 60:
            continue
        tmp = path + ".trim.wav"
        subprocess.run([FFMPEG, "-y", "-v", "error", "-i", path, "-t", str(int(MAX_MINUTES * 60)), "-ac", "1", tmp], check=True)
        os.replace(tmp, path if path.lower().endswith(".wav") else os.path.splitext(path)[0] + ".wav")
        if not path.lower().endswith(".wav"):
            os.remove(path)
        print(f"✂️  {f}: {dur/60:.0f}분 → 앞 {MAX_MINUTES:.0f}분만 사용")


def process_audio_to_dataset():
    trim_long_sources()
    sources = sorted(f for f in os.listdir(RAW_DIR) if f.lower().endswith((".wav", ".mp3", ".m4a", ".flac", ".ogg")))
    if not sources:
        print(f"⚠️  {RAW_DIR}/ 에 소스가 없다. 유튜브 주소를 넣거나 녹음 파일을 넣고 다시 실행."); sys.exit(1)
    print(f"\n🎙️ [2단계] Whisper '{WHISPER_MODEL}' 로드 중(CPU — Whisper 는 MPS 를 지원하지 않는다)...")
    import whisper
    model = whisper.load_model(WHISPER_MODEL, device="cpu")

    print("\n✂️ [3단계] 호흡 보존 슬라이싱 + 한국어 전사...")
    lines, idx, breaths = [], 0, 0
    for file in sources:
        print(f"🎵 {file}")
        audio = AudioSegment.from_file(os.path.join(RAW_DIR, file)).set_channels(1)
        chunks = split_on_silence(audio, min_silence_len=MIN_SILENCE_MS, silence_thresh=SILENCE_THRESH_DB, keep_silence=KEEP_SILENCE_MS)
        for raw in chunks:
            for chunk in split_long(raw):
                if len(chunk) < MIN_CHUNK_MS:
                    continue
                name = f"{CHARACTER_NAME}_{idx:03d}.wav"
                path = os.path.abspath(os.path.join(OUTPUT_DIR, name))
                chunk.set_frame_rate(TARGET_SR).set_sample_width(2).export(path, format="wav")
                result = model.transcribe(path, language="ko", fp16=False)
                text = result["text"].strip()
                # Whisper 는 숨소리에 글자를 지어내기도 한다 — 글자가 없거나, 모든 구간을 '말 아님'(no_speech_prob)으로 봤으면 호흡으로 친다.
                segs = result.get("segments") or []
                no_speech = bool(segs) and all(sg.get("no_speech_prob", 0) > NO_SPEECH_PROB for sg in segs)
                if not re.sub(r"[^\w]", "", text) or no_speech:
                    text = breath_label(len(chunk)); breaths += 1
                    print(f"   🔥 숨소리 구간 → {text}")
                lines.append(f"{path}|{CHARACTER_NAME}|KO|{text}")
                print(f"   ✅ {name} ({len(chunk)/1000:.1f}s): {text}")
                idx += 1

    with open(LIST_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    total = sum(AudioSegment.from_file(l.split("|")[0]).duration_seconds for l in lines)
    print(f"\n✨ 완료: 조각 {len(lines)}개(호흡 {breaths}개), 총 {total/60:.1f}분 → {LIST_PATH}")
    print("   다음: ./start_miro_gui.sh → 1-GPT-SoVITS-TTS → 1A 에 이 .list 경로와 Miro_Dataset_Output 폴더를 넣고 '一键三连'(원클릭 전처리)")


if __name__ == "__main__":
    run_youtube_download()
    if os.environ.get("MIRO_DOWNLOAD_ONLY"):   # 10/21: 정제·전사는 Modal GPU(prepare_dataset.py)가 한다 — 맥은 내려받기와 길이 자르기만
        trim_long_sources(); print("📥 다운로드만 완료(MIRO_DOWNLOAD_ONLY)"); sys.exit(0)
    process_audio_to_dataset()
