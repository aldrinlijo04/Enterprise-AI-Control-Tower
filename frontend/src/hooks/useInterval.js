import { useEffect, useRef } from "react";

/**
 * useInterval — runs `callback` every `delay` ms.
 * Pass null as delay to pause.
 */
export function useInterval(callback, delay) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
