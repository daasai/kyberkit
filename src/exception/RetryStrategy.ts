/**
 * [I3] Retry status messages yielded during AsyncGenerator retry loop
 */
export interface RetryStatusMessage {
  type: 'retry_status';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  timestamp: number;
}

/**
 * [I3] AsyncGenerator retry executor with exponential backoff.
 * Yields RetryStatusMessage between attempts for progress reporting.
 * Borrowed from CC's withRetry() AsyncGenerator pattern.
 *
 * [C5] Supports:
 *   - Retry-After header from API responses (respected as server directive)
 *   - Jitter (default 25% of base delay) to prevent thundering herd
 */
export async function* withRetry<T>(
  fn: () => Promise<T>,
  config: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier: number;
    jitterFactor?: number;
  },
  shouldRetry: (error: Error, attempt: number) => boolean = () => true,
  signal?: AbortSignal,
): AsyncGenerator<RetryStatusMessage, T> {
  const jitter = config.jitterFactor ?? 0.25;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');

    try {
      // Execute the actual function
      const result = await fn();
      return result;
    } catch (err: any) {
      lastError = err;
      
      // Check if we should stop retrying
      if (attempt === config.maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }

      // [C5] Respect Retry-After header if present
      const retryAfterMs = extractRetryAfterMs(err);
      let delayMs: number;
      if (retryAfterMs !== null) {
        delayMs = retryAfterMs;
      } else {
        const baseDelay = config.backoffMs * Math.pow(config.backoffMultiplier, attempt - 1);
        // [C5] Add jitter to prevent thundering herd
        const jitterAmount = Math.random() * jitter * baseDelay;
        delayMs = Math.min(baseDelay + jitterAmount, 32_000); // Cap at 32s
      }

      // [I3] Yield status message for progress reporting
      yield {
        type: 'retry_status',
        attempt,
        maxAttempts: config.maxAttempts,
        delayMs,
        errorMessage: err.message ?? String(err),
        timestamp: Date.now(),
      };

      await sleep(delayMs, signal);
    }
  }
  throw lastError;
}

/**
 * [C5] Extract Retry-After header value in milliseconds.
 * Returns null if header not present or unparseable.
 */
function extractRetryAfterMs(error: unknown): number | null {
  const headers = (error as any)?.headers;
  const retryAfter = headers?.['retry-after'] ?? (headers?.get ? headers.get('retry-after') : undefined);
  if (!retryAfter) return null;
  const seconds = parseInt(retryAfter, 10);
  return isNaN(seconds) ? null : seconds * 1000;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}
