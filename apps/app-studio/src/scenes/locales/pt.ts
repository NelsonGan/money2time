import type { LocaleModule } from './types';

/**
 * Brazilian Portuguese — translation of the English source. Numeric / currency
 * / date tokens are reused verbatim from English because every locale renders
 * on top of the English screenshots (the US-dollar amounts and English dates
 * are baked into the pixels).
 */
const pt: LocaleModule = {
  meta: { code: 'pt', flag: '🇧🇷', label: 'Português' },

  phone: {
    s1:  { h: 'Cada Linha,\nem Horas.', hl: 'em Horas.', sh: 'Seu extrato fala em dinheiro e tempo', she: '⏳', price: '$10.10', time: '23m', timeSub: 'de trabalho' },
    s2:  { h: 'Todo Dinheiro.\nUm Lugar.', hl: 'Um Lugar.', sh: 'Patrimônio, poupança, crédito — à vista', she: '💚', netWorth: '$55,931', netWorthLabel: 'Patrimônio', checking: 'Conta Corrente', checkingSub: 'Dia a dia', checkingValue: '$31,079', savings: 'Poupança Rendimento', savingsSub: 'Metas', savingsValue: '$15,004' },
    s3:  { h: 'Veja Cada Dia\nde Relance', hl: 'de Relance', sh: 'Calendário visual dos seus gastos', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Gasto hoje', amount: '$76.55', food: 'Comida', shopping: 'Compras', transport: 'Transporte' },
    s4:  { h: 'Para Onde Vai\no seu Dinheiro?', hl: 'seu Dinheiro?', sh: 'Gráficos claros detalham tudo', she: '🥧', home: 'Casa  59%', travel: 'Comida  22%', food: 'Transporte  9%', total: 'Gasto Total', totalValue: '$2,899.22' },
    s5:  { h: 'Cada Dólar\né seu Tempo', hl: 'seu Tempo', sh: 'Veja quanto você trabalhou por ele', she: '⏰', time: '112h 24m', timeLabel: 'este mês', money: '$2,899.22' },
    s6:  { h: 'Quanto Você\nPoupa?', hl: 'Poupa?', sh: 'Acompanhe todo mês. Crie o hábito', she: '📊', healthy: '20%+ é saudável', income: 'Receita', expense: 'Gasto', saved: 'Poupado' },
    s7:  { h: 'Registre\nem Segundos', hl: 'em Segundos', sh: 'Lançamento rápido pela tela inicial', she: '⚡', saved: 'Salvo!', quick: 'Adicionar', mood: '~15m de trabalho' },
    s8:  { h: 'Divida\na Conta', hl: 'a Conta', sh: 'Divida contas, humor, notas — você decide', she: '✍️', splitBill: 'Dividir', mood: 'Humor', note: 'Notas' },
    s9:  { h: 'Quanto Você\nGanha Mesmo?', hl: 'Ganha Mesmo?', sh: 'Valor por hora mensal, sempre atualizado', she: '💡', rate: '$25.79', perHour: 'por hora', revealed: 'Valor atual', current: 'May 2026 — atual' },
    s10: { h: 'Assinaturas\nSob Controle', hl: 'Sob Controle', sh: 'Aluguel, mensalidades, contas fixas', she: '🔁', total: '$1,556.99 / mês', rent: 'Aluguel', gym: 'Academia', streaming: 'Pacote Streaming' },
    s11: { h: 'Deixe do Seu\nJeito', hl: 'Jeito', sh: 'Personalize cada canto do app', she: '⚙️', display: 'Tela', hourly: 'Valor por hora', categories: 'Categorias' },
    s12: { h: 'Escolha seu\nEstilo', hl: 'Estilo', sh: 'Idioma, moeda e tema — do seu jeito', she: '🎨', language: 'Português (pt)', currency: 'USD ($)', theme: 'Claro · Sálvia' },
    s13: { h: 'Importe\ncom um Toque', hl: 'com um Toque', sh: 'A IA lê seu extrato. Você confirma', she: '🤖', aiPowered: 'Com IA', oneTap: 'Copiar Texto', pasteJSON: 'Colar JSON' },
    s14: { h: 'Digite.\nToque. Pronto.', hl: 'Pronto.', sh: 'Seu teclado é o caminho mais rápido', she: '⌨️', type: 'Café 6.50', tap: '↵', done: '0m ao anotar', category: 'Auto · Comida / Café' },
    s15: {
      h: 'Seus dados\nsão só seus.', hl: 'são só seus.',
      privacy: 'Privado desde a origem', privacySub: 'Salvos no seu celular. Sincronizar é opcional.',
      noAds: 'Sem anúncios', noAdsSub: 'Zero distrações. Só suas finanças.',
      local: 'Local primeiro', localSub: 'Funciona offline. Sem precisar de conta.',
      users: '+70 mil usuários',
      inspiredPre: 'Inspirado em',
      bookSub: 'Dinheiro é a energia vital que você troca por ele',
      bookDesc: 'O clássico atemporal das finanças pessoais. Sabedoria prática sobre dinheiro, tempo e vida.',
    },
    s16: { h: 'Defina o Limite.\nSiga o Plano.', hl: 'Siga o Plano.', sh: 'Cada categoria, sempre à vista', she: '🎯', ring: '80%', left: '$730.85 restante', budgeted: 'Gasto orçado', unbudgeted: 'Gasto fora do orçamento' },
  },

  feature: {
    titleA: 'Cada dólar que você gasta',
    titleB: { pre: 'são ', hl: 'horas', post: ' da sua vida.' },
    sub: 'Veja seu valor real por hora',
  },

  landing: {
    titleA: 'Seu café de $5 acabou de custar',
    titleB: '12 minutos de vida.',
    subtitle: 'Veja o preço real em tempo de cada compra.',
  },
};

export default pt;
