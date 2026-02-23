import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { I18n } from '~/lib/i18n';
import { getErrorMessage } from '~/utils/errorHandling';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <View className="w-full max-w-[420px] rounded-[24px] border border-border/40 bg-card px-5 py-6">
          <Text variant="subheading">{I18n.t('errors.data_load_failed_title')}</Text>
          <Text variant="friendly" tone="muted" className="mt-2">
            {getErrorMessage(this.state.error, I18n.t('errors.generic_operation_failed'))}
          </Text>
          <Pressable
            onPress={this.handleRetry}
            className="mt-5 self-start rounded-full bg-primary px-4 py-2.5"
          >
            <Text variant="caption" tone="inverse">
              {I18n.t('common.retry')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
}
