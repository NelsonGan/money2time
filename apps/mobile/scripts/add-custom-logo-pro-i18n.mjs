// One-off: inserts pro.custom_logos_label and pro.limit_custom_logos into the
// `pro` namespace of every locale file. Idempotent. Falls back to English.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../lib/i18n/locales');

const KEYS = ['custom_logos_label', 'limit_custom_logos'];

const en = {
  custom_logos_label: 'Custom logos',
  limit_custom_logos:
    'You can upload up to {{count}} custom logos on the free plan. Upgrade to Pro for unlimited.',
};

const T = {
  en,
  zh: {
    custom_logos_label: '自定义标志',
    limit_custom_logos: '免费版最多可上传 {{count}} 个自定义标志。升级到 Pro 即可无限使用。',
  },
  es: {
    custom_logos_label: 'Logos personalizados',
    limit_custom_logos:
      'Puedes subir hasta {{count}} logos personalizados en el plan gratuito. Hazte Pro para ilimitados.',
  },
  fr: {
    custom_logos_label: 'Logos personnalisés',
    limit_custom_logos:
      'Vous pouvez importer jusqu’à {{count}} logos personnalisés avec le plan gratuit. Passez à Pro pour un nombre illimité.',
  },
  de: {
    custom_logos_label: 'Eigene Logos',
    limit_custom_logos:
      'Im kostenlosen Plan kannst du bis zu {{count}} eigene Logos hochladen. Mit Pro unbegrenzt.',
  },
  pt: {
    custom_logos_label: 'Logos personalizados',
    limit_custom_logos:
      'Você pode enviar até {{count}} logos personalizados no plano gratuito. Assine o Pro para ilimitados.',
  },
  it: {
    custom_logos_label: 'Logo personalizzati',
    limit_custom_logos:
      'Puoi caricare fino a {{count}} logo personalizzati nel piano gratuito. Passa a Pro per illimitati.',
  },
  nl: {
    custom_logos_label: 'Aangepaste logo’s',
    limit_custom_logos:
      'Je kunt tot {{count}} aangepaste logo’s uploaden in het gratis abonnement. Upgrade naar Pro voor onbeperkt.',
  },
  ja: {
    custom_logos_label: 'カスタムロゴ',
    limit_custom_logos:
      '無料プランではカスタムロゴを {{count}} 個までアップロードできます。Pro にアップグレードすると無制限です。',
  },
  ko: {
    custom_logos_label: '사용자 지정 로고',
    limit_custom_logos:
      '무료 플랜에서는 사용자 지정 로고를 최대 {{count}}개 업로드할 수 있습니다. Pro로 업그레이드하면 무제한입니다.',
  },
  ru: {
    custom_logos_label: 'Свои логотипы',
    limit_custom_logos:
      'В бесплатном плане можно загрузить до {{count}} своих логотипов. Оформите Pro для безлимита.',
  },
  th: {
    custom_logos_label: 'โลโก้ที่กำหนดเอง',
    limit_custom_logos:
      'แผนฟรีอัปโหลดโลโก้ที่กำหนดเองได้สูงสุด {{count}} รายการ อัปเกรดเป็น Pro เพื่อใช้ได้ไม่จำกัด',
  },
  tr: {
    custom_logos_label: 'Özel logolar',
    limit_custom_logos:
      'Ücretsiz planda en fazla {{count}} özel logo yükleyebilirsiniz. Sınırsız için Pro’ya geçin.',
  },
  uk: {
    custom_logos_label: 'Власні логотипи',
    limit_custom_logos:
      'У безкоштовному плані можна завантажити до {{count}} власних логотипів. Перейдіть на Pro для безлімітного використання.',
  },
  vi: {
    custom_logos_label: 'Logo tùy chỉnh',
    limit_custom_logos:
      'Gói miễn phí cho phép tải lên tối đa {{count}} logo tùy chỉnh. Nâng cấp Pro để dùng không giới hạn.',
  },
  id: {
    custom_logos_label: 'Logo khusus',
    limit_custom_logos:
      'Paket gratis dapat mengunggah hingga {{count}} logo khusus. Tingkatkan ke Pro untuk tanpa batas.',
  },
  ms: {
    custom_logos_label: 'Logo tersuai',
    limit_custom_logos:
      'Pelan percuma boleh memuat naik sehingga {{count}} logo tersuai. Naik taraf ke Pro untuk tanpa had.',
  },
  fil: {
    custom_logos_label: 'Custom na logo',
    limit_custom_logos:
      'Sa libreng plan, makaka-upload ka ng hanggang {{count}} custom na logo. Mag-Pro para walang limitasyon.',
  },
  hi: {
    custom_logos_label: 'कस्टम लोगो',
    limit_custom_logos:
      'फ्री प्लान में आप {{count}} कस्टम लोगो तक अपलोड कर सकते हैं। अनलिमिटेड के लिए Pro लें।',
  },
  da: {
    custom_logos_label: 'Tilpassede logoer',
    limit_custom_logos:
      'Du kan uploade op til {{count}} tilpassede logoer på gratisplanen. Opgrader til Pro for ubegrænset.',
  },
  nb: {
    custom_logos_label: 'Egendefinerte logoer',
    limit_custom_logos:
      'Du kan laste opp opptil {{count}} egendefinerte logoer i gratisplanen. Oppgrader til Pro for ubegrenset.',
  },
  sv: {
    custom_logos_label: 'Anpassade loggor',
    limit_custom_logos:
      'Du kan ladda upp upp till {{count}} anpassade loggor i gratisplanen. Uppgradera till Pro för obegränsat.',
  },
  pl: {
    custom_logos_label: 'Własne logo',
    limit_custom_logos:
      'W planie darmowym możesz przesłać do {{count}} własnych logo. Przejdź na Pro, aby mieć bez limitu.',
  },
};

const esc = (s) => s.replace(/'/g, "\\'");

async function main() {
  const files = (await fs.readdir(LOCALES_DIR)).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const locale = file.replace(/\.ts$/, '');
    const values = { ...en, ...(T[locale] ?? {}) };
    const full = path.join(LOCALES_DIR, file);
    let src = await fs.readFile(full, 'utf8');

    const proOpen = src.match(/^(\s*)pro:\s*\{/m);
    if (!proOpen) {
      console.warn(`skip ${file}: no pro namespace`);
      continue;
    }
    const at = proOpen.index + proOpen[0].length;
    let insert = '';
    for (const key of KEYS) {
      if (new RegExp(`\\b${key}:`).test(src)) continue;
      insert += `\n    ${key}: '${esc(values[key])}',`;
    }
    if (!insert) {
      console.log(`ok ${file}`);
      continue;
    }
    src = `${src.slice(0, at)}${insert}${src.slice(at)}`;
    await fs.writeFile(full, src, 'utf8');
    console.log(`patched ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
