import { useContentFrame } from '~/components/layout/ContentFrame';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { wideTabColumns } from '~/utils/adaptiveLayout';

/**
 * Columns and content width for a tab page with a wide layout of its own
 * (Accounts, Albums, Settings): two columns on a wide iPad, one readable
 * column on a narrower one, and the page's usual layout everywhere else.
 */
export function useWideTabColumns() {
  const { wideTabs } = useDeviceLayout();
  const { width } = useContentFrame();
  return wideTabColumns(width, wideTabs);
}
