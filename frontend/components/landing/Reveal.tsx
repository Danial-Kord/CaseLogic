"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger this child's reveal by N milliseconds after it intersects. */
  delayMs?: number;
  /** Override the default `animate-fade-up` animation utility. */
  className?: string;
  /** Wrapper element (defaults to <div>). */
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * Wrap any block of content to make it fade + slide into view the first
 * time it enters the viewport. Once revealed it stays revealed (no
 * scroll-back animation thrash).
 *
 * Uses IntersectionObserver, so it's cheap even for many instances on the
 * same page. Falls back to "always visible" if IO isn't available
 * (extremely old browsers, jsdom).
 */
export default function Reveal({
  children,
  delayMs = 0,
  className = "",
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  const style: CSSProperties = revealed
    ? { animationDelay: `${delayMs}ms` }
    : { opacity: 0 };

  // The double-class trick: while not revealed we suppress the animation
  // by leaving opacity: 0; once revealed we add the animate utility and
  // the keyframe runs with the configured delay.
  const animClass = revealed ? `animate-fade-up ${className}` : className;

  // Tag is restricted to standard intrinsic elements for type-safety.
  const Component = Tag as "div";
  return (
    <Component
      ref={ref as unknown as React.RefObject<HTMLDivElement>}
      style={style}
      className={animClass}
    >
      {children}
    </Component>
  );
}
