import type { LocaleModule } from './types';

/**
 * French — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const fr: LocaleModule = {
  meta: { code: 'fr', flag: '🇫🇷', label: 'Français' },

  phone: {
    s1:  { h: 'Chaque Ligne,\nen Heures.', hl: 'en Heures.', sh: 'Vos comptes parlent argent et temps', she: '⏳', price: '$10.10', time: '23m', timeSub: 'de travail' },
    s2:  { h: 'Tout Votre\nArgent. Ici.', hl: 'Argent. Ici.', sh: 'Patrimoine, épargne, crédit — en vue', she: '💚', netWorth: '$55,931', netWorthLabel: 'Patrimoine', checking: 'Compte Courant', checkingSub: 'Quotidien', checkingValue: '$31,079', savings: 'Épargne Rémunérée', savingsSub: 'Objectifs', savingsValue: '$15,004' },
    s3:  { h: 'Voyez Chaque\nJour d\'un Œil', hl: 'd\'un Œil', sh: 'Calendrier visuel de vos dépenses', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Dépensé', amount: '$76.55', food: 'Repas', shopping: 'Achats', transport: 'Transport' },
    s4:  { h: 'Où Part\nVotre Argent ?', hl: 'Votre Argent ?', sh: 'De beaux graphiques détaillent tout', she: '🥧', home: 'Maison  59%', travel: 'Repas  22%', food: 'Transport  9%', total: 'Dépense Totale', totalValue: '$2,899.22' },
    s5:  { h: 'Chaque Dollar\nest du Temps', hl: 'du Temps', sh: 'Voyez le temps que vous y avez passé', she: '⏰', time: '112h 24m', timeLabel: 'ce mois-ci', money: '$2,899.22' },
    s6:  { h: 'Quel Est Votre\nTaux d\'Épargne ?', hl: 'Taux d\'Épargne ?', sh: 'Suivez chaque mois. Créez l\'habitude', she: '📊', healthy: '20%+ c\'est sain', income: 'Revenu', expense: 'Dépense', saved: 'Épargné' },
    s7:  { h: 'Notez Tout\nen Secondes', hl: 'en Secondes', sh: 'Saisie rapide depuis l\'accueil', she: '⚡', saved: 'Enregistré !', quick: 'Ajouter', mood: '~15m de travail' },
    s8:  { h: 'Partage\nl\'Addition', hl: 'l\'Addition', sh: 'Partage, humeur, notes — à vous de voir', she: '✍️', splitBill: 'Partager', mood: 'Humeur', note: 'Notes' },
    s9:  { h: 'Gagnez-Vous\nVraiment ?', hl: 'Vraiment ?', sh: 'Taux horaire mensuel, toujours à jour', she: '💡', rate: '$25.79', perHour: 'par heure', revealed: 'Taux actuel', current: 'May 2026 — actuel' },
    s10: { h: 'Abonnements\nMaîtrisés', hl: 'Maîtrisés', sh: 'Loyer, abonnements, frais récurrents', she: '🔁', total: '$1,556.99 / mo', rent: 'Loyer Appart', gym: 'Abo Salle Sport', streaming: 'Pack Streaming' },
    s11: { h: 'Faites-en\nVotre App', hl: 'Votre App', sh: 'Personnalisez chaque recoin de l\'app', she: '⚙️', display: 'Affichage', hourly: 'Valeur horaire', categories: 'Catégories' },
    s12: { h: 'Choisissez\nVotre Style', hl: 'Votre Style', sh: 'Langue, devise et thème — à votre goût', she: '🎨', language: 'Français (fr)', currency: 'USD ($)', theme: 'Clair · Sauge' },
    s13: { h: 'Importez\nen un Clic', hl: 'en un Clic', sh: 'L\'IA lit votre relevé. Vous confirmez', she: '🤖', aiPowered: 'Via IA', oneTap: 'Copier Texte', pasteJSON: 'Coller JSON' },
    s14: { h: 'Tapez.\nClic. Fini.', hl: 'Fini.', sh: 'Votre clavier est la voie la plus rapide', she: '⌨️', type: 'Café 6.50', tap: '↵', done: '0m à noter', category: 'Auto · Repas / Café' },
    s15: {
      h: 'Vos données\nrestent à vous.', hl: 'restent à vous.',
      privacy: 'Confidentialité intégrée', privacySub: 'Stockées sur votre téléphone. Synchro facultative.',
      noAds: 'Zéro publicité', noAdsSub: 'Zéro distraction. Seulement vos finances.',
      local: 'Local d’abord', localSub: 'Fonctionne hors ligne. Aucun compte requis.',
      users: '+70 000 utilisateurs',
      inspiredPre: 'Inspiré de',
      bookSub: 'L’argent est l’énergie vitale que vous échangez contre lui',
      bookDesc: 'Le classique intemporel des finances personnelles. Une sagesse pratique sur l’argent, le temps et la vie.',
    },
    s16: { h: 'Fixe ton Budget.\nGarde le Cap.', hl: 'Garde le Cap.', sh: 'Chaque catégorie, toujours en vue', she: '🎯', ring: '80%', left: '$730.85 restant', budgeted: 'Dépenses budgétées', unbudgeted: 'Dépenses hors budget' },
  },

  feature: {
    titleA: 'Chaque dollar dépensé',
    titleB: { pre: 'vaut des ', hl: 'heures', post: ' de vie.' },
    sub: 'Voyez votre vrai taux horaire',
  },

  landing: {
    titleA: 'Votre café à $5 vient de coûter',
    titleB: '12 minutes de vie.',
    subtitle: 'Voyez le vrai prix en temps de chaque achat.',
  },
};

export default fr;
