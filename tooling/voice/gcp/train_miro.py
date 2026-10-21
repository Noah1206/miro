# 미로 보이스 파인튜닝(GPT-SoVITS v2) — WebUI 의 1A→1B→1C→SoVITS 학습→GPT 학습을 같은 명령·같은 기본값으로 재현한다.
# 로컬(CPU, 느림)과 Colab(GSV_GPU=1) 양쪽에서 같은 파일을 쓴다. 전처리 산출물이 있으면 전처리는 건너뛴다.
#   GSV_EXP=윤서하 GSV_LIST=raw_manhwa_voice.list GSV_WAVS=Miro_Dataset_Output ./venv/bin/python train_miro.py
#   GSV_PREP_ONLY=1 이면 전처리만(데이터 점검용). GSV_S2_EPOCHS·GSV_S1_EPOCHS 로 에폭(기본 8·15 = WebUI 기본값).
import glob, json, os, subprocess, sys, time, yaml

ROOT = os.path.abspath(os.environ.get("GSV_ROOT", os.path.dirname(os.path.abspath(__file__)))); os.chdir(ROOT)
PY = sys.executable
GPU = os.environ.get("GSV_GPU") == "1"
EXP = os.environ.get("GSV_EXP", "miro"); VERSION = "v2"
INP_TEXT = os.path.abspath(os.environ.get("GSV_LIST", "raw_manhwa_voice.list")); INP_WAV = os.path.abspath(os.environ.get("GSV_WAVS", "Miro_Dataset_Output"))
S2_EPOCHS = int(os.environ.get("GSV_S2_EPOCHS", "8")); S1_EPOCHS = int(os.environ.get("GSV_S1_EPOCHS", "15"))
OPT = f"logs/{EXP}"
# 가중치 폴더는 WebUI 가 켜질 때 만든다 — 없으면 GPT 학습이 저장에서 죽는다(9/26 Colab 실측).
for d in (OPT, "TEMP", f"SoVITS_weights_{VERSION}", f"GPT_weights_{VERSION}"): os.makedirs(d, exist_ok=True)
P = "GPT_SoVITS/pretrained_models"
BERT = f"{P}/chinese-roberta-wwm-ext-large"; SSL = f"{P}/chinese-hubert-base"
S2G = f"{P}/gsv-v2final-pretrained/s2G2333k.pth"; S2D = f"{P}/gsv-v2final-pretrained/s2D2333k.pth"
S1 = f"{P}/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt"
S2CFG = "GPT_SoVITS/configs/s2.json"   # v2 는 s2.json(v2Pro 만 s2v2Pro.json), 화자 검증(sv) 단계 없음
# WebUI 는 켜질 때 site-packages/users.pth 로 이 경로들을 넣는다 — WebUI 없이 돌릴 땐 직접 넣는다.
PYPATH = os.pathsep.join([ROOT, f"{ROOT}/GPT_SoVITS", f"{ROOT}/tools"] + ([os.environ["PYTHONPATH"]] if os.environ.get("PYTHONPATH") else []))
# MPLBACKEND=Agg: Colab 의 inline 백엔드를 venv 의 matplotlib 이 몰라 GPT 학습이 죽는다(9/26 실측).
base = dict(os.environ, PYTHONPATH=PYPATH, MPLBACKEND="Agg", is_half=str(GPU), i_part="0", all_parts="1", _CUDA_VISIBLE_DEVICES="0",
            exp_name=EXP, opt_dir=OPT, inp_text=INP_TEXT, inp_wav_dir=INP_WAV, version=VERSION)

def step(name, args, env=None):
    t = time.time(); print(f"STEP {name} start", flush=True)
    r = subprocess.run([PY, "-s"] + args, env={**base, **(env or {})})
    print(f"STEP {name} {'ok' if r.returncode == 0 else 'FAILED rc=' + str(r.returncode)} {time.time() - t:.1f}s", flush=True)
    if r.returncode != 0: sys.exit(1)

if all(os.path.exists(f"{OPT}/{p}") for p in ("2-name2text.txt", "6-name2semantic.tsv", "4-cnhubert")):
    print("STEP prep skipped (산출물 있음)", flush=True)
