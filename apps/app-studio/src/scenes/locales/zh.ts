import type { LocaleModule } from './types';

const zh: LocaleModule = {
  meta: { code: 'zh', flag: '🇨🇳', label: '中文' },

  phone: {
    s1:  { h: '每一笔\n都是时间', hl: '都是时间', sh: '账本里同时显示金额与工时', she: '⏳', price: '¥60', time: '43分钟', timeSub: '工作时间' },
    s2:  { h: '所有账户\n一目了然', hl: '一目了然', sh: '净资产、储蓄、信用卡全掌握', she: '💚', netWorth: '¥305,924', netWorthLabel: '净资产', checking: '工资卡', checkingSub: '日常', checkingValue: '¥117,959', savings: '活期储蓄', savingsSub: '目标', savingsValue: '¥128,634' },
    s3:  { h: '日历视图\n直觉化记账', hl: '直觉化记账', sh: '每一天的消费一眼看清', she: '🗓️', date: '5月20日', dateLabel: '5月', dateNumber: '20', transactions: '当日支出', amount: '¥152.31', food: '餐饮', shopping: '购物', transport: '交通' },
    s4:  { h: '钱花\n哪了？', hl: '哪了？', sh: '分类饼图，消费结构清晰可见', she: '🥧', home: '居家  59%', travel: '餐饮  22%', food: '交通  9%', total: '总支出', totalValue: '¥8,551' },
    s5:  { h: '每一块钱\n都是时间', hl: '都是时间', sh: '消费变时间，重新审视支出', she: '⏰', time: '112小时', timeLabel: '本月', money: '¥8,551' },
    s6:  { h: '储蓄率\n多少？', hl: '多少？', sh: '每月追踪，养成存钱习惯', she: '📊', healthy: '20%+为健康', income: '收入', expense: '支出', saved: '已存' },
    s7:  { h: '3秒\n记一笔', hl: '3秒', sh: '在主页快速记录', she: '⚡', saved: '已保存', quick: '快速添加', mood: '约15分钟工作' },
    s8:  { h: '分摊\n账单', hl: '账单', sh: 'AA分账、心情、备注，按需展开', she: '✍️', splitBill: 'AA 分账', mood: '心情', note: '备注' },
    s9:  { h: '你的真实\n时薪多少？', hl: '真实', sh: '按月记录，时薪随你成长', she: '💡', rate: '¥187', perHour: '每小时', revealed: '最新时薪', current: '2026年5月 · 当前' },
    s10: { h: '固定支出\n一清二楚', hl: '一清二楚', sh: '房租、订阅、会员费全管理', she: '🔁', total: '¥5,124 / 月', rent: '房租', gym: '健身房会员', streaming: '流媒体套餐' },
    s11: { h: '完全\n属于你', hl: '属于你', sh: '每一处都可以自定义', she: '⚙️', display: '显示', hourly: '时薪', categories: '分类' },
    s12: { h: '你的\n风格', hl: '风格', sh: '语言、货币、主题随心切换', she: '🎨', language: '中文', currency: 'CNY (¥)', theme: '浅色 · 鼠尾草' },
    s13: { h: '一键\n导入账单', hl: '导入账单', sh: 'AI 读账单，你只需确认', she: '🤖', aiPowered: 'AI 智能', oneTap: '复制提示', pasteJSON: '粘贴 JSON' },
    s14: { h: '输入\n即记账', hl: '即记账', sh: '键盘是最快的入口', she: '⌨️', type: '咖啡 25', tap: '↵', done: '0分钟搞定', category: '自动 · 餐饮 / 咖啡' },
    s15: {
      h: '你的数据\n只属于你。', hl: '只属于你。',
      privacy: '隐私为本', privacySub: '保存在你的手机上，同步可选',
      noAds: '没有广告', noAdsSub: '没有干扰，只有你的账本',
      local: '本地为先', localSub: '完全离线可用，无需注册账号',
      users: '70,000+ 用户',
      inspiredPre: '灵感来自',
      bookSub: '金钱，是你用生命能量换来的',
    },
    s16: { h: '设好预算\n不再超支', hl: '不再超支', sh: '每个分类，一目了然', she: '🎯', ring: '80%', left: '还剩 $730.85', budgeted: '预算内支出', unbudgeted: '预算外支出' },
  },

  feature: {
    titleA: '每一块钱',
    titleB: { pre: '都是 ', hl: '生命时间', post: '' },
    sub: '看清你的真实时薪',
  },

  landing: {
    titleA: '30元的咖啡',
    titleB: '12分钟的生命',
    subtitle: '看清每一笔消费的时间代价。',
  },
};

export default zh;
