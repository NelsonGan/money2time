// One-off: inserts the `news.account_logos` announcement copy into every locale.
// Idempotent. Falls back to English for unlisted locales.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../lib/i18n/locales');

const en = {
  title: 'Account Logos',
  introTitle: 'Give your accounts a face',
  introBody:
    'Add a bank or e-wallet logo to any account — choose from 470+ worldwide, or upload your own. Open an account to pick one.',
};

const T = {
  en,
  zh: {
    title: '账户标志',
    introTitle: '给账户加上标志',
    introBody:
      '为任意账户添加银行或电子钱包标志——从全球 470+ 个标志中选择，或上传你自己的。打开账户即可选择。',
  },
  es: {
    title: 'Logos de cuenta',
    introTitle: 'Dale rostro a tus cuentas',
    introBody:
      'Añade el logo de un banco o monedero a cualquier cuenta: elige entre más de 470 de todo el mundo o sube el tuyo. Abre una cuenta para elegir.',
  },
  fr: {
    title: 'Logos de compte',
    introTitle: 'Donnez un visage à vos comptes',
    introBody:
      'Ajoutez le logo d’une banque ou d’un portefeuille à n’importe quel compte : choisissez parmi plus de 470 dans le monde, ou importez le vôtre. Ouvrez un compte pour en choisir un.',
  },
  de: {
    title: 'Kontologos',
    introTitle: 'Gib deinen Konten ein Gesicht',
    introBody:
      'Füge jedem Konto ein Bank- oder Wallet-Logo hinzu – wähle aus über 470 weltweit oder lade dein eigenes hoch. Öffne ein Konto, um eines auszuwählen.',
  },
  pt: {
    title: 'Logos de conta',
    introTitle: 'Dê um rosto às suas contas',
    introBody:
      'Adicione o logo de um banco ou carteira a qualquer conta — escolha entre mais de 470 no mundo todo, ou envie o seu. Abra uma conta para escolher.',
  },
  it: {
    title: 'Logo dei conti',
    introTitle: 'Dai un volto ai tuoi conti',
    introBody:
      'Aggiungi il logo di una banca o di un wallet a qualsiasi conto: scegli tra oltre 470 in tutto il mondo o carica il tuo. Apri un conto per sceglierne uno.',
  },
  nl: {
    title: 'Rekeninglogo’s',
    introTitle: 'Geef je rekeningen een gezicht',
    introBody:
      'Voeg een bank- of wallet-logo toe aan elke rekening — kies uit 470+ wereldwijd of upload je eigen. Open een rekening om er een te kiezen.',
  },
  ja: {
    title: '口座ロゴ',
    introTitle: '口座にロゴを付けよう',
    introBody:
      'どの口座にも銀行や電子ウォレットのロゴを追加できます。世界中の470以上から選ぶか、自分の画像をアップロード。口座を開いて選びましょう。',
  },
  ko: {
    title: '계정 로고',
    introTitle: '계정에 로고를 더하세요',
    introBody:
      '어떤 계정에도 은행 또는 전자지갑 로고를 추가하세요. 전 세계 470개 이상 중에서 고르거나 직접 업로드하세요. 계정을 열어 선택하세요.',
  },
  ru: {
    title: 'Логотипы счетов',
    introTitle: 'Добавьте логотипы своим счетам',
    introBody:
      'Добавьте логотип банка или кошелька к любому счёту — выберите из 470+ по всему миру или загрузите свой. Откройте счёт, чтобы выбрать.',
  },
  th: {
    title: 'โลโก้บัญชี',
    introTitle: 'ใส่โลโก้ให้บัญชีของคุณ',
    introBody:
      'เพิ่มโลโก้ธนาคารหรือกระเป๋าเงินให้กับบัญชีใดก็ได้ — เลือกจากกว่า 470 รายการทั่วโลก หรืออัปโหลดของคุณเอง เปิดบัญชีเพื่อเลือก',
  },
  tr: {
    title: 'Hesap logoları',
    introTitle: 'Hesaplarınıza bir yüz kazandırın',
    introBody:
      'Herhangi bir hesaba banka veya cüzdan logosu ekleyin — dünya genelinde 470+ arasından seçin ya da kendinizinkini yükleyin. Seçmek için bir hesabı açın.',
  },
  uk: {
    title: 'Логотипи рахунків',
    introTitle: 'Додайте логотипи своїм рахункам',
    introBody:
      'Додайте логотип банку чи гаманця до будь-якого рахунку — оберіть з 470+ по всьому світу або завантажте свій. Відкрийте рахунок, щоб обрати.',
  },
  vi: {
    title: 'Logo tài khoản',
    introTitle: 'Cho tài khoản của bạn một logo',
    introBody:
      'Thêm logo ngân hàng hoặc ví điện tử cho bất kỳ tài khoản nào — chọn từ hơn 470 logo toàn cầu, hoặc tải lên của riêng bạn. Mở một tài khoản để chọn.',
  },
  id: {
    title: 'Logo akun',
    introTitle: 'Beri wajah pada akun Anda',
    introBody:
      'Tambahkan logo bank atau e-wallet ke akun mana pun — pilih dari 470+ di seluruh dunia, atau unggah milik Anda. Buka akun untuk memilih.',
  },
  ms: {
    title: 'Logo akaun',
    introTitle: 'Berikan wajah pada akaun anda',
    introBody:
      'Tambah logo bank atau e-dompet pada mana-mana akaun — pilih daripada 470+ di seluruh dunia, atau muat naik sendiri. Buka akaun untuk memilih.',
  },
  fil: {
    title: 'Mga logo ng account',
    introTitle: 'Bigyan ng mukha ang iyong mga account',
    introBody:
      'Magdagdag ng logo ng bangko o e-wallet sa kahit anong account — pumili sa 470+ sa buong mundo, o mag-upload ng sarili mo. Magbukas ng account para pumili.',
  },
  hi: {
    title: 'खाता लोगो',
    introTitle: 'अपने खातों को एक पहचान दें',
    introBody:
      'किसी भी खाते में बैंक या ई-वॉलेट लोगो जोड़ें — दुनिया भर के 470+ में से चुनें, या अपना अपलोड करें। चुनने के लिए कोई खाता खोलें।',
  },
  da: {
    title: 'Kontologoer',
    introTitle: 'Giv dine konti et ansigt',
    introBody:
      'Tilføj et bank- eller wallet-logo til enhver konto — vælg blandt 470+ verden over, eller upload dit eget. Åbn en konto for at vælge.',
  },
  nb: {
    title: 'Kontologoer',
    introTitle: 'Gi kontoene dine et ansikt',
    introBody:
      'Legg til en bank- eller lommebok-logo på enhver konto — velg blant 470+ verden over, eller last opp din egen. Åpne en konto for å velge.',
  },
  sv: {
    title: 'Kontologotyper',
    introTitle: 'Ge dina konton ett ansikte',
    introBody:
      'Lägg till en bank- eller plånbokslogga på valfritt konto — välj bland 470+ världen över, eller ladda upp din egen. Öppna ett konto för att välja.',
  },
  pl: {
    title: 'Logo kont',
    introTitle: 'Nadaj swoim kontom twarz',
    introBody:
      'Dodaj logo banku lub portfela do dowolnego konta — wybierz spośród ponad 470 na świecie lub prześlij własne. Otwórz konto, aby wybrać.',
  },
};

const esc = (s) => s.replace(/'/g, "\\'");

function block(v) {
  return [
    `    account_logos: {`,
    `      title: '${esc(v.title)}',`,
    `      intro: {`,
    `        title: '${esc(v.introTitle)}',`,
    `        body: '${esc(v.introBody)}',`,
    `      },`,
    `    },`,
  ].join('\n');
}

async function main() {
  const files = (await fs.readdir(LOCALES_DIR)).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const locale = file.replace(/\.ts$/, '');
    const v = { ...en, ...(T[locale] ?? {}) };
    const full = path.join(LOCALES_DIR, file);
    let src = await fs.readFile(full, 'utf8');

    const newsOpen = src.match(/^(\s*)news:\s*\{/m);
    if (!newsOpen) {
      console.warn(`skip ${file}: no news namespace`);
      continue;
    }
    if (/\baccount_logos:\s*\{/.test(src)) {
      console.log(`ok ${file}`);
      continue;
    }
    const at = newsOpen.index + newsOpen[0].length;
    src = `${src.slice(0, at)}\n${block(v)}${src.slice(at)}`;
    await fs.writeFile(full, src, 'utf8');
    console.log(`patched ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
