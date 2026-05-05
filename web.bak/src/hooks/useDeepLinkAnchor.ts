import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useDeepLinkAnchor(): void {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.replace("#", "").trim();
    if (!hash) return;
    const params = new URLSearchParams(hash.includes("=") ? hash : "");
    const tool = params.get("tool");
    const task = params.get("task");
    const message = params.get("message");
    const anchor = params.get("anchor");
    const direct = hash.includes("=") ? null : decodeURIComponent(hash);
    const target = direct ?? message ?? tool ?? task ?? anchor;
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-anchor="${target}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1200);
    }
  }, [location.hash]);
}
