import { Disposable, toDisposable } from '../types/common.js';

type EventMap = Record<string, any>;

/**
 * TypedEventBus is a minimal, type-safe event emitter for internal framework communication.
 */
export class TypedEventBus<TEvents extends EventMap> {
  private listeners = new Map<keyof TEvents, Set<(data: any) => void>>();

  /**
   * Register a listener for a specific event.
   * Returns a Disposable to unsubscribe.
   */
  on<K extends keyof TEvents>(
    event: K,
    listener: (data: TEvents[K]) => void,
  ): Disposable {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as any);
    this.listeners.set(event, set);
    
    return toDisposable(() => {
      const currentSet = this.listeners.get(event);
      if (currentSet) {
        currentSet.delete(listener as any);
        if (currentSet.size === 0) {
          this.listeners.delete(event);
        }
      }
    });
  }

  /**
   * Emit an event to all registered listeners.
   */
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      // Execute all listeners in parallel (non-blocking)
      for (const fn of set) {
        try {
          fn(data);
        } catch (err) {
          // Errors in listeners should not crash the bus or stop other listeners
          console.error(`[EventBus] Error in listener for event "${String(event)}":`, err);
        }
      }
    }
  }

  /**
   * Remove all listeners for all events.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}
