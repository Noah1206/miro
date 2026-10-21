#!/bin/zsh
# AI Hub 71349 대화체 여자 11명: 맥에서 하나씩 받아 600문장 데이터셋 zip → Modal 에 올림(10/22). 학습은 모두 올린 뒤 한 번에 병렬.
export PATH=$HOME/GPT-SoVITS/venv/bin:/opt/homebrew/bin:$PATH
cd ~/.miro/aihub; R=~/Desktop/Miro/tooling/voice
for spec in 007:560103 008:560104 009:560105 055:560137 059:560139 016:560110 017:560111 020:560112 051:560133 064:560142 065:560143 010:560106; do
  spk=${spec%%:*}; key=${spec##*:}; id=aihub-f$spk; D=~/GPT-SoVITS/jobs/$id
  [ -f $D/$id.zip ] && { echo "$id 이미 있음"; continue; }
  W=~/.miro/aihub/w$spk; rm -rf $W; mkdir -p $W; cd $W
  ../aihubshell-mac -mode d -datasetkey 71349 -filekey $key -aihubapikey "$(cat ../key.txt)" > dl.log 2>&1
  Z=$(find . -name "*.zip" -size +1M | sort | head -1)
  if [ -z "$Z" ]; then echo "$id 실패: $(ls -R | grep -c part) 조각, $(tail -n 1 dl.log)"; cd ..; rm -rf $W; continue; fi
  rm -rf $D; mkdir -p $D
  python3 $R/aihub_prepare.py ~/.miro/aihub/d71349/labels/TL_대화체_$spk "$Z" $D aihub_f$spk && \
    (cd $R && modal volume put --force miro-voices $D/aihub_f$spk.zip /_datasets/$id.zip > /dev/null 2>&1 && echo "$id 업로드 완료")
  mv $D/aihub_f$spk.zip $D/$id.zip 2>/dev/null
  cd ..; rm -rf $W
done
echo PREP_DONE
