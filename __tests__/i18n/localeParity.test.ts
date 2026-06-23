import da from '~/lib/i18n/locales/da';
import de from '~/lib/i18n/locales/de';
import en from '~/lib/i18n/locales/en';
import es from '~/lib/i18n/locales/es';
import fil from '~/lib/i18n/locales/fil';
import fr from '~/lib/i18n/locales/fr';
import hi from '~/lib/i18n/locales/hi';
import id from '~/lib/i18n/locales/id';
import itLocale from '~/lib/i18n/locales/it';
import ja from '~/lib/i18n/locales/ja';
import ko from '~/lib/i18n/locales/ko';
import ms from '~/lib/i18n/locales/ms';
import nb from '~/lib/i18n/locales/nb';
import nl from '~/lib/i18n/locales/nl';
import pl from '~/lib/i18n/locales/pl';
import pt from '~/lib/i18n/locales/pt';
import ru from '~/lib/i18n/locales/ru';
import sv from '~/lib/i18n/locales/sv';
import th from '~/lib/i18n/locales/th';
import tr from '~/lib/i18n/locales/tr';
import uk from '~/lib/i18n/locales/uk';
import vi from '~/lib/i18n/locales/vi';
import zh from '~/lib/i18n/locales/zh';

type Tree = { [key: string]: string | Tree };

const LOCALES: Record<string, Tree> = {
  da,
  de,
  es,
  fil,
  fr,
  hi,
  id,
  it: itLocale,
  ja,
  ko,
  ms,
  nb,
  nl,
  pl,
  pt,
  ru,
  sv,
  th,
  tr,
  uk,
  vi,
  zh,
} as unknown as Record<string, Tree>;

function flattenKeys(tree: Tree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

// Interpolation placeholders an entry uses, e.g. {{count}} — these must match
// the English source so I18n.t() substitutions don't silently break.
function placeholders(value: string): string[] {
  return (value.match(/\{\{\s*[\w]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();
}

function flattenEntries(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      Object.assign(out, flattenEntries(value, path));
    } else {
      out[path] = value as string;
    }
  }
  return out;
}

const enKeys = flattenKeys(en as unknown as Tree).sort();
const enKeySet = new Set(enKeys);
const enEntries = flattenEntries(en as unknown as Tree);

describe('locale parity with en', () => {
  for (const [name, tree] of Object.entries(LOCALES)) {
    describe(name, () => {
      const keys = flattenKeys(tree).sort();
      const keySet = new Set(keys);

      it('has no missing keys', () => {
        const missing = enKeys.filter((k) => !keySet.has(k));
        expect(missing).toEqual([]);
      });

      it('has no extra keys', () => {
        const extra = keys.filter((k) => !enKeySet.has(k));
        expect(extra).toEqual([]);
      });

      it('has no empty values', () => {
        const entries = flattenEntries(tree);
        const empty = Object.entries(entries)
          .filter(([, v]) => typeof v === 'string' && v.trim() === '')
          .map(([k]) => k);
        expect(empty).toEqual([]);
      });

      it('preserves interpolation placeholders', () => {
        const entries = flattenEntries(tree);
        const mismatches: string[] = [];
        for (const [key, enValue] of Object.entries(enEntries)) {
          const enPlaceholders = placeholders(enValue);
          if (enPlaceholders.length === 0) continue;
          const localized = entries[key];
          if (typeof localized !== 'string') continue;
          if (placeholders(localized).join(',') !== enPlaceholders.join(',')) {
            mismatches.push(key);
          }
        }
        expect(mismatches).toEqual([]);
      });
    });
  }
});
