# 그림체 목록 (11/7)

이름만 말하면 그 설정으로 뽑는다. 기본 모델은 전부 **NoobAI XL 1.1** (`--base "Laxhar/noobai-XL-1.1::NoobAI-XL-v1.1.safetensors"`).
섹스신은 NoobAI 판(`*_noob_v1`)으로만 뽑는다. 예전 Animagine 판은 체위가 약하다.

| 부르는 이름 | 그림체 느낌 | 파일 (`--ckpt`) | `--variant` | 강도 | 쓰는 작품 |
|---|---|---|---|---|---|
| **아카데미** | 판타지 아카데미, 부드러운 광택 애니, 풍만 | `out-academynoob/academy_noob_v1.safetensors` | `acdm` | **0.8** (사용자 확정) | — |
| **syh** (조선 마님) | 한복·한옥, 성숙한 밀프 | `out-syhnoob/syh_noob_v1.safetensors` | `syh` | 0.9 | 마님은 욕구불만입니다. |
| **kdh** | 진한 광택, 현대 일상 | `out-kdhnoob/kdh_noob_v1.safetensors` | `kdh` | 0.7~0.8 | 마님(이전) |
| **fa** | 유부녀·밀프 광택 | `out-fanoob/fa_noob_v1.safetensors` | `fa` | 0.7 | 옆집 유부녀(사모님) |
| **itim** | 깔끔한 웹툰 | `out-itimnoob/itim_noob_v1.safetensors` | `itim` | 0.7 | 새 작품 5개(망나니 귀족 등) |
| **isg** | 고양이상 얼굴, 일상 | `out-isgnoob/isg_noob_v1.safetensors` | `isg` | 0.7 | 새엄마의 친구들 |
| **th** | — | `out-thnoob/th_noob_v1.safetensors` | `th` | 0.7 | — |
| **srn** | 무협 평면 셀 채색 | `out-srn1/srn_v1.safetensors` (Animagine 판) | `srn` | 0.5~0.6 (섹스신은 NoobAI 로 그린 뒤 덧입힘) | 모녀덮밥 만들어먹기 |
| mojz | — | `out-mojz1/mojz_v1.safetensors` (Animagine 판) | `mojz` | 0.7 | — |
| gda | — | `out-gda3/gda_v3.safetensors` (Animagine, gda·fa·kdh 한 파일) | `gda` | 0.7 | — |
| whif (여성향) | 남자 중심 | `out-whif/whif_v1.safetensors` (Animagine) | `whif` | 0.8 | 여성향 |

## 아카데미 섹스신 설정 (11/7 확정)
- 강도 0.8, 결합부는 흰 형상으로: 프롬프트에 `(completely nude:1.4), (white featureless penis:1.6), (penis silhouette filled with solid white:1.5)`
- 부정 프롬프트: `mosaic censoring, bar censor, black bar, dark skinned male, black penis, red glow, 2girls, multiple girls, clothes, leotard, swimsuit, clothes covering crotch, young, loli, child, school uniform`
- 예: `output/new-worlds/academy-test4/1-acdm-s21-w0.8-hr.png`

## 그림체 추가하는 법
1. `modal_fetch_set.py` SETS 에 주소 틀 한 줄 → `modal run tooling/image/modal_fetch_set.py --set <이름>`
2. `lora_train.py` RUNS 에 `<이름>noob` 한 줄(base=NoobAI, exclude=True)
3. `modal run --detach tooling/image/modal_lora.py::train --run-name <이름>noob --with-tag` (약 $8~11)
4. `modal_lora_test.py` TRIGGER 에 variant 추가
