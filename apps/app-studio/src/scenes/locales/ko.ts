import type { LocaleModule } from './types';

/**
 * Korean — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const ko: LocaleModule = {
  meta: { code: 'ko', flag: '🇰🇷', label: '한국어' },

  phone: {
    s1:  { h: '모든 내역이\n시간으로.', hl: '시간으로.', sh: '가계부가 돈과 시간을 함께 보여줘요', she: '⏳', price: '$10.10', time: '23m', timeSub: '노동 시간' },
    s2:  { h: '모든 자산을\n한눈에.', hl: '한눈에.', sh: '순자산, 저축, 신용까지 한눈에', she: '💚', netWorth: '$55,931', netWorthLabel: '순자산', checking: '입출금 계좌', checkingSub: '일상', checkingValue: '$31,079', savings: '고금리 저축', savingsSub: '목표', savingsValue: '$15,004' },
    s3:  { h: '하루하루를\n한눈에', hl: '한눈에', sh: '지출을 달력으로 한눈에', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: '오늘 지출', amount: '$76.55', food: '식비', shopping: '쇼핑', transport: '교통' },
    s4:  { h: '돈은 어디로\n가나요?', hl: '가나요?', sh: '깔끔한 그래프로 한눈에 분석', she: '🥧', home: '주거  59%', travel: '식비  22%', food: '교통  9%', total: '총지출', totalValue: '$2,899.22' },
    s5:  { h: '돈은 모두\n당신의 시간', hl: '당신의 시간', sh: '얼마나 일한 값인지 정확히 확인', she: '⏰', time: '112h 24m', timeLabel: '이번 달', money: '$2,899.22' },
    s6:  { h: '저축률은\n얼마?', hl: '얼마?', sh: '매달 기록해 습관을 만들어요', she: '📊', healthy: '20%+면 건강', income: '수입', expense: '지출', saved: '저축' },
    s7:  { h: '몇 초 만에\n기록', hl: '몇 초 만에', sh: '홈 화면에서 빠르게 입력', she: '⚡', saved: '저장됨!', quick: '빠른 입력', mood: '약 15m 노동' },
    s8:  { h: '계산은\n더치페이', hl: '더치페이', sh: '더치페이, 기분, 메모는 자유롭게', she: '✍️', splitBill: '더치페이', mood: '기분', note: '메모' },
    s9:  { h: '진짜 시급은\n얼마?', hl: '얼마?', sh: '월별 시급이 그때그때 갱신돼요', she: '💡', rate: '$25.79', perHour: '시급', revealed: '최신 시급', current: 'May 2026 — 현재' },
    s10: { h: '구독을\n한눈에', hl: '한눈에', sh: '월세, 멤버십, 정기 결제 관리', she: '🔁', total: '$1,556.99 / 월', rent: '월세', gym: '헬스 회원권', streaming: '스트리밍 묶음' },
    s11: { h: '나만의\n앱으로', hl: '앱으로', sh: '앱 구석구석을 내 맘대로 설정', she: '⚙️', display: '화면', hourly: '시급 환산', categories: '분류' },
    s12: { h: '나만의\n분위기', hl: '분위기', sh: '언어, 통화, 테마를 내 맘대로', she: '🎨', language: '한국어 (ko)', currency: 'USD ($)', theme: 'Light · Sage' },
    s13: { h: '한 번에\n불러오기', hl: '불러오기', sh: 'AI가 내역을 읽고 확인만 하면 끝', she: '🤖', aiPowered: 'AI 기반', oneTap: '프롬프트 복사', pasteJSON: 'JSON 붙여넣기' },
    s14: { h: '입력하면\n바로 끝.', hl: '바로 끝.', sh: '키보드가 가장 빠른 입구예요', she: '⌨️', type: '커피 6.50', tap: '↵', done: '0m 만에 기록', category: '자동 · 식비 / 커피' },
    s16: { h: '예산을 정하고\n지켜내기', hl: '지켜내기', sh: '모든 카테고리를 한눈에', she: '🎯', ring: '80%', left: '$730.85 남음', budgeted: '예산 내 지출', unbudgeted: '예산 외 지출' },
  },

  feature: {
    titleA: '당신이 쓰는 모든 돈은',
    titleB: { pre: '당신 인생의 ', hl: '시간', post: '입니다.' },
    sub: '진짜 시급을 확인하세요',
  },

  landing: {
    titleA: '$5 커피 한 잔이 방금',
    titleB: '인생 12분을 앗아갔어요.',
    subtitle: '모든 소비의 진짜 시간 가격을 확인하세요.',
  },
};

export default ko;
