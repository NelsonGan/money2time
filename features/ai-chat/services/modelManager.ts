import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type { ModelDefinition } from '../constants/models';

function getModelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function ensureModelsDir(): void {
  const dir = getModelsDir();
  if (!dir.exists) {
    dir.create();
  }
}

export function getDownloadedModelFileNames(): string[] {
  ensureModelsDir();
  const dir = getModelsDir();
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.gguf'))
    .map((f) => f.name);
}

export function getModelPath(fileName: string): string {
  return new File(getModelsDir(), fileName).uri;
}

export function isModelDownloaded(fileName: string): boolean {
  return new File(getModelsDir(), fileName).exists;
}

export function createModelDownload(
  model: ModelDefinition,
  onProgress: (progress: number) => void,
): LegacyFileSystem.DownloadResumable {
  ensureModelsDir();
  return LegacyFileSystem.createDownloadResumable(
    model.downloadUrl,
    getModelPath(model.fileName),
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesExpectedToWrite > 0
          ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          : 0;
      onProgress(progress);
    },
  );
}

export function deleteModel(fileName: string): void {
  const file = new File(getModelsDir(), fileName);
  if (file.exists) {
    file.delete();
  }
}

export function deleteAllModels(): void {
  getDownloadedModelFileNames().forEach((fileName) => {
    deleteModel(fileName);
  });
}
