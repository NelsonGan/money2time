import {
  AlarmClock,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarClock,
  Camera,
  CircleCheck,
  CircleX,
  Clock3,
  CloudUpload,
  Coins,
  CreditCard,
  Crown,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  FolderTree,
  Frown,
  Gift,
  HandCoins,
  Heart,
  Home,
  ImagePlus,
  Images,
  Landmark,
  LayoutGrid,
  LineChart,
  ListChecks,
  type LucideIcon,
  Meh,
  MessageCircle,
  Mic,
  MousePointerClick,
  Newspaper,
  Nfc,
  Package,
  Palette,
  Pencil,
  PieChart,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCcw,
  Repeat2,
  Scale,
  ScanLine,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Smile,
  SplitSquareHorizontal,
  SquarePlus,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react-native';

import type { ClayIconName } from './clayIcons.generated';

/**
 * Which theme colour a flat icon is drawn in. Clay carries its own colour, so
 * these tones only exist on the flat side.
 */
export type FlatIconTone = 'primary' | 'text' | 'muted' | 'success' | 'destructive' | 'white';

export interface FlatIconSpec {
  icon: LucideIcon;
  tone?: FlatIconTone;
  strokeWidth?: number;
  /** Draw the glyph solid as well as stroked (an active tab, a Pro crown). */
  filled?: boolean;
}

/**
 * The flat line icon each clay illustration stands in for, used when the user
 * sets `iconStyle: 'flat'` (see `~/components/ui/ClayIcon`).
 *
 * Where the clay adoption replaced a specific Lucide icon, this map names that
 * exact icon so flat mode restores what was there before, not an approximation.
 * The handful of clay names that had no flat predecessor get the closest
 * Lucide equivalent. A call site whose old icon differed from the entry here
 * (the same clay art is reused in more than one place) passes its own `flat`
 * override rather than bending this map.
 *
 * `tone` is the *default* colour; every site can override it, and the sizes
 * stay at the call sites since flat line art reads at roughly 60-75% of the
 * clay size and the exact ratio differed per surface.
 */
export const FLAT_ICON_FOR_CLAY: Record<ClayIconName, FlatIconSpec> = {
  // entry/ — transaction-editor and quick-add affordances
  'entry/add-square': { icon: SquarePlus, tone: 'primary' },
  'entry/close-round': { icon: CircleX, tone: 'muted' },
  'entry/image-plus': { icon: ImagePlus, tone: 'primary' },
  'entry/keypad': { icon: Zap, tone: 'primary' },
  'entry/mic': { icon: Mic, tone: 'primary' },
  'entry/pencil-edit': { icon: Pencil, tone: 'primary' },
  'entry/press-button': { icon: MousePointerClick, tone: 'primary' },
  'entry/scan-receipt': { icon: ScanLine, tone: 'primary' },
  'entry/settings-sliders': { icon: SlidersHorizontal, tone: 'primary' },
  'entry/split-notes': { icon: SplitSquareHorizontal, tone: 'primary' },

  // insights/ — the insight-type art. The selector itself keeps its clay
  // illustrations either way (it reads them through `constants/utilityIcons`),
  // so these only cover the few places a ClayIcon draws one directly.
  'insights/calendar-clock': { icon: CalendarClock, tone: 'primary' },
  'insights/growth-analysis': { icon: TrendingUp, tone: 'primary' },
  'insights/home-savings': { icon: PiggyBank, tone: 'primary' },
  'insights/market-analysis': { icon: LineChart, tone: 'primary' },
  'insights/money-bags': { icon: Wallet, tone: 'primary' },
  'insights/mood-faces': { icon: Smile, tone: 'primary' },
  'insights/pie-chart': { icon: PieChart, tone: 'primary' },
  'insights/piggy-bank-coins': { icon: PiggyBank, tone: 'primary' },
  'insights/profit-analysis': { icon: BarChart3, tone: 'primary' },
  'insights/property-listing': { icon: Home, tone: 'primary' },
  'insights/receipt-scan': { icon: Camera, tone: 'primary' },
  'insights/revenue-growth': { icon: TrendingUp, tone: 'primary' },
  'insights/time-money': { icon: Clock3, tone: 'primary' },
  'insights/wallet-cash-blue': { icon: Wallet, tone: 'primary' },
  'insights/wallet-cash': { icon: Wallet, tone: 'primary' },

  // money-time/
  'money-time/alarm-clock-coin': { icon: AlarmClock, tone: 'primary' },
  'money-time/balance-scale': { icon: Scale, tone: 'primary' },
  'money-time/calendar-clock': { icon: CalendarClock, tone: 'primary' },
  'money-time/card': { icon: CreditCard, tone: 'primary' },
  'money-time/chart-up': { icon: TrendingUp, tone: 'success' },
  'money-time/donut-chart': { icon: PieChart, tone: 'primary' },
  'money-time/invoice': { icon: FileText, tone: 'primary' },
  'money-time/receipt': { icon: ReceiptText, tone: 'primary' },
  'money-time/split-bill': { icon: SplitSquareHorizontal, tone: 'primary' },
  'money-time/transfer': { icon: ArrowLeftRight, tone: 'primary' },
  'money-time/wallet-in': { icon: ArrowDownLeft, tone: 'success' },
  'money-time/wallet-out': { icon: ArrowUpRight, tone: 'destructive' },

  // nav/ — the bottom bar draws its own flat SVGs (components/icons/NavIcons)
  // so the tint-and-fill active state comes back with them; these entries
  // cover the other places nav art is reused.
  'nav/add-active': { icon: Plus, tone: 'white', strokeWidth: 2.8 },
  'nav/grid': { icon: LayoutGrid, tone: 'muted' },
  'nav/home-active': { icon: Home, tone: 'primary', filled: true },
  'nav/home': { icon: Home, tone: 'muted' },
  'nav/insights-active': { icon: PieChart, tone: 'primary', filled: true },
  'nav/insights': { icon: PieChart, tone: 'muted' },
  'nav/settings-active': { icon: Settings, tone: 'primary', filled: true },
  'nav/settings': { icon: Settings, tone: 'muted' },
  'nav/wallet-active': { icon: Wallet, tone: 'primary', filled: true },
  'nav/wallet': { icon: Wallet, tone: 'muted' },

  // sentiment/ — SentimentIcons redraws its own flat faces, so these are the
  // fallback for anywhere else a sentiment glyph is asked for by name.
  'sentiment/happy': { icon: Smile, tone: 'success' },
  'sentiment/neutral': { icon: Meh, tone: 'muted' },
  'sentiment/regret': { icon: Frown, tone: 'destructive' },

  // settings/ — one per SettingsGridTile, restoring the exact pre-clay icons
  'settings/account-settings': { icon: SlidersHorizontal, tone: 'primary' },
  'settings/accounts': { icon: Landmark, tone: 'primary' },
  'settings/albums': { icon: Images, tone: 'primary' },
  'settings/app-lock': { icon: Fingerprint, tone: 'primary' },
  'settings/auto-log': { icon: Nfc, tone: 'primary' },
  'settings/budget': { icon: PiggyBank, tone: 'primary' },
  'settings/categories': { icon: FolderTree, tone: 'primary' },
  'settings/contact': { icon: MessageCircle, tone: 'primary' },
  'settings/data-management': { icon: DatabaseBackup, tone: 'primary' },
  'settings/display': { icon: Palette, tone: 'primary' },
  'settings/exchange-rates': { icon: Coins, tone: 'primary' },
  'settings/hourly-value': { icon: Clock3, tone: 'primary' },
  'settings/items': { icon: Package, tone: 'primary' },
  'settings/news': { icon: Newspaper, tone: 'primary' },
  'settings/notifications': { icon: Bell, tone: 'primary' },
  'settings/pro': { icon: Crown, tone: 'primary' },
  'settings/profile': { icon: UserRound, tone: 'primary' },
  'settings/quick-entry': { icon: Zap, tone: 'primary' },
  'settings/rate': { icon: Heart, tone: 'primary' },
  'settings/receipts': { icon: ReceiptText, tone: 'primary' },
  'settings/recurring': { icon: Repeat2, tone: 'primary' },
  'settings/replay': { icon: RefreshCcw, tone: 'primary' },
  'settings/settle-up': { icon: HandCoins, tone: 'primary' },
  'settings/share-earn': { icon: Gift, tone: 'primary' },
  'settings/statement-import': { icon: FileText, tone: 'primary' },

  // status/ — empty-state and warning art
  'status/cloud-upload': { icon: CloudUpload, tone: 'primary' },
  'status/goal-target': { icon: Target, tone: 'primary' },
  'status/success': { icon: CircleCheck, tone: 'success' },

  // ui/ — generic interface chrome
  'ui/calendar': { icon: Calendar, tone: 'primary' },
  'ui/checklist': { icon: ListChecks, tone: 'primary' },
  'ui/eye-off': { icon: EyeOff, tone: 'muted' },
  'ui/eye': { icon: Eye, tone: 'muted' },
  'ui/filter-sliders': { icon: SlidersHorizontal, tone: 'primary' },
  'ui/search': { icon: Search, tone: 'primary' },
  'ui/settings': { icon: Settings, tone: 'muted' },
  'ui/share': { icon: Share2, tone: 'primary' },
};

/**
 * Flat line art reads noticeably smaller than the clay illustration it stands
 * in for, because clay art is padded inside its own square while a Lucide glyph
 * fills its box. Sites that had a documented pre-clay size pass `flatSize`;
 * everything else lands here.
 */
export const DEFAULT_FLAT_SIZE_RATIO = 0.72;
