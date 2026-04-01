export interface ModelDefinition {
  id: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  sizeLabel: string;
}

export const AVAILABLE_MODELS: ModelDefinition[] = [
  {
    id: 'lfm2.5-1.2b-q4km',
    displayName: 'LFM2.5 1.2B (Fine-tuned)',
    fileName: 'LFM2.5-1.2B-Instruct.Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/NelsonGan/lfm2.5-finance-tracker-gguf/resolve/main/LFM2.5-1.2B-Instruct.Q4_K_M.gguf',
    sizeLabel: '~731 MB',
  },
  {
    id: 'qwen2.5-1.5b-q4km',
    displayName: 'Qwen 2.5 1.5B',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeLabel: '~1.1 GB',
  },
];

export const AI_CHAT_DEFAULT_MODEL = AVAILABLE_MODELS[0];

export function getModelById(id: string): ModelDefinition | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
