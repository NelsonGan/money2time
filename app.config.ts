import type { ExpoConfig, ConfigContext } from 'expo/config';

const appJson = require('./app.json') as { expo: ExpoConfig };
const baseConfig = appJson.expo;

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...baseConfig,
    ...config,
  };
};
