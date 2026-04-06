export interface ModelDefinition {
  id: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  sizeLabel: string;
}

export const AVAILABLE_MODELS: ModelDefinition[] = [
  {
    id: 'lfm2.5-350m-base-q4km',
    displayName: 'Basic',
    fileName: 'LFM2.5-350M-Base.Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/NelsonGan/lfm2.5-finance-tracker-gguf/resolve/main/LFM2.5-350M-Base.Q4_K_M.gguf',
    sizeLabel: '~222 MB',
  },
  {
    id: 'gemma-4-e2b-it-q3km',
    displayName: 'Advanced',
    fileName: 'gemma-4-E2B-it-Q3_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q3_K_M.gguf',
    sizeLabel: '~3.4 GB',
  },
];

export const AI_CHAT_DEFAULT_MODEL = AVAILABLE_MODELS[0]!;

export function getModelById(id: string): ModelDefinition | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
