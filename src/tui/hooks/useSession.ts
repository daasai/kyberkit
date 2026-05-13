import { useReducer, useRef, useCallback, useEffect, useState } from 'react';
import { randomUUID } from 'crypto';
import type { StopReason } from '../../types/model.js';
import type {
  BatchAuthDecision,
  BatchAuthPrompt,
  ToolPermissionDecision,
  ToolPermissionPrompt,
} from '../../permission/ToolPermissionGate.js';
import { replReducer, initialState } from '../state/sessionReducer.js';
import { useSessionContext } from '../contexts/SessionContext.js';
import type { SkillDraft } from '../../types/skill-suggestion.js';

export function useSession() {
  const { session, runtime } = useSessionContext();
  const [state, dispatch] = useReducer(replReducer, undefined, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  /** Monotonic turn id for bus events (avoids stale `state.turns.length` in send closure). */
  const streamTurnRef = useRef(0);
  const permResolveRef = useRef<((d: ToolPermissionDecision) => void) | null>(null);
  const [toolPermissionPrompt, setToolPermissionPrompt] = useState<ToolPermissionPrompt | null>(null);
  const batchResolveRef = useRef<((d: BatchAuthDecision) => void) | null>(null);
  const [batchAuthPrompt, setBatchAuthPrompt] = useState<BatchAuthPrompt | null>(null);
  const lastEventAtRef = useRef(Date.now());
  const [uiClock, setUiClock] = useState(0);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);

  useEffect(() => {
    const id = setInterval(() => setUiClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    runtime.setToolPermissionHandler((prompt, { signal }) => {
      if (signal.aborted) return Promise.resolve('deny' as const);
      return new Promise<ToolPermissionDecision>((resolve) => {
        const finish = (d: ToolPermissionDecision) => {
          signal.removeEventListener('abort', onAbort);
          setToolPermissionPrompt(null);
          permResolveRef.current = null;
          resolve(d);
        };
        const onAbort = () => finish('deny');
        signal.addEventListener('abort', onAbort);
        permResolveRef.current = finish;
        setToolPermissionPrompt(prompt);
      });
    });
    runtime.setBatchAuthHandler?.((prompt, { signal }) => {
      if (signal.aborted) return Promise.resolve({ kind: 'deny_all' } as const);
      return new Promise<BatchAuthDecision>((resolve) => {
        const finish = (d: BatchAuthDecision) => {
          signal.removeEventListener('abort', onAbort);
          setBatchAuthPrompt(null);
          batchResolveRef.current = null;
          resolve(d);
        };
        const onAbort = () => finish({ kind: 'deny_all' });
        signal.addEventListener('abort', onAbort);
        batchResolveRef.current = finish;
        setBatchAuthPrompt(prompt);
      });
    });
    return () => {
      runtime.setToolPermissionHandler(undefined);
      runtime.setBatchAuthHandler?.(undefined);
    };
  }, [runtime]);

  // Track B — skill draft after async suggestion
  useEffect(() => {
    const bus = runtime.getBus();
    const d = bus.on('skill.suggested', (p) => {
      setSkillDraft(p.draft);
    });
    return () => d.dispose();
  }, [runtime]);

  const clearSkillDraft = useCallback(
    async (reason: 'saved' | 'dismiss' | 'ignored' = 'ignored') => {
      setSkillDraft(null);
      if (reason === 'saved') {
        try {
          const ws = runtime.getActiveWorkspace();
          await ws.assets.scan(ws.config.assetPaths);
        } catch {
          // best-effort rescan for skill count
        }
      }
    },
    [runtime],
  );

  // Sprint 3.5 §6.1 — subscribe to `memory.written` and enqueue toasts.
  useEffect(() => {
    const bus = runtime.getBus();
    const handler = (p: {
      tierId: string;
      entryId: string;
      category?: string;
      title?: string;
      path?: string;
      source?: 'auto' | 'manual';
    }) => {
      // Manual writes (from /memory add) go through the same event; skip them
      // so the toast only appears for model-driven auto extractions.
      if (p.source && p.source !== 'auto') return;
      if (!p.title || !p.category) return;
      dispatch({
        kind: 'memoryToastAdd',
        toast: {
          id: randomUUID(),
          entryId: p.entryId,
          title: p.title,
          category: p.category,
          path: p.path,
          shownAt: Date.now(),
        },
      });
    };
    const dispose = bus.on('memory.written', handler);
    return () => {
      dispose.dispose();
    };
  }, [runtime]);

  const revertMemoryToast = useCallback(
    async (toastId: string) => {
      const toast = state.memoryToasts.find(t => t.id === toastId);
      if (!toast || toast.reverting || toast.reverted) return;
      dispatch({ kind: 'memoryToastRevertStart', id: toastId });
      try {
        const ws = runtime.getActiveWorkspace();
        const ltm = ws.getLongTermMemory?.();
        await ltm?.remove(toast.entryId);
        dispatch({ kind: 'memoryToastRevertDone', id: toastId });
      } catch {
        // On failure leave the toast as-is; user can retry on next one.
        dispatch({ kind: 'memoryToastRevertDone', id: toastId });
      }
    },
    [runtime, state.memoryToasts],
  );

  const dismissMemoryToast = useCallback((toastId: string) => {
    dispatch({ kind: 'memoryToastDismiss', id: toastId });
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      if (!text.trim()) return;

      busyRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ kind: 'userInput', text });

      streamTurnRef.current += 1;
      const turnNumber = streamTurnRef.current;

      // D5: emit stream.started from the outer consumer layer
      const bus = runtime.getBus();
      bus.emit('stream.started', {
        agentId: session.agent.id,
        turnNumber,
      });

      let lastStopReason: StopReason = 'end_turn';

      try {
        for await (const event of session.send(text, { signal: controller.signal })) {
          lastEventAtRef.current = Date.now();
          dispatch({ kind: 'agentEvent', event });
          if (event.type === 'turn_complete') {
            lastStopReason = event.stopReason;
          }
        }
        bus.emit('stream.completed', {
          agentId: session.agent.id,
          turnNumber,
          stopReason: lastStopReason,
        });
      } catch (err) {
        bus.emit('stream.error', {
          agentId: session.agent.id,
          turnNumber,
          error: err as Error,
        });
        dispatch({
          kind: 'agentEvent',
          event: { type: 'error', error: err as Error, recoverable: false },
        });
      } finally {
        busyRef.current = false;
        abortRef.current = null;
      }
    },
    [session, runtime],
  );

  const resolveToolPermission = useCallback((d: ToolPermissionDecision) => {
    permResolveRef.current?.(d);
  }, []);

  const resolveBatchAuth = useCallback((d: BatchAuthDecision) => {
    batchResolveRef.current?.(d);
  }, []);

  const cancel = useCallback(() => {
    permResolveRef.current?.('deny');
    batchResolveRef.current?.({ kind: 'deny_all' });
    if (!busyRef.current) return;
    runtime.getBus().emit('user.interrupted', { agentId: session.agent.id });
    abortRef.current?.abort();
    dispatch({ kind: 'turnCancelled' });
  }, [runtime, session.agent.id]);

  return {
    state,
    dispatch,
    send,
    cancel,
    resolveToolPermission,
    toolPermissionPrompt,
    batchAuthPrompt,
    resolveBatchAuth,
    revertMemoryToast,
    dismissMemoryToast,
    /** Bumps once per second so consumers can re-read stall time. */
    uiClock,
    lastEventAgeMs: () => Date.now() - lastEventAtRef.current,
    get isBusy() {
      return busyRef.current;
    },
    skillDraft,
    clearSkillDraft,
  };
}
