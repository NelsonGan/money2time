import { useMemo } from 'react';

import {
  type LogoCatalog,
  LogoPickerSheet,
  type LogoPickerSheetProps,
} from '~/components/ui/LogoPickerSheet';
import { SubscriptionLogo } from '~/components/ui/SubscriptionLogo';
import {
  DEFAULT_SUBSCRIPTION_COUNTRY,
  getSubscriptionCountryFlag,
  getSubscriptionLogosForCountry,
  regionToSubscriptionCountry,
  searchSubscriptionLogos,
  SUBSCRIPTION_LOGO_COUNTRIES,
} from '~/constants/subscriptionLogos';
import { useProGate } from '~/hooks/useProGate';
import { listCustomSubscriptionLogos, saveCustomSubscriptionLogo } from '~/services/userAssets';

/**
 * Brand marks for a recurring rule. The library grid leads with "None" so a
 * rule that picked up a logo (from the picker or the name-based suggestion)
 * can always drop it again.
 */
export function SubscriptionLogoPickerSheet(props: LogoPickerSheetProps) {
  const { isPro, requirePro } = useProGate();
  const catalog = useMemo<LogoCatalog>(
    () => ({
      countries: SUBSCRIPTION_LOGO_COUNTRIES,
      defaultCountry: DEFAULT_SUBSCRIPTION_COUNTRY,
      getFlag: getSubscriptionCountryFlag,
      getLogosForCountry: getSubscriptionLogosForCountry,
      search: searchSubscriptionLogos,
      regionToCountry: regionToSubscriptionCountry,
      countrySetting: 'subscriptionLogoCountry',
      Logo: SubscriptionLogo,
      listCustom: listCustomSubscriptionLogos,
      saveCustom: saveCustomSubscriptionLogo,
      // Pro from the first upload, like the category-icon picker.
      canUpload: () => requirePro('custom_subscription_logos'),
      // The tile says so up front rather than letting a free user tap into a paywall.
      uploadLabelKey: isPro ? 'accounts.logo.upload' : 'accounts.logo.upload_pro',
      searchPlaceholderKey: 'recurring.logo.search_placeholder',
      noneOption: true,
    }),
    [isPro, requirePro],
  );
  return <LogoPickerSheet catalog={catalog} {...props} />;
}
