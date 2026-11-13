import type { LocaleModule } from './types';

const ja: LocaleModule = {
  meta: { code: 'ja', flag: '🇯🇵', label: '日本語' },

  phone: {
    s1:  { h: 'どの行も\n時間です', hl: '時間です', sh: '家計簿が金額と労働時間を同時に表示', she: '⏳', price: '$10.10', time: '23m', timeSub: '労働分' },
    s2:  { h: '全資産が\n一画面に', hl: '一画面に', sh: '純資産・貯金・クレジットを一望', she: '💚', netWorth: '$55,931', netWorthLabel: '純資産', checking: '給与口座', checkingSub: '日常', checkingValue: '$31,079', savings: '高利回り貯金', savingsSub: '目標', savingsValue: '$15,004' },
    s3:  { h: '毎日を\n一目で', hl: '一目で', sh: '支出をカレンダーで可視化', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: '今日の支出', amount: '$76.55', food: '飲食', shopping: '買物', transport: '交通' },
    s4:  { h: 'お金は\nどこへ？', hl: 'どこへ？', sh: '美しいグラフで内訳を分解', she: '🥧', home: '住居  59%', travel: '飲食  22%', food: '交通  9%', total: '総支出', totalValue: '$2,899.22' },
    s5:  { h: 'お金は\nあなたの時間', hl: 'あなたの時間', sh: '何時間働いた分かを正確に表示', she: '⏰', time: '112h 24m', timeLabel: '今月', money: '$2,899.22' },
    s6:  { h: '貯蓄率は\n何%？', hl: '何%？', sh: '毎月記録し習慣を育てる', she: '📊', healthy: '20%+が健全', income: '収入', expense: '支出', saved: '貯蓄' },
    s7:  { h: '数秒で\n記録', hl: '数秒で', sh: 'ホーム画面から即入力', she: '⚡', saved: '保存済', quick: 'クイック追加', mood: '約15m分の労働' },
    s8:  { h: '会計を\n割り勘', hl: '割り勘', sh: '割り勘・気分・メモは自由に', she: '✍️', splitBill: '割り勘', mood: '気分', note: 'メモ' },
    s9:  { h: '本当の\n時給は？', hl: '時給は？', sh: '月ごとの時給を随時更新', she: '💡', rate: '$25.79', perHour: '時給', revealed: '最新時給', current: 'May 2026 — 現在' },
    s10: { h: '定期支出を\n管理下に', hl: '管理下に', sh: '家賃・会員費・定期請求を一括', she: '🔁', total: '$1,556.99 / 月', rent: '家賃', gym: 'ジム会員', streaming: '配信セット' },
    s11: { h: '自分\n好みに', hl: '好みに', sh: 'アプリの隅々まで自由設定', she: '⚙️', display: '表示', hourly: '時給換算', categories: '分類' },
    s12: { h: '好きな\n雰囲気で', hl: '雰囲気で', sh: '言語・通貨・テーマを自在に', she: '🎨', language: '日本語 (ja)', currency: 'USD ($)', theme: 'Light · Sage' },
    s13: { h: '一瞬で\n取込み', hl: '取込み', sh: 'AIが明細を読み取り確認のみ', she: '🤖', aiPowered: 'AI 搭載', oneTap: 'プロンプト複製', pasteJSON: 'JSON 貼付' },
    s14: { h: '打って\n即完了', hl: '即完了', sh: 'キーボードが最速の入口', she: '⌨️', type: 'コーヒー 6.50', tap: '↵', done: '0mで記録', category: '自動 · 飲食 / コーヒー' },
    s15: {
      h: 'あなたのデータは\nあなたのもの。', hl: 'あなたのもの。',
      privacy: 'プライバシー重視の設計', privacySub: '端末に保存。同期は任意です',
      noAds: '広告なし', noAdsSub: '余計なものなし。家計に集中',
      local: 'ローカル優先', localSub: 'オフラインで動作。アカウント不要',
      users: '70,000+ ユーザー',
      inspiredPre: 'インスピレーション',
      bookSub: 'お金とは、あなたが引き換えにした生命エネルギーである',
    },
    s16: { h: '予算を決めて\n守り抜く', hl: '守り抜く', sh: 'すべてのカテゴリを一目で', she: '🎯', ring: '80%', left: '残り $730.85', budgeted: '予算内の支出', unbudgeted: '予算外の支出' },
  },

  feature: {
    titleA: '使うお金はすべて',
    titleB: { pre: 'あなたの ', hl: '人生の時間', post: '' },
    sub: '本当の時給を可視化',
  },

  landing: {
    titleA: '$5のコーヒーが',
    titleB: '12分の人生',
    subtitle: 'すべての買い物の本当の時間価格を可視化。',
  },
};

export default ja;
