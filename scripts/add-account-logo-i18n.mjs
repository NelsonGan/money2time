// One-off: ensures the `accounts.logo` i18n sub-namespace exists in every locale
// file and contains all current keys. Idempotent — inserts the block if missing,
// otherwise patches in any individual keys that are absent.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../lib/i18n/locales');

// key order matters for fresh inserts
const KEYS = [
  'label',
  'add',
  'choose_title',
  'choose_subtitle',
  'search_placeholder',
  'country',
  'none',
  'no_results',
];

// per-locale values keyed by the KEYS above
const T = {
  en: [
    'Logo',
    'Add a logo',
    'Choose logo',
    'Search or browse by country',
    'Search banks & wallets',
    'Country',
    'No logo',
    'No matches found',
  ],
  zh: [
    '标志',
    '添加标志',
    '选择标志',
    '搜索或按国家/地区浏览',
    '搜索银行和钱包',
    '国家/地区',
    '无标志',
    '未找到匹配项',
  ],
  es: [
    'Logo',
    'Añadir un logo',
    'Elegir logo',
    'Busca o explora por país',
    'Buscar bancos y monederos',
    'País',
    'Sin logo',
    'Sin coincidencias',
  ],
  fr: [
    'Logo',
    'Ajouter un logo',
    'Choisir un logo',
    'Rechercher ou parcourir par pays',
    'Rechercher banques et portefeuilles',
    'Pays',
    'Aucun logo',
    'Aucun résultat',
  ],
  de: [
    'Logo',
    'Logo hinzufügen',
    'Logo auswählen',
    'Suchen oder nach Land durchsuchen',
    'Banken & Wallets suchen',
    'Land',
    'Kein Logo',
    'Keine Treffer',
  ],
  pt: [
    'Logo',
    'Adicionar um logo',
    'Escolher logo',
    'Pesquise ou navegue por país',
    'Pesquisar bancos e carteiras',
    'País',
    'Sem logo',
    'Nenhum resultado',
  ],
  it: [
    'Logo',
    'Aggiungi un logo',
    'Scegli logo',
    'Cerca o sfoglia per paese',
    'Cerca banche e wallet',
    'Paese',
    'Nessun logo',
    'Nessun risultato',
  ],
  nl: [
    'Logo',
    'Logo toevoegen',
    'Logo kiezen',
    'Zoek of blader per land',
    'Zoek banken en wallets',
    'Land',
    'Geen logo',
    'Geen resultaten',
  ],
  ja: [
    'ロゴ',
    'ロゴを追加',
    'ロゴを選択',
    '検索または国別に表示',
    '銀行・ウォレットを検索',
    '国',
    'ロゴなし',
    '一致する結果がありません',
  ],
  ko: [
    '로고',
    '로고 추가',
    '로고 선택',
    '검색 또는 국가별 보기',
    '은행·지갑 검색',
    '국가',
    '로고 없음',
    '검색 결과 없음',
  ],
  ru: [
    'Логотип',
    'Добавить логотип',
    'Выбрать логотип',
    'Поиск или просмотр по стране',
    'Поиск банков и кошельков',
    'Страна',
    'Без логотипа',
    'Ничего не найдено',
  ],
  th: [
    'โลโก้',
    'เพิ่มโลโก้',
    'เลือกโลโก้',
    'ค้นหาหรือเรียกดูตามประเทศ',
    'ค้นหาธนาคารและกระเป๋าเงิน',
    'ประเทศ',
    'ไม่มีโลโก้',
    'ไม่พบรายการที่ตรงกัน',
  ],
  tr: [
    'Logo',
    'Logo ekle',
    'Logo seç',
    'Ülkeye göre ara veya göz at',
    'Banka ve cüzdan ara',
    'Ülke',
    'Logo yok',
    'Eşleşme bulunamadı',
  ],
  uk: [
    'Логотип',
    'Додати логотип',
    'Вибрати логотип',
    'Пошук або перегляд за країною',
    'Пошук банків і гаманців',
    'Країна',
    'Без логотипа',
    'Нічого не знайдено',
  ],
  vi: [
    'Logo',
    'Thêm logo',
    'Chọn logo',
    'Tìm kiếm hoặc duyệt theo quốc gia',
    'Tìm ngân hàng & ví',
    'Quốc gia',
    'Không có logo',
    'Không tìm thấy kết quả',
  ],
  id: [
    'Logo',
    'Tambahkan logo',
    'Pilih logo',
    'Cari atau jelajahi per negara',
    'Cari bank & dompet',
    'Negara',
    'Tanpa logo',
    'Tidak ada hasil',
  ],
  ms: [
    'Logo',
    'Tambah logo',
    'Pilih logo',
    'Cari atau semak ikut negara',
    'Cari bank & dompet',
    'Negara',
    'Tiada logo',
    'Tiada padanan',
  ],
  fil: [
    'Logo',
    'Magdagdag ng logo',
    'Pumili ng logo',
    'Maghanap o mag-browse ayon sa bansa',
    'Maghanap ng bangko at wallet',
    'Bansa',
    'Walang logo',
    'Walang nahanap',
  ],
  hi: [
    'लोगो',
    'लोगो जोड़ें',
    'लोगो चुनें',
    'देश के अनुसार खोजें या ब्राउज़ करें',
    'बैंक और वॉलेट खोजें',
    'देश',
    'कोई लोगो नहीं',
    'कोई मिलान नहीं मिला',
  ],
  da: [
    'Logo',
    'Tilføj et logo',
    'Vælg logo',
    'Søg eller gennemse efter land',
    'Søg banker og wallets',
    'Land',
    'Intet logo',
    'Ingen resultater',
  ],
  nb: [
    'Logo',
    'Legg til en logo',
    'Velg logo',
    'Søk eller bla etter land',
    'Søk banker og lommebøker',
    'Land',
    'Ingen logo',
    'Ingen treff',
  ],
  sv: [
    'Logga',
    'Lägg till en logga',
    'Välj logga',
    'Sök eller bläddra efter land',
    'Sök banker och plånböcker',
    'Land',
    'Ingen logga',
    'Inga träffar',
  ],
  pl: [
    'Logo',
    'Dodaj logo',
    'Wybierz logo',
    'Szukaj lub przeglądaj według kraju',
    'Szukaj banków i portfeli',
    'Kraj',
    'Brak logo',
    'Brak wyników',
  ],
};

