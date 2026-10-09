import './bootstrap/perfStart';
import 'react-native-gesture-handler';
import './bootstrap/logbox';

import { registerRootComponent } from 'expo';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

import App from './App';
import { perfMark } from './utils/perfTrace';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

perfMark('index_eval');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
