/**
 * 11/25 홍보 미니게임 '사진 카드 수집' 데이터 — 남성향 인기 1~3위. 카드는 운영 상황 사진(작품 공개 갤러리) 경로.
 * N·R·SR = 노출 없는 사진(성행위·알몸 태그 제외 후 눈으로 고름), UR = 언베일 사진 — 언베일이 켜진 성인 인증 회원에게만 주소를 보낸다.
 * 생성: 11/25 세션 스크립트(후보 표 cands.tsv·ur.tsv). 작품을 늘리면 같은 모양으로 추가.
 */
export type Rarity = 'N' | 'R' | 'SR' | 'UR'
export type Card = { img: string; rarity: Rarity; caption: string }
export type CardSet = { key: string; slug: string; title: string; name: string; cards: Card[] }

export const RATES: Record<Rarity, number> = { N: 0.55, R: 0.28, SR: 0.12, UR: 0.05 }
export const DAILY_PULLS = 5

export const CARD_SETS: CardSet[] = [
  {
    "key": "madam",
    "slug": "official-m-frustrated-madam",
    "title": "마님은 욕구불만입니다",
    "name": "한씨 마님",
    "cards": [
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/sit-02.jpg",
        "rarity": "N",
        "caption": "마님이 부채로 입을 가리고 눈웃음 지을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/sit-04.jpg",
        "rarity": "N",
        "caption": "마님이 촛불 켠 방에서 뺨에 손을 괴고 얼굴을 붉힐 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-17.jpg",
        "rarity": "N",
        "caption": "마님이 사당에서 절을 올릴 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-10.jpg",
        "rarity": "N",
        "caption": "마님이 비 오는 날 처마 밑에 서 있을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-18.jpg",
        "rarity": "R",
        "caption": "마님이 대문 앞에서 가마에서 내릴 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-03.jpg",
        "rarity": "R",
        "caption": "마님이 방에 앉아 수를 놓을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-16.jpg",
        "rarity": "SR",
        "caption": "마님이 밤에 다듬이질을 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/d180-20.jpg",
        "rarity": "SR",
        "caption": "마님이 밤 이부자리에서 뒤척일 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/u180-129.jpg",
        "rarity": "UR",
        "caption": "마님이 안방 금침 위에서 저고리를 풀어헤쳐 가슴을 드러낸 채 얼굴을 붉히"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-frustrated-madam/u180-137.jpg",
        "rarity": "UR",
        "caption": "마님이 사랑방에서 저고리를 풀어헤쳐 가슴을 드러낸 채 얼굴을 붉히며 눈을"
      }
    ]
  },
  {
    "key": "boarding",
    "slug": "official-m-boarding-wife",
    "title": "니 엄마 잘먹겠습니다",
    "name": "윤미경",
    "cards": [
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-001.jpg",
        "rarity": "N",
        "caption": "미경이 평소처럼 이야기할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-011.jpg",
        "rarity": "N",
        "caption": "미경이 부끄러워할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-024.jpg",
        "rarity": "N",
        "caption": "미경이 부엌에서 아들 친구들 앞에서 음식을 내놓을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-030.jpg",
        "rarity": "N",
        "caption": "미경이 놀이공원 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-032.jpg",
        "rarity": "R",
        "caption": "미경이 웨딩드레스를 입었을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/sit-025.jpg",
        "rarity": "R",
        "caption": "미경이 바닷가 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/b-005.jpg",
        "rarity": "SR",
        "caption": "미경이 안방에서 속옷 차림으로 침대에 누워 있을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/b-008.jpg",
        "rarity": "SR",
        "caption": "미경이 안방에서 레이스 란제리를 입어 보일 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/u-012.jpg",
        "rarity": "UR",
        "caption": "미경이 욕실에서 침대에서 속삭이며 베개 이야기를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-boarding-wife/u-154.jpg",
        "rarity": "UR",
        "caption": "미경이 안방에서 알몸으로 엎드려 빌 때"
      }
    ]
  },
  {
    "key": "oracle",
    "slug": "official-m-oracle-mail",
    "title": "신탁이 잘못 배달됐습니다",
    "name": "셀레스트",
    "cards": [
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-009a.jpg",
        "rarity": "N",
        "caption": "셀레스트가 당황했을 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-001a.jpg",
        "rarity": "N",
        "caption": "셀레스트가 평소처럼 이야기할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-011b.jpg",
        "rarity": "N",
        "caption": "셀레스트가 부끄러워할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-057a.jpg",
        "rarity": "N",
        "caption": "셀레스트가 영화관 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-053a.jpg",
        "rarity": "R",
        "caption": "셀레스트가 카페 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-051a.jpg",
        "rarity": "R",
        "caption": "셀레스트가 바닷가 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/sit-051b.jpg",
        "rarity": "SR",
        "caption": "셀레스트가 바닷가 데이트를 할 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/u-176a.jpg",
        "rarity": "SR",
        "caption": "셀레스트가 성녀의 침소에서 옷 입은 채 엎드려 빌 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/u-046a.jpg",
        "rarity": "UR",
        "caption": "셀레스트가 기도실에서 오망꼬 댄스를 출 때"
      },
      {
        "img": "/media/character-images/f5a0dfcb-0e4c-443e-be17-c982234926c1/official/official-m-oracle-mail/u-031b.jpg",
        "rarity": "UR",
        "caption": "셀레스트가 성수 목욕탕에서 가슴을 흔들 때"
      }
    ]
  }
]
