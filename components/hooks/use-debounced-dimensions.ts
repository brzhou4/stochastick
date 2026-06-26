"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Tracks the width/height of the element referenced by `ref`, debouncing resize
 * updates. Browser-only: on the server (or before mount) it returns zeros and
 * does nothing.
 */
export function useDebouncedDimensions(
  ref: RefObject<HTMLElement | null>,
  debounceMs = 250,
): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    const scheduleMeasure = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(measure, debounceMs);
    };

    // Initial measurement runs immediately (no debounce) so first paint is correct.
    measure();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    observer?.observe(element);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [ref, debounceMs]);

  return dimensions;
}

export default useDebouncedDimensions;
