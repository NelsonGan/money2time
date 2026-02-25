import { useEffect, useMemo, useRef } from 'react';

interface UsePersistedJsonSnapshotOptions<TSnapshot, TParsed> {
  isLoading: boolean;
  storedJson: string | null;
  snapshot: TSnapshot;
  parseStoredJson: (rawValue: string | null) => TParsed | null;
  applyParsedSnapshot: (value: TParsed) => void;
  writeStoredJson: (value: string | null) => void;
}

/**
 * Reusable persisted JSON state bridge.
 * Hydrates once from storage, then writes any in-memory snapshot changes back.
 */
export function usePersistedJsonSnapshot<TSnapshot, TParsed>({
  isLoading,
  storedJson,
  snapshot,
  parseStoredJson,
  applyParsedSnapshot,
  writeStoredJson,
}: UsePersistedJsonSnapshotOptions<TSnapshot, TParsed>) {
  const hasHydratedRef = useRef(false);
  const persistedJsonRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    persistedJsonRef.current = storedJson;

    const parsed = parseStoredJson(storedJson);
    if (parsed) {
      applyParsedSnapshot(parsed);
    }
  }, [applyParsedSnapshot, isLoading, parseStoredJson, storedJson]);

  const serializedSnapshot = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  useEffect(() => {
    if (isLoading || !hasHydratedRef.current) return;
    if (persistedJsonRef.current === serializedSnapshot) return;
    persistedJsonRef.current = serializedSnapshot;
    writeStoredJson(serializedSnapshot);
  }, [isLoading, serializedSnapshot, writeStoredJson]);
}