const esc = (s) => s.replace(/'/g, "\\'");

function freshBlock(values) {
  const lines = KEYS.map((key, i) => `      ${key}: '${esc(values[i])}',`);
  return `    logo: {\n${lines.join('\n')}\n    },`;
}

async function main() {
  const files = (await fs.readdir(LOCALES_DIR)).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const locale = file.replace(/\.ts$/, '');
    const values = T[locale] ?? T.en;
    const valueByKey = Object.fromEntries(KEYS.map((k, i) => [k, values[i]]));
    const full = path.join(LOCALES_DIR, file);
    let src = await fs.readFile(full, 'utf8');

    const logoOpen = src.match(/^(\s*)logo:\s*\{/m);
    if (!logoOpen) {
      // insert a fresh block right after the accounts namespace opens
      const accountsMatch = src.match(/^(\s*)accounts:\s*\{/m);
      if (!accountsMatch) {
        console.warn(`skip ${file}: no accounts namespace`);
        continue;
      }
      const at = accountsMatch.index + accountsMatch[0].length;
      src = `${src.slice(0, at)}\n${freshBlock(values)}${src.slice(at)}`;
      await fs.writeFile(full, src, 'utf8');
      console.log(`inserted block ${file}`);
      continue;
    }

    // patch in any missing keys (e.g. `country` added later)
    const blockStart = logoOpen.index;
    const blockEnd = src.indexOf('},', blockStart);
    const blockSlice = src.slice(blockStart, blockEnd);
    let changed = false;
    for (const key of KEYS) {
      if (new RegExp(`\\b${key}:`).test(blockSlice)) continue;
      const insert = `      ${key}: '${esc(valueByKey[key])}',\n`;
      src = `${src.slice(0, blockEnd)}${insert}${src.slice(blockEnd)}`;
      changed = true;
    }
    if (changed) {
      await fs.writeFile(full, src, 'utf8');
      console.log(`patched keys ${file}`);
    } else {
      console.log(`ok ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
