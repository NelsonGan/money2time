import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useCloudSync } from '~/features/cloudSync/CloudSyncContext';
import { useSharedLedgers } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { I18n } from '~/lib/i18n';
import type {
  BackupData,
  BackupRestoreOptions,
  ImportResult,
} from '~/services/dataManagementService';
import { restoreLedgerChoices } from '~/utils/backupLedgerPolicy';

import { BackupRestoreSheet } from '../components/BackupRestoreSheet';

interface Pending {
  backup: BackupData;
  resolve: (result: ImportResult) => void;
}

/** Both file import and cloud backup restore share one explicit selection flow. */
export function useBackupRestore() {
  const { user, refreshSharedLedgers, restoreBackup } = useCloudSync();
  const shared = useSharedLedgers();
  const [pending, setPending] = useState<Pending | null>(null);
  const [applying, setApplying] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const mountedRef = useRef(false);
  const applyingRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (!applyingRef.current) {
        pendingRef.current?.resolve({ canceled: true });
        pendingRef.current = null;
      }
    };
  }, []);
  const chooseAndRestore = useCallback(
    async (backup: BackupData): Promise<ImportResult> => {
      if (!mountedRef.current || pendingRef.current) return { canceled: true };
      return new Promise((resolve) => {
        const request = { backup, resolve };
        pendingRef.current = request;
        // Reserve the request before the network read; unmount can cancel it.
        const refresh = user ? refreshSharedLedgers().catch(() => undefined) : Promise.resolve();
        void refresh.then(() => {
          if (mountedRef.current && pendingRef.current === request) setPending(request);
        });
      });
    },
    [user, refreshSharedLedgers],
  );
  const cancel = () => {
    if (applyingRef.current) return;
    pendingRef.current?.resolve({ canceled: true });
    pendingRef.current = null;
    setPending(null);
  };
  const restore = async (options: BackupRestoreOptions) => {
    const request = pendingRef.current;
    if (!request || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    let result: ImportResult;
    try {
      result = await restoreBackup(request.backup, options);
    } catch {
      result = { canceled: false, success: false, error: I18n.t('backup_restore.failed') };
    }
    pendingRef.current = null;
    applyingRef.current = false;
    if (mountedRef.current) {
      setPending(null);
      setApplying(false);
    }
    // The caller presents a native result alert after this sheet dismisses.
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    request.resolve(result);
  };
  return {
    chooseAndRestore,
    restoreSheet: pending ? (
      <BackupRestoreSheet
        exportedAt={pending.backup.exportedAt}
        busy={applying}
        choices={restoreLedgerChoices(pending.backup, shared)}
        onCancel={cancel}
        onRestore={(options) => void restore(options)}
      />
    ) : null,
  };
}
