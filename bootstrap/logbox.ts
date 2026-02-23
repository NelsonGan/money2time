import { LogBox } from 'react-native';

// Some dependencies still emit this RN deprecation warning even though the app
// itself uses react-native-safe-area-context.
LogBox.ignoreLogs([
  "SafeAreaView has been deprecated and will be removed in a future release. Please use 'react-native-safe-area-context' instead.",
]);
