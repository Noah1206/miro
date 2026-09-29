import { msg } from '@/lib/i18n'
export const S = {
  jealousy: [
    { value: 15, label: msg('무던함'), hint: msg('다른 사람 얘기가 나와도 별 반응이 없어요.') },
    { value: 45, label: msg('보통'), hint: msg('가끔 신경은 쓰지만 티를 잘 안 내요.') },
    { value: 70, label: msg('예민함'), hint: msg('다른 사람 이야기에 민감하게 반응해요.') },
    { value: 90, label: msg('아주 예민함'), hint: msg('작은 것에도 바로 마음이 상해요.') },
  ],
  initiative: [
    { value: 15, label: msg('기다림'), hint: msg('먼저 다가오지 않아요. 당신이 움직여야 해요.') },
    { value: 45, label: msg('보통'), hint: msg('상황에 따라 먼저 말을 걸기도 해요.') },
    { value: 70, label: msg('먼저 다가감'), hint: msg('관심이 생기면 먼저 다가와요.') },
    { value: 90, label: msg('적극적'), hint: msg('주저 없이 먼저 움직여요.') },
  ],
  emotionalExpression: [
    { value: 15, label: msg('숨김'), hint: msg('감정을 거의 드러내지 않아요.') },
    { value: 40, label: msg('절제'), hint: msg('느끼지만 말로는 잘 안 해요.') },
    { value: 65, label: msg('드러냄'), hint: msg('기분이 표정과 말에 묻어나요.') },
    { value: 90, label: msg('솔직함'), hint: msg('느끼는 대로 바로 말해요.') },
  ],
  trust: [
    { value: 10, label: msg('의심'), hint: msg('당신 말을 곧이곧대로 믿지 않아요.') },
    { value: 30, label: msg('조심'), hint: msg('아직 경계를 풀지 않았어요.') },
    { value: 55, label: msg('보통'), hint: msg('어느 정도는 믿어요.') },
    { value: 80, label: msg('믿음'), hint: msg('당신 말을 믿고 따라요.') },
  ],
  attraction: [
    { value: 5, label: msg('무관심'), hint: msg('당신을 특별히 의식하지 않아요.') },
    { value: 25, label: msg('약간'), hint: msg('조금 신경은 쓰여요.') },
    { value: 50, label: msg('호감'), hint: msg('당신에게 호감이 있어요.') },
    { value: 75, label: msg('끌림'), hint: msg('이미 마음이 기울었어요.') },
  ],
  emotionalDistance: [
    { value: 20, label: msg('가까움'), hint: msg('편안하게 대해요.') },
    { value: 45, label: msg('보통'), hint: msg('예의는 지키되 벽은 없어요.') },
    { value: 65, label: msg('거리 둠'), hint: msg('아직 거리를 두고 쉽게 마음을 열지 않아요.') },
    { value: 85, label: msg('멂'), hint: msg('당신을 낯선 사람으로 대해요.') },
  ],
  attachment: [
    { value: 5, label: msg('없음'), hint: msg('당신이 없어도 아무렇지 않아요.') },
    { value: 25, label: msg('약함'), hint: msg('가끔 생각은 나요.') },
    { value: 50, label: msg('있음'), hint: msg('당신을 신경 써요. 오래 조용하면 먼저 연락할 수 있어요.') },
    { value: 80, label: msg('강함'), hint: msg('당신이 없으면 허전해요.') },
  ],
  protectiveness: [
    { value: 10, label: msg('방관'), hint: msg('당신 일에 끼어들지 않아요.') },
    { value: 35, label: msg('보통'), hint: msg('위험해 보이면 한마디는 해요.') },
    { value: 60, label: msg('챙김'), hint: msg('당신을 챙기려 해요.') },
    { value: 85, label: msg('개입'), hint: msg('위험해 보이면 먼저 나서서 막아요.') },
  ],
  relJealousy: [
    { value: 0, label: msg('없음'), hint: msg('질투는 아직 없어요.') },
    { value: 25, label: msg('약함'), hint: msg('살짝 신경 쓰이는 정도예요.') },
    { value: 50, label: msg('있음'), hint: msg('다른 사람 얘기에 반응해요.') },
    { value: 80, label: msg('강함'), hint: msg('드러내 놓고 질투해요.') },
  ],
  contactFrequency: [
    { value: 20, label: msg('드물게'), hint: msg('조용하면 약 2.5일 뒤에 먼저 연락해요.') },
    { value: 45, label: msg('가끔'), hint: msg('조용하면 약 1.7일 뒤에 먼저 연락해요.') },
    { value: 70, label: msg('자주'), hint: msg('조용하면 약 하루 뒤에 먼저 연락해요.') },
    { value: 90, label: msg('매우 자주'), hint: msg('조용하면 반나절이면 먼저 연락해요.') },
  ],
  initiativeLevel: [
    { value: 20, label: msg('기다림'), hint: msg('연락은 주로 당신이 먼저 해요.') },
    { value: 50, label: msg('보통'), hint: msg('이유가 있으면 먼저 연락해요.') },
    { value: 80, label: msg('먼저'), hint: msg('먼저 연락하는 쪽이에요.') },
  ],
  media: [
    { value: 5, label: msg('거의 안 함'), hint: msg('이 방법으로는 거의 연락하지 않아요.') },
    { value: 25, label: msg('가끔'), hint: msg('어쩌다 한 번 써요.') },
    { value: 50, label: msg('자주'), hint: msg('종종 이 방법을 골라요.') },
    { value: 80, label: msg('매우 자주'), hint: msg('즐겨 쓰는 방법이에요.') },
  ],
} as const
