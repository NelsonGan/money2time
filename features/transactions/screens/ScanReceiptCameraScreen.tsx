import { useNavigation } from '@react-navigation/native';
import { lazy, Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';

// expo-camera is a native module; lazy-load the camera UI so the rest of the app
// keeps working on a dev client that hasn't been rebuilt with the native pod yet
// (importing expo-camera eagerly touches the native module at startup).
const ScanReceiptCamera = lazy(() =>
  import('~/features/transactions/components/ScanReceiptCamera').then((m) => ({
    default: m.ScanReceiptCamera,
  })),
);

/**
 * Root-stack screen host for the receipt-scan camera. Keeps expo-camera off the
 * cold-start path via a lazy import, and degrades to popping back (rather than
 * crashing the app) if the native camera module is missing on an un-rebuilt
 * dev client.
 */
export function ScanReceiptCameraScreen() {
  return (
    <View className="flex-1 bg-black">
      <AppErrorBoundary fallback={<CameraLoadFailed />}>
        <Suspense
          fallback={
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          }
        >
          <ScanReceiptCamera />
        </Suspense>
      </AppErrorBoundary>
    </View>
  );
}

// If the native camera module can't load (un-rebuilt dev client), don't strand
// the user on a black screen — pop straight back to where they were.
function CameraLoadFailed() {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.goBack();
  }, [navigation]);
  return <View className="flex-1 bg-black" />;
}
