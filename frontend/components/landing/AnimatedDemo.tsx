"use client";

/**
 * Self-running showcase of the research loop. Pure CSS animations driven
 * by a single 18-second timeline so we don't need JS state machines or
 * React renders to make it move.
 *
 * Timeline (each step crossfades over the next):
 *   0.0s  – 3.0s   user types a query
 *   3.0s  – 4.6s   "searching" pulse
 *   4.6s  – 8.0s   three statute hits slide in
 *   8.0s – 16.0s   cited answer paragraph fades in line by line
 *  16.0s – 18.0s   hold final state, then loop
 *
 * Style choices are deliberate:
 *   - Fixed-height container so layout doesn't jump on each loop.
 *   - The "answer" panel uses brand-* tokens so it auto-flips in dark mode.
 *   - The blinking cursor uses a steps() animation so it feels mechanical.
 */
export default function AnimatedDemo() {
  return (
    <div className="relative w-full max-w-xl rounded-2xl border border-brand-border bg-brand-surface/80 p-5 shadow-2xl backdrop-blur">
      {/* fake browser chrome */}
      <div className="mb-4 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        <span className="ml-3 truncate font-mono text-[11px] text-brand-muted">
          caselogic.app/research
        </span>
      </div>

      {/* QUERY BOX */}
      <div className="mb-3 rounded-lg border border-brand-border bg-brand-bg px-3 py-2.5">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-brand-muted">
          Query
        </p>
        <p className="font-mono text-sm text-brand-primary">
          <span className="demo-typed">
            What is the rule for reckless driving in California?
          </span>
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-brand-accent animate-blink-caret align-middle"
          />
        </p>
      </div>

      {/* RETRIEVAL STAGE */}
      <div className="mb-3 flex items-center gap-2 demo-searching">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-accent opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-accent" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
          Searching CA Vehicle Code · Florida Statutes · RCW
        </span>
      </div>

      {/* HITS */}
      <div className="mb-3 flex flex-col gap-1.5 demo-hits">
        <DemoHit
          delay="4.8s"
          state="CA"
          citation="Cal. Veh. Code § 23103(a)"
          score={0.94}
          snippet="A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving."
          highlight={["willful or wanton", "guilty of"]}
        />
        <DemoHit
          delay="5.6s"
          state="WA"
          citation="RCW 46.61.500"
          score={0.81}
          snippet="Any person who drives any vehicle in willful or wanton disregard for the safety of persons or property is guilty of reckless driving."
          highlight={["willful or wanton", "reckless"]}
        />
        <DemoHit
          delay="6.4s"
          state="FL"
          citation="Fla. Stat. § 316.192"
          score={0.78}
          snippet="Any person who drives any vehicle in willful or wanton disregard for the safety of persons or property is guilty of reckless driving."
          highlight={["willful or wanton", "guilty of"]}
        />
      </div>

      {/* ANSWER */}
      <div className="rounded-lg border border-brand-accent/30 bg-brand-accent/5 px-3 py-3 demo-answer">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-brand-accent">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
            <path d="M8 1.333a6.667 6.667 0 1 0 0 13.334A6.667 6.667 0 0 0 8 1.333zm-.667 3.334h1.334v4H7.333v-4zm0 5.333h1.334v1.333H7.333V10z" />
          </svg>
          Source-grounded answer
        </p>
        <p className="text-sm leading-relaxed text-brand-secondary">
          <span className="demo-line demo-line-1">
            California defines reckless driving as operating a vehicle{" "}
            <span className="rounded-sm bg-yellow-200/70 px-0.5 text-slate-900 dark:bg-amber-300/40">
              in willful or wanton disregard
            </span>{" "}
            for the safety of persons or property.{" "}
          </span>
          <span className="demo-line demo-line-2">
            <span className="mx-0.5 inline-block rounded-md border border-brand-accent/30 bg-brand-accent/10 px-1.5 py-0 font-mono text-[12px] font-medium text-brand-accent">
              Cal. Veh. Code § 23103(a)
            </span>
            .
          </span>
        </p>
      </div>

      {/* timeline animations + per-element delays */}
      <style jsx>{`
        @keyframes demoTyping {
          0% {
            width: 0;
          }
          14% {
            width: 100%;
          }
          92% {
            width: 100%;
          }
          100% {
            width: 0;
          }
        }
        @keyframes demoFadePulse {
          0%,
          16% {
            opacity: 0;
          }
          18%,
          25% {
            opacity: 1;
          }
          44%,
          100% {
            opacity: 0;
          }
        }
        @keyframes demoSlideIn {
          0%,
          26% {
            opacity: 0;
            transform: translateY(8px);
          }
          32%,
          88% {
            opacity: 1;
            transform: translateY(0);
          }
          92%,
          100% {
            opacity: 0;
            transform: translateY(-4px);
          }
        }
        @keyframes demoLine {
          0%,
          44% {
            opacity: 0;
            transform: translateY(6px);
          }
          50%,
          92% {
            opacity: 1;
            transform: translateY(0);
          }
          96%,
          100% {
            opacity: 0;
          }
        }

        .demo-typed {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          vertical-align: bottom;
          animation: demoTyping 18s ease-in-out infinite;
        }
        .demo-searching {
          animation: demoFadePulse 18s ease-in-out infinite;
        }
        .demo-hits :global(.demo-hit) {
          opacity: 0;
          animation: demoSlideIn 18s ease-in-out infinite;
        }
        .demo-answer {
          opacity: 0;
          animation: demoFadePulse 18s ease-in-out infinite;
          animation-delay: 4s;
        }
        .demo-answer .demo-line {
          opacity: 0;
          display: inline;
          animation: demoLine 18s ease-in-out infinite;
        }
        .demo-answer .demo-line-1 {
          animation-delay: 0s;
        }
        .demo-answer .demo-line-2 {
          animation-delay: 1.2s;
        }

        /* Respect users who have asked OS-level for less motion: pause
           the loop on the last frame so the page is still informative. */
        @media (prefers-reduced-motion: reduce) {
          .demo-typed,
          .demo-searching,
          .demo-hits :global(.demo-hit),
          .demo-answer,
          .demo-answer .demo-line {
            animation: none;
            opacity: 1;
          }
          .demo-typed {
            white-space: normal;
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}

interface DemoHitProps {
  delay: string;
  state: string;
  citation: string;
  score: number;
  snippet: string;
  highlight: string[];
}

function DemoHit({
  delay,
  state,
  citation,
  score,
  snippet,
  highlight,
}: DemoHitProps) {
  return (
    <div
      className="demo-hit flex items-start gap-2 rounded-md border border-brand-border bg-brand-bg/60 px-2 py-1.5"
      style={{ animationDelay: delay }}
    >
      <span className="mt-0.5 inline-block rounded bg-brand-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
        {state}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[12px] font-semibold text-brand-primary">
            {citation}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-brand-muted">
            {score.toFixed(2)}
          </span>
        </div>
        <p className="line-clamp-1 text-[11px] leading-snug text-brand-secondary">
          {renderSnippet(snippet, highlight)}
        </p>
      </div>
    </div>
  );
}

function renderSnippet(snippet: string, terms: string[]) {
  if (terms.length === 0) return snippet;
  const escaped = terms
    .map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .join("|");
  // Splitter is global so .split() captures every match. The membership
  // test below is a separate non-stateful regex (no /g flag) so test()
  // gives consistent results across iterations.
  const splitter = new RegExp(`(${escaped})`, "gi");
  const matcher = new RegExp(`^(?:${escaped})$`, "i");
  const parts = snippet.split(splitter);
  return parts.map((p, i) =>
    matcher.test(p) ? (
      <mark
        key={i}
        className="rounded-sm bg-yellow-200/70 px-0.5 text-slate-900 dark:bg-amber-300/40"
      >
        {p}
      </mark>
    ) : (
      p
    ),
  );
}
