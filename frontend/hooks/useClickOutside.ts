import { useEffect } from "react";
import type { RefObject } from "react";

interface UseClickOutsideOptions {
  enabled?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Calls `onOutside` when clicking outside the referenced element.
 * Optionally also closes on Escape key.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  options: UseClickOutsideOptions = {},
): void {
  const { enabled = true, closeOnEscape = false } = options;

  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(event: MouseEvent) {
      const root = ref.current;
      if (!root) return;

      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      onOutside();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOutside();
    }

    window.addEventListener("mousedown", handlePointerDown);
    if (closeOnEscape) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      if (closeOnEscape) {
        window.removeEventListener("keydown", handleEscape);
      }
    };
  }, [closeOnEscape, enabled, onOutside, ref]);
}
