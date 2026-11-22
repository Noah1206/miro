"""사진 세트 기본 분류(11/22 사용자 지정) — 모든 작품의 상황 사진을 이 칸 목록으로 만든다.

  python3 tooling/image/asset_sets.py <작품.json> <출력 폴더>
  → <출력>/sfw/{p,caps}.txt (언베일 아님) · <출력>/nsfw/{p,caps}.txt (언베일) · <출력>/slots.tsv (칸 번호·묶음·설명)

작품.json: {"who": "미경이", "her": "<히로인 태그>", "places": [["부엌에서", "kitchen, ..."], ... 6곳],
            "major": ["밥상을 차릴 때", "<태그>"], "major_stage": ["하숙생들 앞에서 음식을 내놓을 때", "<태그>"], "outfit": "<평소 옷 태그>"}

규칙(사용자):
· 감정 1~15 는 정면(카메라를 본다) — 일상 사진의 '카메라 안 봄' 규칙에서 이 묶음만 예외. 나머지 일상은 [away].
· 설명(캡션)엔 장면만 — 광택·젖음 같은 그림 스타일 단어 금지(AI 가 장면 상태로 읽어 사진을 안 고른다).
· 임신 에셋은 기본보다 많이, 갱뱅도 만든다 — 갱뱅은 성인끼리 합의한 장면(그녀가 원해서·즐기는 표정, 구속·강제로 보이는 태그 없음).
· 광택·하얀 피부·업스케일은 modal_lora_test.py 가 붙인다([[art-quality-standard]]). 남성기는 올리기 전에 흰색으로 가린다.
"""
import json, sys
from pathlib import Path

M = '(faceless male:1.2), adult male'
GROUP = '(multiple boys:1.3), (3boys:1.2), (faceless male:1.3), adult males'
Q = 'masterpiece, best quality, newest, absurdres, highres'