else:
    step("1a-text", ["GPT_SoVITS/prepare_datasets/1-get-text.py"], {"bert_pretrained_dir": BERT})
    open(f"{OPT}/2-name2text.txt", "w", encoding="utf8").write(open(f"{OPT}/2-name2text-0.txt", encoding="utf8").read().strip("\n") + "\n"); os.remove(f"{OPT}/2-name2text-0.txt")
    step("1b-hubert", ["GPT_SoVITS/prepare_datasets/2-get-hubert-wav32k.py"], {"cnhubert_base_dir": SSL})
    step("1c-semantic", ["GPT_SoVITS/prepare_datasets/3-get-semantic.py"], {"pretrained_s2G": S2G, "s2config_path": S2CFG})
    sem = open(f"{OPT}/6-name2semantic-0.tsv", encoding="utf8").read().strip("\n")
    open(f"{OPT}/6-name2semantic.tsv", "w", encoding="utf8").write("item_name\tsemantic_audio\n" + sem + "\n"); os.remove(f"{OPT}/6-name2semantic-0.tsv")
n = len(open(f"{OPT}/2-name2text.txt", encoding="utf8").read().strip().splitlines())
print(f"DATA lines: {n}", flush=True)
if os.environ.get("GSV_PREP_ONLY") == "1": print("PREP DONE", flush=True); sys.exit(0)

# SoVITS (WebUI 1Ba 기본값: GPU 면 fp16·batch 4, CPU 면 fp32·batch 1)
d = json.load(open(S2CFG))
d["train"].update(fp16_run=GPU, batch_size=4 if GPU else 1, epochs=S2_EPOCHS, text_low_lr_rate=0.4, pretrained_s2G=S2G, pretrained_s2D=S2D,
                  if_save_latest=True, if_save_every_weights=True, save_every_epoch=4, gpu_numbers="0", grad_ckpt=False, lora_rank=32)
d["model"]["version"] = VERSION; d["data"]["exp_dir"] = d["s2_ckpt_dir"] = OPT; d["save_weight_dir"] = f"SoVITS_weights_{VERSION}"; d["name"] = EXP; d["version"] = VERSION
os.makedirs(f"{OPT}/logs_s2_{VERSION}", exist_ok=True); json.dump(d, open("TEMP/tmp_s2.json", "w"))
step("s2-sovits-train", ["GPT_SoVITS/s2_train.py", "--config", "TEMP/tmp_s2.json"])

# GPT (WebUI 1Bb 기본값: DPO 끔, 5 에폭마다 저장)
y = yaml.load(open("GPT_SoVITS/configs/s1longer-v2.yaml"), Loader=yaml.FullLoader)
y["train"].update(precision="16-mixed" if GPU else "32", batch_size=4 if GPU else 1, epochs=S1_EPOCHS, save_every_n_epoch=5, if_save_every_weights=True,
                  if_save_latest=True, if_dpo=False, half_weights_save_dir=f"GPT_weights_{VERSION}", exp_name=EXP)
y["pretrained_s1"] = S1; y["train_semantic_path"] = f"{OPT}/6-name2semantic.tsv"; y["train_phoneme_path"] = f"{OPT}/2-name2text.txt"; y["output_dir"] = f"{OPT}/logs_s1_{VERSION}"
os.makedirs(y["output_dir"], exist_ok=True); open("TEMP/tmp_s1.yaml", "w").write(yaml.dump(y, default_flow_style=False))
step("s1-gpt-train", ["GPT_SoVITS/s1_train.py", "--config_file", "TEMP/tmp_s1.yaml"], {"hz": "25hz"})

sov = max(glob.glob(f"SoVITS_weights_{VERSION}/{EXP}_e*.pth"), key=os.path.getmtime)
gpt = max(glob.glob(f"GPT_weights_{VERSION}/{EXP}-e*.ckpt"), key=os.path.getmtime)
print(f"WEIGHTS {sov} {gpt}", flush=True)
print("ALL DONE", flush=True)
