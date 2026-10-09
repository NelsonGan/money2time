import { useMemo } from 'react';

import { AccountLogo } from '~/components/ui/AccountLogo';
import {
  type LogoCatalog,
  LogoPickerSheet,
  type LogoPickerSheetProps,
} from '~/components/ui/LogoPickerSheet';
import {
  ACCOUNT_LOGO_COUNTRIES,
  DEFAULT_LOGO_COUNTRY,
  getCountryFlag,
  getLogosForCountry,
  regionToCountrySlug,
  searchAccountLogos,
} from '~/constants/accountLogos';
import { useProGate } from '~/hooks/useProGate';
import { listCustomAccountLogos, saveCustomAccountLogo } from '~/services/userAssets';

/** Bank logos for an account. */
export function AccountLogoPickerSheet(props: LogoPickerSheetProps) {
  const { checkLimit } = useProGate();
  const catalog = useMemo<LogoCatalog>(
    () => ({
      countries: ACCOUNT_LOGO_COUNTRIES,
      defaultCountry: DEFAULT_LOGO_COUNTRY,
      getFlag: getCountryFlag,
      getLogosForCountry,
      search: searchAccountLogos,
      regionToCountry: regionToCountrySlug,
      countrySetting: 'accountLogoCountry',
      Logo: AccountLogo,
      listCustom: listCustomAccountLogos,
      saveCustom: saveCustomAccountLogo,
      // Free users can keep up to FREE_MAX_CUSTOM_LOGOS uploads.
      canUpload: (customCount) => checkLimit('custom_logos', customCount),
      uploadLabelKey: 'accounts.logo.upload',
      searchPlaceholderKey: 'accounts.logo.search_placeholder',
    }),
    [checkLimit],
  );
  return <LogoPickerSheet catalog={catalog} {...props} />;
}
