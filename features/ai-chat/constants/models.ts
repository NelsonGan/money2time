export interface ModelDefinition {
  id: string;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  sizeLabel: string;
}

export const AI_CHAT_MODEL: ModelDefinition = {
  id: 'lfm2.5-350m-q4km',
  displayName: 'LFM2.5 350M (Base)',
  fileName: 'LFM2.5-350M-Base.Q4_K_M.gguf',
  downloadUrl:
    'https://huggingface.co/NelsonGan/lfm2.5-finance-tracker-gguf/resolve/main/LFM2.5-350M-Base.Q4_K_M.gguf',
  sizeLabel: '~222 MB',
};
