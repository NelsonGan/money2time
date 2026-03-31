import type * as LegacyFileSystem from 'expo-file-system/legacy';

import type { ModelDefinition } from '../constants/models';
import * as modelManager from './modelManager';

type DownloadStateListener = () => void;

interface ActiveModelDownload {
  progress: number;
  task: LegacyFileSystem.DownloadResumable;
  promise: Promise<void>;
}

const activeDownloads = new Map<string, ActiveModelDownload>();
const listeners = new Set<DownloadStateListener>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToDownloadState(listener: DownloadStateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getModelDownloadProgress(modelId: string): number | null {
  return activeDownloads.get(modelId)?.progress ?? null;
}

export function isModelDownloading(modelId: string): boolean {
  return activeDownloads.has(modelId);
}

export async function ensureModelDownloaded(model: ModelDefinition): Promise<void> {
  const existingDownload = activeDownloads.get(model.id);
  if (existingDownload) return existingDownload.promise;
  if (modelManager.isModelDownloaded(model.fileName)) return;

  const task = modelManager.createModelDownload(model, (progress) => {
    const activeDownload = activeDownloads.get(model.id);
    if (!activeDownload || activeDownload.progress === progress) return;
    activeDownload.progress = progress;
    emitChange();
  });

  let promise: Promise<void> = Promise.resolve();
  const activeDownload: ActiveModelDownload = {
    progress: 0,
    task,
    promise,
  };

  promise = (async () => {
    try {
      await task.downloadAsync();
    } catch (error) {
      modelManager.deleteModel(model.fileName);
      throw error;
    } finally {
      if (activeDownloads.get(model.id)?.promise === promise) {
        activeDownloads.delete(model.id);
        emitChange();
      }
    }
  })();

  activeDownload.promise = promise;
  activeDownloads.set(model.id, activeDownload);
  emitChange();

  return promise;
}
