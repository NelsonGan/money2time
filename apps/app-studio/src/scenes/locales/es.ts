import type { LocaleModule } from './types';

/**
 * Spanish — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const es: LocaleModule = {
  meta: { code: 'es', flag: '🇪🇸', label: 'Español' },

  phone: {
    s1:  { h: 'Cada fila,\nen horas.', hl: 'en horas.', sh: 'Tus movimientos, en dinero y en tiempo', she: '⏳', price: '$10.10', time: '23m', timeSub: 'de trabajo' },
    s2:  { h: 'Todo tu dinero.\nEn un lugar.', hl: 'En un lugar.', sh: 'Patrimonio, ahorros, crédito — a la vista', she: '💚', netWorth: '$55,931', netWorthLabel: 'Patrimonio', checking: 'Cuenta diaria', checkingSub: 'Diario', checkingValue: '$31,079', savings: 'Ahorro alto interés', savingsSub: 'Metas', savingsValue: '$15,004' },
    s3:  { h: 'Cada día\nde un vistazo', hl: 'de un vistazo', sh: 'Calendario visual de tus gastos', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Gastado hoy', amount: '$76.55', food: 'Comida', shopping: 'Compras', transport: 'Transporte' },
    s4:  { h: '¿Adónde va\ntu dinero?', hl: 'tu dinero?', sh: 'Gráficos claros lo desglosan todo', she: '🥧', home: 'Hogar  59%', travel: 'Comida  22%', food: 'Transporte  9%', total: 'Gasto total', totalValue: '$2,899.22' },
    s5:  { h: 'Cada dólar\nes tu tiempo', hl: 'tu tiempo', sh: 'Mira cuánto trabajaste por él', she: '⏰', time: '112h 24m', timeLabel: 'este mes', money: '$2,899.22' },
    s6:  { h: '¿Cuánto\nahorras?', hl: 'ahorras?', sh: 'Mide cada mes. Crea el hábito', she: '📊', healthy: '20%+ es saludable', income: 'Ingreso', expense: 'Gasto', saved: 'Ahorrado' },
    s7:  { h: 'Registra\nen segundos', hl: 'en segundos', sh: 'Entrada rápida desde el inicio', she: '⚡', saved: '¡Guardado!', quick: 'Añadir', mood: '~15m de trabajo' },
    s8:  { h: 'Divide\nla cuenta', hl: 'la cuenta', sh: 'Cuentas divididas, ánimo, notas — tú decides', she: '✍️', splitBill: 'Dividir', mood: 'Ánimo', note: 'Notas' },
    s9:  { h: '¿Cuánto ganas\nde verdad?', hl: 'de verdad?', sh: 'Tarifa por hora mensual, siempre al día', she: '💡', rate: '$25.79', perHour: 'por hora', revealed: 'Tarifa actual', current: 'May 2026 — actual' },
    s10: { h: 'Suscripciones\nbajo control', hl: 'bajo control', sh: 'Alquiler, cuotas, pagos recurrentes', she: '🔁', total: '$1,556.99 / mes', rent: 'Alquiler del piso', gym: 'Cuota del gimnasio', streaming: 'Pack de streaming' },
    s11: { h: 'Hazla\ntuya', hl: 'tuya', sh: 'Personaliza cada rincón de la app', she: '⚙️', display: 'Pantalla', hourly: 'Valor por hora', categories: 'Categorías' },
    s12: { h: 'Elige tu\nestilo', hl: 'estilo', sh: 'Idioma, moneda y tema — a tu manera', she: '🎨', language: 'Español (es)', currency: 'USD ($)', theme: 'Claro · Salvia' },
    s13: { h: 'Importa\nde un toque', hl: 'de un toque', sh: 'La IA lee tu extracto. Tú confirmas', she: '🤖', aiPowered: 'Con IA', oneTap: 'Copiar indicación', pasteJSON: 'Pegar JSON' },
    s14: { h: 'Escribe.\nToca. Listo.', hl: 'Listo.', sh: 'Tu teclado es la vía más rápida', she: '⌨️', type: 'Café 6.50', tap: '↵', done: '0m para anotar', category: 'Auto · Comida / Café' },
    s15: {
      h: 'Tus datos\nson tuyos.', hl: 'son tuyos.',
      privacy: 'Privada por diseño', privacySub: 'Guardados en tu teléfono. Sincronizar es opcional.',
      noAds: 'Sin anuncios', noAdsSub: 'Cero distracciones. Solo tus finanzas.',
      local: 'Local ante todo', localSub: 'Funciona sin conexión. Sin cuenta.',
      users: '+70 mil usuarios',
      inspiredPre: 'Inspirada en',
      bookSub: 'El dinero es la energía vital que intercambias por él',
      bookDesc: 'El clásico atemporal de las finanzas personales. Sabiduría práctica sobre dinero, tiempo y vida.',
    },
    s16: { h: 'Pon un límite.\nCúmplelo.', hl: 'Cúmplelo.', sh: 'Cada categoría, siempre a la vista', she: '🎯', ring: '80%', left: '$730.85 restante', budgeted: 'Gasto presupuestado', unbudgeted: 'Gasto no presupuestado' },
  },

  feature: {
    titleA: 'Cada dólar que gastas',
    titleB: { pre: 'son ', hl: 'horas', post: ' de tu vida.' },
    sub: 'Mira tu tarifa real por hora',
  },

  landing: {
    titleA: 'Tu café de $5 acaba de costarte',
    titleB: '12 minutos de vida.',
    subtitle: 'Mira el precio real en tiempo de cada compra.',
  },
};

export default es;
