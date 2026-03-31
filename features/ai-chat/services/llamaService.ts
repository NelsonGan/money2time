import { initLlama, type LlamaContext } from 'llama.rn';

import { TRANSACTION_JSON_SCHEMA } from '../constants/prompts';

let context: LlamaContext | null = null;
let currentModelPath: string | null = null;
let loadPromise: Promise<void> | null = null;
let loadPromiseModelPath: string | null = null;
let primePromise: Promise<void> | null = null;
const MAX_GENERATION_TOKENS = 256;
const COMPLETION_TIMEOUT_MS = 25_000;
const INITIAL_COMPLETION_TIMEOUT_MS = 60_000;
const MODEL_WARMUP_TIMEOUT_MS = 45_000;
const MODEL_WARMUP_TOKENS = 1;
const MODEL_PRIME_TOKENS = 1;
const COMPLETION_STOP_TOKENS = ['</s>', '<|endoftext|>', '<|im_end|>'] as const;
const WARMUP_SYSTEM_PROMPT =
  'You are warming a financial transaction parser. Parse the user message into a JSON object matching the schema. Return a single expense transaction, use null for unknown account or category fields, and keep the note from the user message.';
const WARMUP_USER_PROMPT = '30 for breakfast';

export type LlamaServiceStatus = 'idle' | 'loading' | 'ready' | 'error';
type BusyStateListener = (isBusy: boolean) => void;
type StatusListener = () => void;

let status: LlamaServiceStatus = 'idle';
let statusError: string | null = null;
let hasCompletedSinceLoad = false;
let hasPrimedTransactionParserSinceLoad = false;
let activeCompletionCount = 0;
const busyStateListeners = new Set<BusyStateListener>();
const statusListeners = new Set<StatusListener>();

class CompletionTimeoutError extends Error {
  constructor() {
    super('AI chat generation timed out');
    this.name = 'CompletionTimeoutError';
  }
}

class ContextBusyError extends Error {
  constructor() {
    super('Context is busy');
    this.name = 'ContextBusyError';
  }
}

export function getStatus(): { status: LlamaServiceStatus; error: string | null } {
  return { status, error: statusError };
}

export function subscribeToStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function emitStatusChange(): void {
  statusListeners.forEach((listener) => listener());
}

export function isContextBusy(): boolean {
  return activeCompletionCount > 0;
}

export function isContextBusyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Context is busy');
}

export function subscribeToBusyState(listener: BusyStateListener): () => void {
  busyStateListeners.add(listener);
  listener(isContextBusy());

  return () => {
    busyStateListeners.delete(listener);
  };
}

function updateBusyState(delta: 1 | -1): void {
  const previous = isContextBusy();
  activeCompletionCount = Math.max(0, activeCompletionCount + delta);
  const next = isContextBusy();

  if (previous === next) return;
  busyStateListeners.forEach((listener) => listener(next));
}

export async function loadModel(modelPath: string): Promise<void> {
  if (context && currentModelPath === modelPath && status === 'ready') return;
  if (loadPromise && loadPromiseModelPath === modelPath) return loadPromise;

  status = 'loading';
  statusError = null;
  loadPromiseModelPath = modelPath;
  emitStatusChange();

  let pendingLoad: Promise<void> | null = null;
  pendingLoad = (async () => {
    if (context) {
      try {
        await context.release();
      } catch {
        // ignore release errors
      }
      context = null;
      currentModelPath = null;
    }

    try {
      context = await initLlama({
        model: modelPath,
        n_ctx: 2048,
        n_gpu_layers: 0,
        use_mlock: true,
      });
      currentModelPath = modelPath;
      hasCompletedSinceLoad = false;
      hasPrimedTransactionParserSinceLoad = false;
      primePromise = null;
      await warmModel();
      status = 'ready';
      emitStatusChange();
    } catch (e) {
      status = 'error';
      statusError = e instanceof Error ? e.message : 'Failed to load model';
      emitStatusChange();
      throw e;
    } finally {
      if (loadPromise === pendingLoad) {
        loadPromise = null;
        loadPromiseModelPath = null;
      }
    }
  })();

  loadPromise = pendingLoad;
  return pendingLoad;
}

