import { useReducer, useRef, useCallback } from 'react';
import type { StopReason } from '../../types/model.js';
import { replReducer, initialState } from '../state/sessionReducer.js';
import { useSessionContext } from '../contexts/SessionContext.js';

export function useSession() {
  const { session, runtime } = useSessionContext();
  const [state, dispatch] = useReducer(replReducer, undefined, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const send = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      if (!text.trim()) return;

      busyRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ kind: 'userInput', text });

      // D5: emit stream.started from the outer consumer layer
      const bus = runtime.getBus();
      bus.emit('stream.started', {
        agentId: session.agent.id,
        turnNumber: state.turns.length + 1,
      });

      let lastStopReason: StopReason = 'end_turn';

      try {
        for await (const event of session.send(text, { signal: controller.signal })) {
          dispatch({ kind: 'agentEvent', event });
          if (event.type === 'turn_complete') {
            lastStopReason = event.stopReason;
          }
        }
        bus.emit('stream.completed', {
          agentId: session.agent.id,
          turnNumber: state.turns.length,
          stopReason: lastStopReason,
        });
      } catch (err) {
        bus.emit('stream.error', {
          agentId: session.agent.id,
          turnNumber: state.turns.length,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, runtime],
  );

  const cancel = useCallback(() => {
    if (!busyRef.current) return;
    abortRef.current?.abort();
    dispatch({ kind: 'turnCancelled' });
  }, []);

  return {
    state,
    dispatch,
    send,
    cancel,
    get isBusy() {
      return busyRef.current;
    },
  };
}
