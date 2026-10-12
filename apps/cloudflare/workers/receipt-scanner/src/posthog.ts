// PostHog AI observability for receipt scanning. Each OpenRouter call becomes
// one `$ai_generation` event, grouped into a trace per scan request (the
// `reqId`), and attributed to the same pseudonymous `m2t_<uuid>` the app
// identifies PostHog with, so a scan's model calls sit next to the app's
// `Receipt Scan Completed` / `Receipt Scan Failed` for the same person.
//
// Privacy: the receipt image, the prompt (which carries the user's category
// and account names) and the model's answer (amounts, merchants, notes) never
// leave the Worker. Generations carry only metadata: model, tokens, cost,
// latency, status and a short error message.
//
// Cost: AI observability bills per event (100K free a month), so there is no
// separate `$ai_trace` event; PostHog derives the trace from `$ai_trace_id`.

const POSTHOG_BATCH_PATH = '/batch/';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const ERROR_MESSAGE_LIMIT = 200;

export interface PostHogEnv {
  /** Public project token (write-only ingestion key). Unset disables capture. */
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
}

/** OpenRouter's usage block; `cost` is in USD credits when usage accounting is on. */
export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface GenerationRecord {
  model: string;
  /** e.g. `receipt_scan_quick`. */
  spanName: string;
  startedAt: number;
  endedAt: number;
  httpStatus?: number;
  usage?: OpenRouterUsage;
  temperature: number;
  maxTokens: number;
  isBackupModel: boolean;
  /** Which empty-result attempt this call belonged to (0 = first). */
  attempt: number;
  error?: string;
}

interface CapturedEvent {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Collects one scan request's generations and sends them in a single batch. */
export class AiTrace {
  private readonly events: CapturedEvent[] = [];

  constructor(
    readonly traceId: string,
    private readonly distinctId: string,
    private readonly context: Record<string, string | number | boolean>,
  ) {}

  recordGeneration(record: GenerationRecord): void {
    const inputTokens = finite(record.usage?.prompt_tokens);
    const outputTokens = finite(record.usage?.completion_tokens);
    const cost = finite(record.usage?.cost);
    const cachedTokens = finite(record.usage?.prompt_tokens_details?.cached_tokens);
    const properties: Record<string, unknown> = {
      $ai_trace_id: this.traceId,
      $ai_span_name: record.spanName,
      $ai_model: record.model,
      $ai_provider: 'openrouter',
      $ai_base_url: OPENROUTER_BASE_URL,
      $ai_latency: (record.endedAt - record.startedAt) / 1000,
      $ai_temperature: record.temperature,
      $ai_max_tokens: record.maxTokens,
      $ai_stream: false,
      $ai_is_error: Boolean(record.error),
      // Content is deliberately withheld (see the header); the shapes stay so
      // PostHog's trace view still renders the call.
      $ai_input: [{ role: 'user', content: '[receipt image and prompt withheld]' }],
      $ai_output_choices: record.error
        ? []
        : [{ role: 'assistant', content: '[scan result withheld]' }],
      is_backup_model: record.isBackupModel,
      attempt: record.attempt,
      ...this.context,
    };
    if (record.httpStatus !== undefined) properties.$ai_http_status = record.httpStatus;
    if (inputTokens !== undefined) properties.$ai_input_tokens = inputTokens;
    if (outputTokens !== undefined) properties.$ai_output_tokens = outputTokens;
    if (cachedTokens !== undefined) properties.$ai_cache_read_input_tokens = cachedTokens;
    if (cost !== undefined) {
      // OpenRouter reports the real charge, so PostHog should not re-price it.
      properties.$ai_total_cost_usd = cost;
      properties.$ai_cost_passthrough = true;
    }
    if (record.error) properties.$ai_error = record.error.slice(0, ERROR_MESSAGE_LIMIT);

    this.events.push({
      event: '$ai_generation',
      distinct_id: this.distinctId,
      timestamp: new Date(record.startedAt).toISOString(),
      properties,
    });
  }

  /** Add outcome properties (e.g. how many transactions parsed) to the latest generation. */
  annotateLatest(properties: Record<string, string | number | boolean>): void {
    const latest = this.events[this.events.length - 1];
    if (latest) Object.assign(latest.properties, properties);
  }

  get size(): number {
    return this.events.length;
  }

  /** Send everything recorded. Never throws: observability must not fail a scan. */
  async flush(env: PostHogEnv): Promise<void> {
    const token = env.POSTHOG_PROJECT_TOKEN?.trim();
    if (!token || this.events.length === 0) return;
    const host = (env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
    try {
      const res = await fetch(`${host}${POSTHOG_BATCH_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: token, batch: this.events.splice(0) }),
      });
      if (!res.ok) {
        console.error(JSON.stringify({ event: 'posthog_capture_failed', status: res.status }));
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'posthog_capture_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
