/**
 * Disposable interface for resource cleanup.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * toDisposable wraps a cleanup function into a Disposable object.
 */
export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}

/**
 * Result type for deterministic error handling (Railway Oriented Programming).
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
