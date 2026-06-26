"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useDebouncedDimensions } from "@/components/hooks/use-debounced-dimensions";

interface AnimatedGradientProps {
  colors: string[];
  speed?: number;
  blur?: "light" | "medium" | "heavy";
  className?: string;
}

// Small deterministic PRNG (mulberry32) so SVG circle positions are STABLE
// between server render and client hydration — avoids Next.js hydration
// mismatch that the original Math.random()-in-render version causes.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomInt = (rand: () => number, min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

const BLUR_CLASS: Record<NonNullable<AnimatedGradientProps["blur"]>, string> = {
  light: "blur-2xl",
  medium: "blur-3xl",
  heavy: "blur-[100px]",
};

/**
 * AnimatedGradient renders blurred, slowly drifting SVG circles whose colors,
 * positions and per-circle drift vectors are derived deterministically from the
 * color list — so they animate via the Tailwind `background-gradient` keyframes
 * without any render-time randomness.
 */
export function AnimatedGradient({
  colors,
  speed = 5,
  blur = "medium",
  className,
}: AnimatedGradientProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dimensions = useDebouncedDimensions(containerRef);

  // Seed is derived from the color palette so the layout is deterministic but
  // varies between different gradients on the page.
  const circles = useMemo(() => {
    const seedSource = colors.join("|");
    let seed = 0;
    for (let i = 0; i < seedSource.length; i++) {
      seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0;
    }
    const rand = seededRandom(seed || 1);

    return colors.map((color, index) => ({
      color,
      top: `${randomInt(rand, 0, 100)}%`,
      left: `${randomInt(rand, 0, 100)}%`,
      size: randomInt(rand, 25, 65),
      tx1: (rand() - 0.5).toFixed(3),
      ty1: (rand() - 0.5).toFixed(3),
      tx2: (rand() - 0.5).toFixed(3),
      ty2: (rand() - 0.5).toFixed(3),
      tx3: (rand() - 0.5).toFixed(3),
      ty3: (rand() - 0.5).toFixed(3),
      tx4: (rand() - 0.5).toFixed(3),
      ty4: (rand() - 0.5).toFixed(3),
      key: index,
    }));
  }, [colors]);

  const dimension = Math.max(dimensions.width, dimensions.height);

  return (
    <div ref={containerRef} className={cn("absolute inset-0 overflow-hidden", className)}>
      <div className={cn("absolute inset-0", BLUR_CLASS[blur])}>
        {circles.map((circle) => (
          <svg
            key={circle.key}
            className="absolute animate-background-gradient opacity-60"
            style={
              {
                top: circle.top,
                left: circle.left,
                width: dimension ? `${(dimension * circle.size) / 100}px` : `${circle.size}%`,
                height: dimension ? `${(dimension * circle.size) / 100}px` : `${circle.size}%`,
                "--background-gradient-speed": `${1 / speed}s`,
                "--tx-1": circle.tx1,
                "--ty-1": circle.ty1,
                "--tx-2": circle.tx2,
                "--ty-2": circle.ty2,
                "--tx-3": circle.tx3,
                "--ty-3": circle.ty3,
                "--tx-4": circle.tx4,
                "--ty-4": circle.ty4,
              } as React.CSSProperties
            }
            viewBox="0 0 100 100"
          >
            <circle cx="50" cy="50" r="50" fill={circle.color} />
          </svg>
        ))}
      </div>
    </div>
  );
}

export default AnimatedGradient;
