#!/bin/zsh
# 준비(train11.sh) 끝나면: Modal T4 병렬 학습 → 가중치 받기(손상 검사) → 등록 → 말투 참조 설치(10/22)
export PATH=$HOME/GPT-SoVITS/venv/bin:$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
until grep -q PREP_DONE ~/.miro/aihub/train11.log; do sleep 30; done
cd ~/Desktop/Miro; export $(grep -E '^DATABASE_URL=' .env); DBH=$(echo $DATABASE_URL | sed -E 's|.*@([^:/]+).*|\1|')
IDS=$(ls -d ~/GPT-SoVITS/jobs/aihub-f*/ 2>/dev/null | xargs -n1 basename | while read i; do [ -f ~/GPT-SoVITS/jobs/$i/$i.zip ] && echo $i; done | paste -sd, -)
echo "학습: $IDS"
(cd tooling/voice && modal run modal_train.py --names "$IDS" --from-zip 2>&1 | grep -E "ok →|실패|Error" | cut -c1-200)
for id in ${IDS//,/ }; do
  spk=${id#aihub-f}; J=~/GPT-SoVITS/jobs/$id; V=~/.miro/voices/gsv/voices/${id//-/_}; rm -rf $V; mkdir -p $V
  ok=1; for f in sovits.pth gpt.ckpt; do for t in 1 2 3; do (cd tooling/voice && modal volume get --force miro-voices /_train/$id/$f $V/$f >/dev/null 2>&1); python -c "import torch,sys;torch.load(sys.argv[1],map_location='cpu',weights_only=False)" $V/$f 2>/dev/null && break; [ $t = 3 ] && ok=0; done; done
  [ $ok = 0 ] && { echo "$id 가중치 손상/없음"; continue; }
  python3 - "$J" "$V" <<'PY'
import json,sys,shutil,os; j,v=sys.argv[1:3]; r=json.load(open(f'{j}/refs.json',encoding='utf8'))['normal']
shutil.copy(f"{j}/Miro_Dataset_Output/{r['file']}", f'{v}/ref.wav'); open(f'{v}/ref.txt','w',encoding='utf8').write(r['text'])
PY
  case $spk in 007|008|009|010|055|059) age=20대;; *) age=30대;; esac
  pnpm -s voice:gsv register --dir $V --id $id --label "성우 여 $spk · $age" --basis license --holder "AI Hub 71349 감성 및 발화스타일 동시 고려 음성합성(NIA), 화자 $spk" \
    --evidence "aihub.or.kr 다운로드 승인(2026-10-22, 자동승인), 대화체 600문장(무감정250·기쁨150·슬픔100·분노100), 라벨 대본으로 GPT-SoVITS v2 파인튜닝. 상업 이용 조항은 운영자 확인 필요. 성인·성적 용도 사용 금지(녹음자 미동의)" \
    --by ab40905045@gmail.com --db-host $DBH 2>&1 | head -n 1
  PID=$(timeout 20 psql "$DATABASE_URL" -Atc "select provider_voice_id from official_voices where id='$id'")
  python3 tooling/voice/install_refs.py ~/.miro/voices/gsv/voices/$PID $J $J/refs.json
done
echo FINISH_DONE
