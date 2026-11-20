import { lazy, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations } from '~/types';

// react-native-maps is a native module: loaded only when the map opens, and a
// dev client built without it shows a message instead of crashing the app.
const SpendingMapContent = lazy(() =>
  import('./SpendingMapContent').then((m) => ({ default: m.SpendingMapContent })),
);

interface SpendingMapScreenProps {
  onBack: () => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenLocationSettings: () => void;
}

export function SpendingMapScreen(props: SpendingMapScreenProps) {
  const themeColors = useThemeColors();
  return (
    <View className="flex-1 bg-background">
      <AppErrorBoundary
        fallback={
          <View className="flex-1 justify-center">
            <EmptyState
              title={I18n.t('errors.data_load_failed_title')}
              message={I18n.t('errors.generic_operation_failed')}
              mascotMood="thinking"
              action={{ label: I18n.t('common.back'), onPress: props.onBack }}
            />
          </View>
        }
      >
        <Suspense
          fallback={
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={themeColors.primary} />
            </View>
          }
        >
          <SpendingMapContent {...props} />
        </Suspense>
      </AppErrorBoundary>
    </View>
  );
}