export async function releaseModel(): Promise<void> {
  loadPromise = null;
  loadPromiseModelPath = null;
  primePromise = null;
  activeCompletionCount = 0;
  busyStateListeners.forEach((listener) => listener(false));
  if (context) {
    try {
      await context.release();
    } catch {
      // ignore release errors
    }
    context = null;
    currentModelPath = null;
  }
  status = 'idle';
  statusError = null;
  hasCompletedSinceLoad = false;
  hasPrimedTransactionParserSinceLoad = false;
  emitStatusChange();
}

function buildChatMLPrompt(systemPrompt: string, userMessage: string): string {
  return (
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userMessage}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

export async function generateTransactions(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  if (!context) throw new Error('Model not loaded');

  const prompt = buildChatMLPrompt(systemPrompt, userMessage);
  const timeoutMs = hasCompletedSinceLoad ? COMPLETION_TIMEOUT_MS : INITIAL_COMPLETION_TIMEOUT_MS;

  const result = await completeTransactionPrompt(prompt, timeoutMs);
  hasCompletedSinceLoad = true;
  return result;
}

async function completeWithTimeout(
  params: Parameters<LlamaContext['completion']>[0],
  timeoutMs: number = COMPLETION_TIMEOUT_MS,
): Promise<string> {
  if (!context) throw new Error('Model not loaded');
  if (isContextBusy()) throw new ContextBusyError();

  const activeContext = context;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  updateBusyState(1);

  try {
    const result = await Promise.race([
      activeContext.completion(params),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            void Promise.resolve(activeContext.stopCompletion()).catch(() => {
              // ignore stop errors after timeout
            });
          } catch {
            // ignore sync stop errors after timeout
          }
          reject(new CompletionTimeoutError());
        }, timeoutMs);
      }),
    ]);

    if (result.interrupted) {
      throw new CompletionTimeoutError();
    }

    return result.text;
  } catch (error) {
    if (isContextBusyError(error)) {
      throw new ContextBusyError();
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    updateBusyState(-1);
  }
}

async function warmModel(): Promise<void> {
  if (!context) return;

  try {
    const prompt = buildChatMLPrompt(WARMUP_SYSTEM_PROMPT, WARMUP_USER_PROMPT);
    await completeWithTimeout(
      {
        prompt,
        n_predict: MODEL_WARMUP_TOKENS,
        temperature: 0.1,
        top_p: 0.9,
        stop: [...COMPLETION_STOP_TOKENS],
      },
      MODEL_WARMUP_TIMEOUT_MS,
    );
    hasCompletedSinceLoad = true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[llamaService] model warmup failed:', detail);
  }
}

export async function primeTransactionParser(
  systemPrompt: string,
  userMessage: string = WARMUP_USER_PROMPT,
): Promise<void> {
  if (!context) throw new Error('Model not loaded');
  if (hasPrimedTransactionParserSinceLoad) return;
  if (primePromise) return primePromise;

  const pendingPrime = (async () => {
    const prompt = buildChatMLPrompt(systemPrompt, userMessage);
    await completeTransactionPrompt(prompt, INITIAL_COMPLETION_TIMEOUT_MS, MODEL_PRIME_TOKENS);
    hasCompletedSinceLoad = true;
    hasPrimedTransactionParserSinceLoad = true;
  })();

  primePromise = pendingPrime;

  try {
    await pendingPrime;
  } finally {
    if (primePromise === pendingPrime) {
      primePromise = null;
    }
  }
}

async function completeTransactionPrompt(
  prompt: string,
  timeoutMs: number,
  nPredict: number = MAX_GENERATION_TOKENS,
): Promise<string> {
  const baseCompletionParams = {
    prompt,
    n_predict: nPredict,
    temperature: 0.1,
    top_p: 0.9,
    stop: [...COMPLETION_STOP_TOKENS],
  };

  try {
    return await completeWithTimeout(
      {
        ...baseCompletionParams,
        response_format: {
          type: 'json_schema',
          json_schema: {
            strict: true,
            schema: JSON.parse(TRANSACTION_JSON_SCHEMA),
          },
        },
      },
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof CompletionTimeoutError) {
      throw error;
    }

    console.warn('[llamaService] json_schema failed, retrying without constraint:', error);
    return completeWithTimeout(baseCompletionParams, timeoutMs);
  }
}
