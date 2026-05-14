export function getLocales() {
  return [
    {
      languageTag: 'en-US',
      languageCode: 'en',
      regionCode: 'US',
      currencyCode: 'USD',
      currencySymbol: '$',
      decimalSeparator: '.',
      digitGroupingSeparator: ',',
      textDirection: 'ltr',
      measurementSystem: 'us',
      temperatureUnit: 'fahrenheit',
    },
  ];
}

export function getCalendars() {
  return [{ calendar: 'gregorian', timeZone: 'America/Los_Angeles', uses24hourClock: false, firstWeekday: 1 }];
}
