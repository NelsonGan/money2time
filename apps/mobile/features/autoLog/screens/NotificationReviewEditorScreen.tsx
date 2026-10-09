import React, { useRef } from 'react';

import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import {
  countAccountsTowardFreeLimit,
  isNewTransactionBlockedByAccounts,
} from '~/features/transactions/lib/accountEntryGate';
import { TransactionEntryBlockedScreen } from '~/features/transactions/screens/TransactionEntryBlockedScreen';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { RootStackParamList } from '~/navigation/rootStack';
import { resolveNotificationReviews } from '~/services/notificationReview';

/** A pending capture uses the ordinary editor, but saves through the durable review guard. */
export function NotificationReviewEditorScreen({
  launch,
  onClose,
}: {
  launch: RootStackParamList['NotificationReviewEditor'];
  onClose: () => void;
}) {
  const app = useApp();
  const isPro = useIsPro();
  const live = useRef({ app, isPro });
  live.current = { app, isPro };
  const count = countAccountsTowardFreeLimit(app.accounts);
  if (isNewTransactionBlockedByAccounts(isPro, count)) {
    return <TransactionEntryBlockedScreen activeAccountCount={count} onClose={onClose} />;
  }
  const save = async (input: CreateTransactionInput) => {
    if (input.type !== 'income' && input.type !== 'expense')
      throw new Error(I18n.t('payment_alerts.review_save_error'));
    const result = await resolveNotificationReviews(
      [launch.captureId],
      input.type,
      {
        appUserId: launch.appUserId,
        generation: launch.generation,
        getCurrent: () => ({
          ...live.current.app,
          isPro: live.current.isPro,
          appUserId: live.current.app.settings.appUserId,
        }),
      },
      {
        [launch.captureId]: {
          amount: {
            amount: input.amount,
            currency: input.currency ?? live.current.app.settings.currencyCode,
          },
          accountId: input.accountId ?? null,
          editedInput: input,
        },
      },
    );
    if (result.completed !== 1 || result.unfinished.length)
      throw new Error(I18n.t('payment_alerts.review_save_error'));
  };
  return (
    <TransactionEditorScreen
      mode="edit"
      onClose={onClose}
      onSubmit={() => undefined}
      onSubmitConfirmed={save}
      initialValues={launch.initialValues}
      restrictTypeOptions={['expense', 'income']}
      hideSplitMode
    />
  );
}
