import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { DatePickerModal } from '~/components/datePicker';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal, formatDateInput } from '~/utils/formatters';

import { buildDuplicateInput } from '../lib/duplicateTransaction';

interface DuplicateTransactionsDatePickerProps {
  visible: boolean;
  /** The rows to copy, already filtered to the duplicable ones. */
  transactions: TransactionWithRelations[];
  onClose: () => void;
  /** Ids of the copies, in the order the sources were listed. */
  onDuplicated?: (ids: string[]) => void;
}

/**
 * Asks for the date a set of transactions should be copied to, then writes the
 * copies. Picking a day is the whole interaction: the picker opens on the
 * source's own date, so tapping it straight back gives a plain duplicate.
 */
export function DuplicateTransactionsDatePicker({
  visible,
  transactions,
  onClose,
  onDuplicated,
}: DuplicateTransactionsDatePickerProps) {
  const { createTransaction } = useApp();
  // The modal fades out rather than vanishing, so a second day tap can still
  // land after the first one wrote its copies. One open, one set of copies.
  const wroteRef = useRef(false);
  useEffect(() => {
    if (visible) wroteRef.current = false;
  }, [visible]);

  // The picker speaks day keys; a transaction date is a stored instant.
  const defaultDate = useMemo(() => {
    if (transactions.length === 1) return dayKeyFromIsoLocal(transactions[0].date);
    return formatDateInput(new Date());
  }, [transactions]);

  const handleSelect = useCallback(
    (dayKey: string) => {
      if (wroteRef.current) return;
      if (transactions.length === 0) {
        onClose();
        return;
      }
      wroteRef.current = true;
      const ids = transactions.map((transaction) =>
        createTransaction(buildDuplicateInput(transaction, dayKey)),
      );
      void triggerHaptic('success');
      onClose();
      onDuplicated?.(ids);
    },
    [createTransaction, onClose, onDuplicated, transactions],
  );

  return (
    <DatePickerModal
      visible={visible}
      value={defaultDate}
      title={I18n.t('transactions.selection.duplicate_title')}
      onSelect={handleSelect}
      onClose={onClose}
    />
  );
}