# (번호, 묶음, 설명, 태그, nsfw, 남자 등장) — 설명은 "<who> <장소> <설명>" 으로 붙는다(감정은 장소 없이).
def slots(major, major_stage):
    E = [  # 감정 — 정면, 상반신, 평소 옷
        (1, '감정', '평소처럼 이야기할 때', '(talking:1.3), gentle smile'), (2, '감정', '화가 났을 때', '(angry:1.6), (furrowed brow:1.5), (shouting:1.3), clenched teeth'),
        (3, '감정', '활짝 웃을 때', '(laughing:1.5), (open mouth:1.3), happy, closed eyes'), (4, '감정', '눈물을 흘리며 슬퍼할 때', '(crying:1.6), (streaming tears:1.6), (sad:1.5), trembling lips'),
        (5, '감정', '비웃을 때', '(smirk:1.5), (mocking:1.4), half-closed eyes, one eyebrow raised'), (6, '감정', '경멸하는 눈으로 내려다볼 때', '(disgust:1.6), (contempt:1.5), (looking down at viewer:1.4), frown, narrowed eyes'),
        (7, '감정', '겁에 질렸을 때', '(scared:1.6), (terrified:1.4), (wide eyes:1.4), trembling, hands up'), (8, '감정', '무표정으로 정색할 때', '(expressionless:1.7), (blank stare:1.5), (serious:1.4), closed mouth'),
        (9, '감정', '당황했을 때', '(flustered:1.5), (surprised:1.5), wide eyes, open mouth, blush'), (10, '감정', '고민할 때', '(thinking:1.5), (hand on chin:1.5), looking up, pursed lips'),
        (11, '감정', '부끄러워할 때', '(embarrassed:1.5), (heavy blush:1.5), looking away, covering mouth'), (12, '감정', '삐졌을 때', '(pouting:1.6), (puffed cheeks:1.5), (crossed arms:1.3), annoyed'),
        (13, '감정', '흥분해 숨이 가빠질 때', '(aroused:1.5), (heavy breathing:1.4), flushed, half-closed eyes, parted lips'), (14, '감정', '혼란스러워 멘붕일 때', '(confused:1.6), (spiral eyes:1.5), (dizzy:1.4), question mark, sweat'),
        (15, '감정', '가슴을 주무르며 유혹할 때', 'grabbing own breasts, seductive smile, cleavage'),
    ]
    A = [  # 행동
        (16, '행동', '휴대폰을 볼 때', 'looking at smartphone', 0, 0), (17, '행동', '꼭 안길 때', 'hug, embrace', 0, 1),
        (18, '행동', '머리를 쓰다듬어 줄 때', 'headpat, patting head, smile', 0, 1), (19, '행동', '볼을 꼬집을 때', 'cheek pinching, playful', 0, 1),
        (20, '행동', '입을 맞출 때', 'kissing', 0, 1), (21, '행동', '품에 안겨 입을 맞출 때', 'kissing, embrace, held in arms', 0, 1),
        (22, '행동', '윗옷을 벗을 때', 'undressing, taking off shirt, bra', 1, 0), (23, '행동', '아래옷을 벗을 때', 'undressing, pulling down skirt, panties', 1, 0),
        (24, '행동', '브래지어를 풀 때', 'unhooking bra, topless, breasts', 1, 0), (25, '행동', '팬티를 내릴 때', 'pulling down panties, bottomless', 1, 0),
        (26, '행동', '알몸으로 서 있을 때', 'completely nude, standing', 1, 0), (27, '행동', '겨드랑이를 보여 줄 때', 'arms up, armpits, presenting armpits', 1, 0),
        (28, '행동', '겨드랑이를 핥아질 때', 'armpit licking, arms up', 1, 1), (29, '행동', '발을 내밀어 보여 줄 때', 'feet, soles, foot focus, sitting', 0, 0),
        (30, '행동', '발을 핥아질 때', 'foot licking, feet', 1, 1), (31, '행동', '가슴을 흔들 때', 'breasts bouncing, topless, shaking breasts', 1, 0),
        (32, '행동', '속옷 차림으로 거울 셀카를 찍을 때', 'underwear, mirror selfie, holding phone', 1, 0), (33, '행동', '알몸으로 거울 셀카를 찍을 때', 'completely nude, mirror selfie, holding phone', 1, 0),
        (34, '행동', '침대에서 속삭이며 베개 이야기를 할 때', 'pillow talk, lying in bed, under blanket, nude shoulders', 1, 1),
        (35, '행동', '더블 피스로 아헤가오를 할 때', 'ahegao, double v, tongue out, rolling eyes', 1, 0), (36, '행동', '가슴 앞에서 손 하트를 할 때', 'heart hands, topless', 1, 0),
        (37, '행동', '속옷 위로 냄새를 맡을 때', 'sniffing crotch, clothed male, underwear bulge', 1, 1), (38, '행동', '자지 냄새를 맡을 때', 'sniffing penis, penis', 1, 1),
        (39, '행동', '자지로 눈을 가릴 때', 'penis on face, penis over eyes', 1, 1), (40, '행동', '보지를 벌려 보일 때', 'spread pussy, presenting, legs spread', 1, 0),
        (41, '행동', '엉덩이를 벌려 보일 때', 'spread ass, from behind, presenting', 1, 0), (42, '행동', '관계 뒤 탈진했을 때', 'after sex, exhausted, lying, nude', 1, 0),
        (43, '행동', '안에 싼 정액이 흘러나올 때', 'cum in pussy, cumdrip, after sex, legs spread', 1, 0), (44, '행동', '관계 뒤 사진을 찍힐 때', 'after sex, being photographed, phone, nude', 1, 1),
        (45, '행동', '콘돔을 들고 있을 때', 'holding condom, seductive smile', 1, 0), (46, '행동', '오망꼬 댄스를 출 때', 'squatting, spread legs, dancing, nude', 1, 0),
        (47, '행동', '트월킹을 할 때', 'twerking, from behind, ass shake', 1, 0),
    ]
    D = [  # 일상·데이트 — 48~50 은 작품의 '전공'
        (48, '일상', major[0], major[1], 0, 0), (49, '일상', major_stage[0], major_stage[1], 0, 0), (50, '일상', '알몸으로 ' + major[0], 'completely nude, ' + major[1], 1, 0),
        (51, '데이트', '바닷가 데이트를 할 때', 'beach date, swimsuit, ocean', 0, 0), (52, '데이트', '노래방 데이트를 할 때', 'karaoke, singing, microphone', 0, 0),
        (53, '데이트', '카페 데이트를 할 때', 'cafe date, coffee cup', 0, 0), (54, '데이트', '공원 데이트를 할 때', 'park date, walking', 0, 0),
        (55, '데이트', '골프 데이트를 할 때', 'golf date, golf club, golf course', 0, 0), (56, '데이트', '놀이공원 데이트를 할 때', 'amusement park date, ferris wheel', 0, 0),
        (57, '데이트', '영화관 데이트를 할 때', 'movie theater date, popcorn, dark theater', 0, 0),
    ]
    S = [  # 명령
        (58, '명령', '고양이 흉내를 낼 때', 'cat pose, paw pose, cat ears headband, playful', 1, 0), (59, '명령', '서서 오줌을 눌 때', 'peeing, standing, pee stream', 1, 0),
        (60, '명령', '서서 시오후키를 할 때', 'female ejaculation, squirting, standing', 1, 0), (61, '명령', '보지를 벌리며 인사할 때', 'spread pussy, bowing, greeting', 1, 0),
        (62, '명령', '강아지처럼 엎드려 복종할 때', 'all fours, dog pose, collar', 1, 0), (63, '명령', '진동 에그를 넣고 버틸 때', 'vibrator, egg vibrator, trembling, biting lip', 1, 0),
        (64, '명령', '아침에 입으로 깨워 줄 때', 'fellatio, morning, bed, sunlight', 1, 1), (186, '명령', '치마를 들어 팬티를 보여 줄 때', 'skirt lift, panties, blush', 1, 0),
        (187, '명령', '아래를 내리고 엉덩이를 내밀 때', 'bottomless, bent over, ass, from behind', 1, 0),
    ]
    F = [  # 애무
        (65, '애무', '옷 위로 가슴을 만져질 때', 'breast grab, clothed', 1, 1), (66, '애무', '알몸으로 가슴을 만져질 때', 'breast grab, nude', 1, 1),
        (67, '애무', '옷 위로 엉덩이를 만져질 때', 'ass grab, clothed', 1, 1), (68, '애무', '알몸으로 엉덩이를 만져질 때', 'ass grab, nude', 1, 1),
        (69, '애무', '가슴을 빨릴 때', 'breast sucking, nipple sucking', 1, 1), (70, '애무', '젖을 물리며 손으로 해 줄 때', 'nursing handjob, breast feeding, handjob', 1, 1),
        (71, '애무', '혼자 자위할 때', 'female masturbation, fingering self', 1, 0), (72, '애무', '혼자 자위하다 절정할 때', 'female masturbation, orgasm, arched back', 1, 0),
        (73, '애무', '옷 입은 채 손가락으로 애무받을 때', 'fingering, clothed, hand in panties', 1, 1), (74, '애무', '옷 입은 채 손가락에 절정할 때', 'fingering, clothed, orgasm', 1, 1),
        (75, '애무', '알몸으로 손가락에 애무받을 때', 'fingering, nude, legs spread', 1, 1), (76, '애무', '알몸으로 손가락에 절정할 때', 'fingering, nude, orgasm, arched back', 1, 1),
        (77, '애무', '알몸으로 시오후키를 할 때', 'squirting, female ejaculation, nude', 1, 1), (78, '애무', '옷 입은 채 얼굴 위에 앉을 때', 'facesitting, clothed, skirt', 1, 1),
        (79, '애무', '알몸으로 얼굴 위에 앉을 때', 'facesitting, nude', 1, 1), (80, '애무', '얼굴 위에 앉은 채 실금할 때', 'facesitting, peeing, wetting', 1, 1),
        (81, '애무', '핥아질 때', 'cunnilingus, legs spread', 1, 1), (82, '애무', '핥아지다 절정할 때', 'cunnilingus, orgasm, arched back', 1, 1),
        (83, '애무', '발로 자지를 밟을 때', 'stepping on penis, footjob, standing', 1, 1), (84, '애무', '발로 밟아 사정시킬 때', 'stepping on penis, ejaculation, cum on feet', 1, 1),
        (85, '애무', '겨드랑이로 해 줄 때', 'armpit sex, arm up', 1, 1), (86, '애무', '겨드랑이에 사정받을 때', 'armpit sex, ejaculation, cum', 1, 1),
        (87, '애무', '손으로 해 줄 때', 'handjob', 1, 1), (88, '애무', '손으로 해 주다 사정받을 때', 'handjob, ejaculation, cum on hand', 1, 1),
        (89, '애무', '발로 해 줄 때', 'footjob', 1, 1), (90, '애무', '발로 해 주다 사정받을 때', 'footjob, ejaculation, cum on feet', 1, 1),
        (91, '애무', '핥으며 손으로 해 줄 때', 'rimjob, handjob', 1, 1), (92, '애무', '핥으며 손으로 해 주다 사정받을 때', 'rimjob, handjob, ejaculation', 1, 1),
        (93, '애무', '가슴 사이에 끼워 줄 때', 'paizuri', 1, 1), (94, '애무', '가슴 사이에 끼워 혀를 내밀 때', 'paizuri, tongue out, looking up', 1, 1),
        (95, '애무', '가슴 사이에 사정받을 때', 'paizuri, ejaculation, cum on breasts', 1, 1), (96, '애무', '입으로 해 줄 때', 'fellatio', 1, 1),
        (97, '애무', '입으로 해 주며 올려다볼 때', 'fellatio, looking up, kneeling', 1, 1), (98, '애무', '목 깊숙이 받아들일 때', 'deepthroat, tears', 1, 1),
        (99, '애무', '목 깊숙이 받아들이며 버틸 때', 'deepthroat, gagging, hand on head', 1, 1), (100, '애무', '목 깊숙이 사정받을 때', 'deepthroat, ejaculation, cum in mouth', 1, 1),
        (101, '애무', '69 자세로 서로 할 때', '69, mutual oral', 1, 1), (102, '애무', '69 자세로 사정받을 때', '69, ejaculation, cum in mouth', 1, 1),
        (103, '애무', '입안의 정액을 보여 줄 때', 'cum in mouth, open mouth, showing cum, tongue out', 1, 0), (104, '애무', '정액을 삼킬 때', 'swallowing, cum, gulp', 1, 0),
        (105, '애무', '정액을 삼키고 입안을 보여 줄 때', 'open mouth, empty mouth, tongue out, after swallowing', 1, 0),
    ]
    P = []  # 성행위 13체위 × 삽입·격렬2·사정
    poses = [('정상위', 'missionary, lying on back, legs spread'), ('후배위', 'doggystyle, all fours'), ('기승위', 'cowgirl position, straddling'),
             ('엎드린 후배위', 'prone bone, lying on stomach'), ('역기승위', 'reverse cowgirl position'), ('교배 프레스', 'mating press, legs up'),
             ('파일드라이버', 'piledriver, legs over head'), ('들어서 정면', 'standing carry, legs wrapped around, face to face'), ('풀 넬슨', 'full nelson, legs held up'),
             ('대면좌위', 'sitting face to face, upright straddle'), ('측위', 'spooning, lying on side'), ('아마존 체위', 'amazon position, woman on top, man legs up'), ('애널', 'anal, doggystyle')]
    n = 106
    for name, tag in poses:
        P += [(n, '성행위', f'{name}로 받아들일 때', f'sex, {tag}, penetration', 1, 1),
              (n + 1, '성행위', f'{name}로 격렬하게 할 때', f'sex, {tag}, rough sex, moaning, motion lines', 1, 1),
              (n + 2, '성행위', f'{name}로 격렬하게 하다 절정할 때', f'sex, {tag}, orgasm, ahegao, trembling', 1, 1),
              (n + 3, '성행위', f'{name}로 안에 사정받을 때', f'sex, {tag}, cum in pussy, creampie, ejaculation', 1, 1)]
        n += 4
    P += [(158, '성행위', '통화하는 중에 할 때', 'sex, talking on phone, covering mouth, holding phone', 1, 1)]
    W = [  # 샤워
        (159, '샤워', '샤워할 때', 'showering, nude, water', 1, 0), (160, '샤워', '머리를 감겨 줄 때', 'washing hair, shampoo, nude', 1, 1),
        (161, '샤워', '샤워 중 가슴을 만져질 때', 'showering, breast grab, nude', 1, 1), (162, '샤워', '욕조에 같이 들어갈 때', 'bathtub, bathing together, nude', 1, 1),
        (163, '샤워', '샤워 부스에서 뒤로 받아들일 때', 'shower sex, standing sex from behind, hands on wall', 1, 1),
        (164, '샤워', '샤워 부스에서 뒤로 격렬하게 할 때', 'shower sex, from behind, rough sex', 1, 1),
        (165, '샤워', '샤워 부스에서 뒤로 하다 절정할 때', 'shower sex, from behind, orgasm', 1, 1),
        (166, '샤워', '샤워 부스에서 안에 사정받을 때', 'shower sex, from behind, creampie', 1, 1),
    ]
    G = [  # 결혼·임신 — 사용자: 임신은 더 많이(기본 9칸 + 추가 10칸)
        (167, '결혼', '웨딩드레스를 입었을 때', 'wedding dress, veil, bouquet', 0, 0), (168, '임신', '임신한 배를 쓰다듬을 때', 'pregnant, hand on belly, smile', 0, 0),
        (169, '임신', '아기를 안고 있을 때', 'holding baby, mother, gentle smile', 0, 0),
        (170, '임신', '임신한 채 정상위로 받아들일 때', 'pregnant, sex, missionary', 1, 1), (171, '임신', '임신한 채 정상위로 안에 사정받을 때', 'pregnant, sex, missionary, creampie', 1, 1),
        (172, '임신', '임신한 채 후배위로 받아들일 때', 'pregnant, sex, doggystyle', 1, 1), (173, '임신', '임신한 채 후배위로 안에 사정받을 때', 'pregnant, sex, doggystyle, creampie', 1, 1),
        (174, '임신', '임신한 채 위에 올라탈 때', 'pregnant, sex, cowgirl position', 1, 1), (175, '임신', '임신한 채 올라타 안에 사정받을 때', 'pregnant, sex, cowgirl position, creampie', 1, 1),
        (202, '임신', '만삭의 배를 드러낼 때', 'pregnant, large belly, belly exposed, smile', 0, 0), (203, '임신', '임신한 몸으로 알몸 거울 셀카를 찍을 때', 'pregnant, nude, mirror selfie', 1, 0),
        (204, '임신', '임신한 채 젖이 흐를 때', 'pregnant, lactation, breast milk, nude', 1, 0), (205, '임신', '임신한 채 가슴을 빨릴 때', 'pregnant, breast sucking, lactation', 1, 1),
        (206, '임신', '임신한 채 입으로 해 줄 때', 'pregnant, fellatio', 1, 1), (207, '임신', '임신한 채 마주 앉아 할 때', 'pregnant, sex, sitting face to face', 1, 1),
        (208, '임신', '임신한 채 옆으로 누워 할 때', 'pregnant, sex, spooning', 1, 1), (209, '임신', '임신한 배를 만져지며 애무받을 때', 'pregnant, belly grab, fingering', 1, 1),
        (210, '임신', '임신한 채 관계 뒤 늘어졌을 때', 'pregnant, after sex, exhausted, cumdrip', 1, 0), (211, '임신', '임신한 채 속옷 차림일 때', 'pregnant, lingerie, belly', 1, 0),
    ]
    B = [  # BDSM
        (176, 'BDSM', '옷 입은 채 엎드려 빌 때', 'dogeza, kneeling, clothed', 1, 0), (177, 'BDSM', '알몸으로 엎드려 빌 때', 'dogeza, nude', 1, 0),
        (178, 'BDSM', '엉덩이를 맞을 때', 'spanking, red ass, bent over', 1, 1), (179, 'BDSM', '묶인 채 딜도를 받아들일 때', 'bondage, rope, dildo, consensual', 1, 0),
        (180, 'BDSM', '눈가리개와 재갈을 한 채 할 때', 'blindfold, ball gag, sex, consensual', 1, 1), (181, 'BDSM', '눈가리개와 재갈을 한 채 안에 사정받을 때', 'blindfold, ball gag, sex, creampie', 1, 1),
        (182, 'BDSM', '알몸으로 산책할 때', 'nude, collar, leash, outdoors, night', 1, 0), (183, 'BDSM', '야외에서 오줌을 눌 때', 'peeing, outdoors, squatting', 1, 0),
        (184, 'BDSM', '야외에서 뒤로 받아들일 때', 'outdoor sex, from behind, standing', 1, 1), (185, 'BDSM', '야외에서 뒤로 안에 사정받을 때', 'outdoor sex, from behind, creampie', 1, 1),
    ]
    X = [(188, '추가', '옷 입은 채 정상위로 받아들일 때', 'clothed sex, missionary', 1, 1), (189, '추가', '옷 입은 채 정상위로 격렬하게 할 때', 'clothed sex, missionary, rough sex', 1, 1),
         (190, '추가', '옷 입은 채 정상위로 절정할 때', 'clothed sex, missionary, orgasm', 1, 1), (191, '추가', '옷 입은 채 정상위로 안에 사정받을 때', 'clothed sex, missionary, creampie', 1, 1),
         (192, '추가', '옷 입은 채 후배위로 받아들일 때', 'clothed sex, doggystyle', 1, 1), (193, '추가', '옷 입은 채 후배위로 격렬하게 할 때', 'clothed sex, doggystyle, rough sex', 1, 1),
         (194, '추가', '옷 입은 채 후배위로 절정할 때', 'clothed sex, doggystyle, orgasm', 1, 1), (195, '추가', '옷 입은 채 후배위로 안에 사정받을 때', 'clothed sex, doggystyle, creampie', 1, 1),
         (196, '추가', '옷 입은 채 위에 올라탈 때', 'clothed sex, cowgirl position', 1, 1), (197, '추가', '옷 입은 채 올라타 격렬하게 할 때', 'clothed sex, cowgirl position, rough sex', 1, 1),
         (198, '추가', '옷 입은 채 올라타 절정할 때', 'clothed sex, cowgirl position, orgasm', 1, 1), (199, '추가', '옷 입은 채 올라타 안에 사정받을 때', 'clothed sex, cowgirl position, creampie', 1, 1),
         (200, '추가', '애널 비즈를 뽑힐 때', 'anal beads, pulling out, trembling', 1, 1), (201, '추가', '손으로 보지 하트를 만들 때', 'heart hands on pussy, spread legs', 1, 0)]
    GB = [  # 갱뱅 — 사용자 요청. 성인끼리 합의(그녀가 원함, 즐기는 표정), 구속·강제 태그 없음.
        (212, '갱뱅', '여러 남자에게 둘러싸여 유혹할 때', 'seductive smile, surrounded, nude', 1, 2), (213, '갱뱅', '여러 남자를 동시에 입과 손으로 해 줄 때', 'fellatio, double handjob, kneeling', 1, 2),
        (214, '갱뱅', '앞뒤로 동시에 받아들일 때', 'spitroast, sex from behind, fellatio', 1, 2), (215, '갱뱅', '위에 올라타며 입으로도 해 줄 때', 'cowgirl position, fellatio, sex', 1, 2),
        (216, '갱뱅', '두 구멍으로 동시에 받아들일 때', 'double penetration, sex', 1, 2), (217, '갱뱅', '여러 남자에게 동시에 사정받을 때', 'bukkake, cum on face, cum on body, smile', 1, 2),
        (218, '갱뱅', '정액 범벅으로 늘어졌을 때', 'cum on body, covered in cum, exhausted, satisfied smile', 1, 0), (219, '갱뱅', '여러 남자 사이에서 절정할 때', 'gangbang, orgasm, ahegao, sex', 1, 2),
    ]
    return [(n, g, c, t, 0, 0) for n, g, c, t in E] + A + D + S + F + P + W + G + B + X + GB


