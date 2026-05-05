import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function useKeyboardShortcuts(onHelp: () => void): void {
  const navigate = useNavigate();

  useEffect(() => {
    let pendingG = false;
    const timer: { id?: number } = {};
    const reset = () => {
      pendingG = false;
      if (timer.id) window.clearTimeout(timer.id);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "?") {
        event.preventDefault();
        onHelp();
        return;
      }
      if (event.key === "/" && !isTextInput(event.target)) {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>('[data-role="session-search"]');
        search?.focus();
        return;
      }
      if (isTextInput(event.target)) return;
      if (event.key.toLowerCase() === "g") {
        pendingG = true;
        timer.id = window.setTimeout(reset, 1200);
        return;
      }
      if (pendingG && event.key.toLowerCase() === "s") {
        event.preventDefault();
        navigate("/settings/contracts");
        reset();
        return;
      }
      if (pendingG && event.key.toLowerCase() === "c") {
        event.preventDefault();
        navigate("/c");
        reset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      reset();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate, onHelp]);
}
