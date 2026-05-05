import { useEffect, useMemo, useRef, useState } from "react";

type EventStatus = "connecting" | "open" | "closed" | "error";

export type ConsoleEvent =
  | "connected"
  | "heartbeat"
  | "contract.updated"
  | "preferences.updated"
  | "permit.revoked"
  | "audit.appended"
  | "session.updated"
  | "approval.updated";

export function useConsoleEvents(onEvent: (name: ConsoleEvent, payload: unknown) => void) {
  const [status, setStatus] = useState<EventStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const stream = new EventSource("/api/events/stream");
    const names: ConsoleEvent[] = [
      "connected",
      "heartbeat",
      "contract.updated",
      "preferences.updated",
      "permit.revoked",
      "audit.appended",
      "session.updated",
      "approval.updated",
    ];
    const handlers = names.map((name) => {
      const handler = (event: Event) => {
        const message = event as MessageEvent<string>;
        setLastEventAt(Date.now());
        setCount((n) => n + 1);
        try {
          onEventRef.current(name, JSON.parse(message.data));
        } catch {
          onEventRef.current(name, message.data);
        }
      };
      stream.addEventListener(name, handler);
      return { name, handler };
    });

    stream.onopen = () => setStatus("open");
    stream.onerror = () => setStatus("error");

    return () => {
      setStatus("closed");
      for (const item of handlers) {
        stream.removeEventListener(item.name, item.handler);
      }
      stream.close();
    };
  }, []);

  return useMemo(
    () => ({ status, lastEventAt, count }),
    [status, lastEventAt, count],
  );
}
