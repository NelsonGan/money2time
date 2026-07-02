import React from 'react';
import { Pressable, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { reportError } from '~/services/errorReporting';
import { getErrorMessage } from '~/utils/errorHandling';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
  /** Custom UI to show instead of the default app-level error screen. */
  fallback?: React.ReactNode;
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

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // The boundary swallows the error (shows the fallback), so it never reaches
    // Sentry's global handler on its own — report it here.
    reportError(error, { componentStack: info.componentStack });
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <View className="w-full max-w-[420px] items-center rounded-[24px] border border-border/40 bg-card px-5 py-6">
          <Mascot size={110} name="confused" animate />
          <Text variant="subheading" className="mt-3 text-center">
            {I18n.t('errors.data_load_failed_title')}
          </Text>
          <Text variant="friendly" tone="muted" className="mt-2 text-center">
            {getErrorMessage(this.state.error, I18n.t('errors.generic_operation_failed'))}
          </Text>
          <Pressable
            onPress={this.handleRetry}
            className="mt-5 rounded-full bg-primary px-4 py-2.5"
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