# 11/22 칸마다 옷(사용자 검사: 데이트·웨딩까지 앞치마가 붙었다). 'none' = 옷 태그 없음(태그에 이미 있음).
OUTFIT = {51: 'white bikini', 52: 'casual date outfit, blouse, flared skirt, cardigan', 53: 'casual date outfit, blouse, flared skirt, cardigan',
          54: 'casual date outfit, light coat, long skirt', 55: 'golf wear, polo shirt, pleated skirt, visor', 56: 'casual date outfit, off-shoulder top, skirt',
          57: 'casual date outfit, knit dress, coat', 167: 'none', 168: 'maternity dress', 169: 'maternity dress, cardigan', 202: 'maternity dress, belly exposed'}
# 웃음이 끼면 안 되는 감정 — 따로 돌려 부정에 웃음·홍조를 넣는다.
NO_SMILE = {2, 4, 6, 7, 8, 10, 12, 14}
# 장면 자체에 장소가 있는 칸(데이트·웨딩·야외) — 작품의 집 안 장소를 붙이지 않는다(사용자 검사: '안방에서 바닷가 데이트').
OWN_SETTING = {51, 52, 53, 54, 55, 56, 57, 167, 182, 183, 184, 185}


def build(cfg, out: Path):
    who, her, places = cfg['who'], cfg['her'], cfg['places']
    rows = {'sfw': ([], []), 'nsfw': ([], [])}
    tsv = []
    for i, (n, group, cap, tag, nsfw, male) in enumerate(slots(cfg['major'], cfg['major_stage'])):
        pk, pt = places[i % len(places)]
        partner = GROUP if male == 2 else M if male else ''
        people = ('1girl, ' + ('multiple boys' if male == 2 else '1boy, hetero')) if male else '1girl, solo'
        outfit = OUTFIT.get(n, cfg['outfit'])
        if group == '감정':   # 정면·상반신·평소 옷, 장소는 첫 번째 곳(배경만)
            p = f"[viewer] {her}, {people}, {tag}, {outfit}, upper body, looking at viewer, {places[0][1]}, {Q}"
            c = f"{who} {cap}"
        else:
            gaze = '' if nsfw else '[away] '
            # 일반은 칸 옷, 언베일은 '옷 입은 채' 장면에만 집 옷을 붙인다.
            wear = (', ' + outfit if outfit != 'none' else '') if not nsfw else (', ' + cfg['outfit'] if 'clothed' in tag else '')
            own = n in OWN_SETTING
            p = f"{gaze}{'nsfw, ' if nsfw else ''}{her}, {people}, {tag}{', ' + partner if partner else ''}{wear}{'' if own else ', ' + pt}, {Q}"
            c = f"{who} {cap}" if own else f"{who} {pk} {cap}"
        k = 'nsfw' if nsfw else 'sfw'
        rows[k][0].append(p); rows[k][1].append(c); tsv.append(f'{n}\t{k}\t{group}\t{c}')
    for k, (ps, cs) in rows.items():
        (out / k).mkdir(parents=True, exist_ok=True)
        (out / k / 'p.txt').write_text('\n'.join(ps) + '\n', encoding='utf-8')
        (out / k / 'caps.txt').write_text('\n'.join(cs) + '\n', encoding='utf-8')
        (out / k / 'names.txt').write_text('\n'.join(cs) + '\n', encoding='utf-8')
    (out / 'slots.tsv').write_text('\n'.join(tsv) + '\n', encoding='utf-8')
    return {k: len(v[0]) for k, v in rows.items()}


if __name__ == '__main__':
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    counts = build(cfg, Path(sys.argv[2]))
    print(counts, '합계', sum(counts.values()))
    # 자체 확인 — 칸 번호 중복 없음, 설명에 스타일 단어 없음
    nums = [s[0] for s in slots(cfg['major'], cfg['major_stage'])]
    assert len(nums) == len(set(nums)), '칸 번호 중복'
    caps = (Path(sys.argv[2]) / 'sfw' / 'caps.txt').read_text(encoding='utf-8') + (Path(sys.argv[2]) / 'nsfw' / 'caps.txt').read_text(encoding='utf-8')
    assert not any(w in caps for w in ('광택', '흠뻑', '젖은 피부', '촉촉')), '설명에 스타일 단어'
