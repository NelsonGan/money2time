import type { LocaleModule } from './types';

/**
 * Ukrainian — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const uk: LocaleModule = {
  meta: { code: 'uk', flag: '🇺🇦', label: 'Українська' },

  phone: {
    s1:  { h: 'Кожен рядок —\nу годинах.', hl: 'у годинах.', sh: 'Ваш облік говорить грошима й часом', she: '⏳', price: '$10.10', time: '23m', timeSub: 'праці' },
    s2:  { h: 'Усі гроші.\nОдне місце.', hl: 'Одне місце.', sh: 'Капітал, заощадження, кредит — усе видно', she: '💚', netWorth: '$55,931', netWorthLabel: 'Капітал', checking: 'Щоденний рахунок', checkingSub: 'Щодня', checkingValue: '$31,079', savings: 'Високий відсоток', savingsSub: 'Цілі', savingsValue: '$15,004' },
    s3:  { h: 'Кожен день —\nз огляду', hl: 'з огляду', sh: 'Візуальний календар витрат', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Витрачено нині', amount: '$76.55', food: 'Їжа', shopping: 'Покупки', transport: 'Транспорт' },
    s4:  { h: 'Куди йдуть\nгроші?', hl: 'гроші?', sh: 'Наочні діаграми все розкладуть', she: '🥧', home: 'Дім  59%', travel: 'Їжа  22%', food: 'Транспорт  9%', total: 'Усі витрати', totalValue: '$2,899.22' },
    s5:  { h: 'Гроші — це\nваш час', hl: 'ваш час', sh: 'Дивіться, скільки ви працювали', she: '⏰', time: '112h 24m', timeLabel: 'цей місяць', money: '$2,899.22' },
    s6:  { h: 'Скільки ви\nвідкладаєте?', hl: 'відкладаєте?', sh: 'Стежте щомісяця. Створіть звичку', she: '📊', healthy: '20%+ це добре', income: 'Дохід', expense: 'Витрати', saved: 'Відкладено' },
    s7:  { h: 'Облік за\nсекунди', hl: 'секунди', sh: 'Швидкий запис з головного екрана', she: '⚡', saved: 'Збережено!', quick: 'Додати', mood: '~15m праці' },
    s8:  { h: 'Розділи\nрахунок', hl: 'рахунок', sh: 'Розбий рахунок, настрій, нотатки — ти вирішуєш', she: '✍️', splitBill: 'Розбити', mood: 'Настрій', note: 'Нотатки' },
    s9:  { h: 'Ваш реальний\nдохід?', hl: 'дохід?', sh: 'Ставка за годину щомісяця, завжди свіжа', she: '💡', rate: '$25.79', perHour: 'за годину', revealed: 'Поточна ставка', current: 'May 2026 — поточний' },
    s10: { h: 'Підписки\nпід контролем', hl: 'під контролем', sh: 'Оренда, членства, регулярні платежі', she: '🔁', total: '$1,556.99 / міс', rent: 'Оренда житла', gym: 'Абонемент зали', streaming: 'Пакет стримінгу' },
    s11: { h: 'Зробіть\nсвоїм', hl: 'своїм', sh: 'Налаштуйте кожен куточок застосунку', she: '⚙️', display: 'Вигляд', hourly: 'Цінність години', categories: 'Категорії' },
    s12: { h: 'Оберіть\nстиль', hl: 'стиль', sh: 'Мова, валюта і тема — як вам зручно', she: '🎨', language: 'Українська (uk)', currency: 'USD ($)', theme: 'Світла · Шавлія' },
    s13: { h: 'Імпорт\nу дотик', hl: 'у дотик', sh: 'ШІ читає виписку. Ви підтверджуєте', she: '🤖', aiPowered: 'На базі ШІ', oneTap: 'Копіювати', pasteJSON: 'Вставити JSON' },
    s14: { h: 'Введи.\nТап. Готово.', hl: 'Готово.', sh: 'Клавіатура — найшвидший шлях', she: '⌨️', type: 'Кава 6.50', tap: '↵', done: '0m на запис', category: 'Авто · Їжа / Кава' },
    s16: { h: 'Задай бюджет.\nТримай курс.', hl: 'Тримай курс.', sh: 'Кожна категорія завжди на видноті', she: '🎯', ring: '80%', left: 'залишилось $730.85', budgeted: 'Витрати за бюджетом', unbudgeted: 'Поза бюджетом' },
  },

  feature: {
    titleA: 'Кожен витрачений долар',
    titleB: { pre: 'це ', hl: 'години', post: ' вашого життя.' },
    sub: 'Дивіться свою справжню ставку за годину',
  },

  landing: {
    titleA: 'Кава за $5 щойно коштувала вам',
    titleB: '12 хвилин життя.',
    subtitle: 'Дивіться справжню ціну кожної покупки в часі.',
  },
};

export default uk;
