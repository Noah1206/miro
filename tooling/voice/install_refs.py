"""
목소리 폴더에 말투별 참조를 깐다(10/21) — gsv_server.py 가 읽는 모양:
  ref.wav/ref.txt            기본 참조. 속삭임이 있으면 속삭임(사용자 결정: 가진 데이터가 속삭임 위주), 없으면 보통 말
  ref_normal.wav/.txt        보통 대화용(앱이 style=normal 로 요청할 때). 기본이 속삭임일 때만
  aux_default/*.wav          기본 참조와 같은 말투의 보조 참조(최대 4)
  aux_normal/*.wav           보통 말 보조 참조(최대 4)
  python3 install_refs.py <목소리 폴더> <데이터셋 폴더(Miro_Dataset_Output 이 있는 곳)> <refs.json>
"""
import json
import os
import shutil
import sys

voice, ds, refs_path = sys.argv[1:4]
refs = json.load(open(refs_path, encoding="utf8"))
wavs = os.path.join(ds, "Miro_Dataset_Output")
aux = refs.get("aux", {})


def put(name, r):
    shutil.copy(os.path.join(wavs, r["file"]), os.path.join(voice, f"{name}.wav"))
    open(os.path.join(voice, f"{name}.txt"), "w", encoding="utf8").write(r["text"])


def put_aux(dirname, files):
    d = os.path.join(voice, dirname); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for f in files[:4]:
        if os.path.exists(os.path.join(wavs, f)): shutil.copy(os.path.join(wavs, f), d)


default = "whisper" if "whisper" in refs else "normal" if "normal" in refs else None
if not default: sys.exit("refs.json 에 참조가 없습니다")
put("ref", refs[default]); put_aux("aux_default", aux.get(default, []))
for f in ("ref_normal.wav", "ref_normal.txt", "ref_whisper.wav", "ref_whisper.txt"):
    if os.path.exists(os.path.join(voice, f)): os.remove(os.path.join(voice, f))
shutil.rmtree(os.path.join(voice, "aux_normal"), ignore_errors=True)
if default == "whisper" and "normal" in refs:
    put("ref_normal", refs["normal"]); put_aux("aux_normal", aux.get("normal", []))
print(f"{os.path.basename(voice)[:8]} 기본={default}({refs[default]['text'][:20]}) 보통={'있음' if os.path.exists(os.path.join(voice, 'ref_normal.wav')) else '없음'} "
      f"보조={len(os.listdir(os.path.join(voice, 'aux_default')))}/{len(os.listdir(os.path.join(voice, 'aux_normal'))) if os.path.isdir(os.path.join(voice, 'aux_normal')) else 0}")
