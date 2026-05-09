"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import type { RelatedStatute } from "@/lib/types";

// Layout constants. The viewBox is 800x480 so the graph keeps a
// 5:3 aspect ratio whatever the modal width happens to be.
const VB_WIDTH = 800;
const VB_HEIGHT = 480;
const CX = VB_WIDTH / 2;
const CY = VB_HEIGHT / 2;
const RING_RADIUS = 175;
// Cap visible nodes so the ring stays scannable. Anything beyond shows
// up in a small "+N more" pill the user can expand into a list view.
const MAX_VISIBLE = 8;

interface RelatedGraphProps {
  /** Slug of the statute that should sit at the center of the graph. */
  statuteId: string;
  /** Citation string for the center node — used as the visible label so
   * we don't have to refetch the source statute here. */
  centerCitation: string;
  /** Two-letter jurisdiction of the center statute. */
  centerJurisdiction: string;
  /**
   * Called when the user clicks a neighbor. Parent should update its
   * statuteId state so the modal re-centers on the clicked node.
   */
  onNavigate: (statuteId: string) => void;
}

export default function RelatedGraph({
  statuteId,
  centerCitation,
  centerJurisdiction,
  onNavigate,
}: RelatedGraphProps) {
  const [data, setData] = useState<RelatedStatute[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    api
      .getRelatedStatutes(statuteId)
      .then((res) => {
        if (cancelled) return;
        setData(res.related);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load related statutes",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statuteId]);

  const visible = useMemo(
    () => (data ?? []).slice(0, MAX_VISIBLE),
    [data],
  );
  const overflow = (data?.length ?? 0) - visible.length;

  const nodes = useMemo(
    () => layoutRing(visible.length, RING_RADIUS),
    [visible.length],
  );

  if (loading && !data) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-brand-muted animate-pulse">
        {strings.relatedGraph.loading}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-brand-error">
        {strings.relatedGraph.error}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        {strings.relatedGraph.empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Re-key on statuteId so the whole subtree re-mounts on pivot —
          gives us a free fade-in animation on every navigation without
          tracking enter/exit transitions manually. */}
      <div
        key={statuteId}
        className="relative overflow-hidden rounded-xl border border-brand-border bg-brand-bg/40 animate-fade-in"
      >
        <svg
          viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={strings.relatedGraph.ariaLabel(centerCitation)}
        >
          {/* faint dot grid */}
          <defs>
            <pattern
              id="rg-dots"
              x="0"
              y="0"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx="1"
                cy="1"
                r="1"
                fill="rgb(var(--color-brand-muted) / 0.15)"
              />
            </pattern>
            <radialGradient id="rg-center-glow" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor="rgb(var(--color-brand-accent) / 0.25)"
              />
              <stop
                offset="100%"
                stopColor="rgb(var(--color-brand-accent) / 0)"
              />
            </radialGradient>
          </defs>
          <rect width={VB_WIDTH} height={VB_HEIGHT} fill="url(#rg-dots)" />
          <circle cx={CX} cy={CY} r={RING_RADIUS + 60} fill="url(#rg-center-glow)" />

          {/* connection lines */}
          {nodes.map((pos, i) => (
            <line
              key={`l-${i}`}
              x1={CX}
              y1={CY}
              x2={pos.x}
              y2={pos.y}
              stroke="rgb(var(--color-brand-accent) / 0.35)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              className="rg-line"
              style={{ animationDelay: `${i * 60 + 200}ms` }}
            />
          ))}

          {/* outer-ring guide (subtle) */}
          <circle
            cx={CX}
            cy={CY}
            r={RING_RADIUS}
            fill="none"
            stroke="rgb(var(--color-brand-border))"
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.6"
          />

          {/* center node */}
          <CenterNode
            citation={centerCitation}
            jurisdiction={centerJurisdiction}
          />

          {/* neighbor nodes */}
          {visible.map((neighbor, i) => (
            <NeighborNode
              key={neighbor.statute_id}
              x={nodes[i].x}
              y={nodes[i].y}
              neighbor={neighbor}
              delayMs={i * 60 + 100}
              onClick={() => onNavigate(neighbor.statute_id)}
            />
          ))}
        </svg>

        <style jsx>{`
          .rg-line {
            opacity: 0;
            animation: rgLineDraw 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }
          @keyframes rgLineDraw {
            0% {
              opacity: 0;
              stroke-dashoffset: 80;
            }
            100% {
              opacity: 1;
              stroke-dashoffset: 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .rg-line {
              animation: none;
              opacity: 1;
            }
          }
        `}</style>
      </div>

      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-medium text-brand-accent hover:underline"
        >
          {expanded
            ? strings.relatedGraph.hideOverflow
            : strings.relatedGraph.showOverflow(overflow)}
        </button>
      )}

      {expanded && data && (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.slice(MAX_VISIBLE).map((r) => (
            <li key={r.statute_id}>
              <button
                type="button"
                onClick={() => onNavigate(r.statute_id)}
                className="flex w-full items-baseline gap-2 rounded-md border border-brand-border bg-brand-surface px-2.5 py-1.5 text-left transition-colors hover:border-brand-accent hover:bg-brand-accent/5"
              >
                <span className="font-mono text-[12px] font-semibold text-brand-primary">
                  {r.universal_citation}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-brand-muted">
                  {r.jurisdiction}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- nodes

function CenterNode({
  citation,
  jurisdiction,
}: {
  citation: string;
  jurisdiction: string;
}) {
  return (
    <g style={{ transform: `translate(${CX}px, ${CY}px)` }} className="rg-center">
      {/* halo */}
      <circle
        r={62}
        fill="rgb(var(--color-brand-accent) / 0.08)"
        stroke="rgb(var(--color-brand-accent) / 0.4)"
        strokeWidth="1"
        className="rg-halo"
      />
      <circle
        r={48}
        fill="rgb(var(--color-brand-surface))"
        stroke="rgb(var(--color-brand-accent))"
        strokeWidth="2"
      />
      <text
        y="-4"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="rgb(var(--color-brand-muted))"
        style={{ letterSpacing: "0.12em" }}
      >
        {jurisdiction.toUpperCase()}
      </text>
      <text
        y="14"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="rgb(var(--color-brand-primary))"
        fontFamily="var(--font-sans), monospace"
      >
        {truncateMid(citation, 24)}
      </text>

      <style jsx>{`
        .rg-center {
          animation: rgCenterIn 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .rg-halo {
          transform-origin: center;
          animation: rgHaloPulse 3.4s ease-in-out infinite;
        }
        @keyframes rgCenterIn {
          0% {
            opacity: 0;
            transform: translate(${CX}px, ${CY}px) scale(0.85);
          }
          100% {
            opacity: 1;
            transform: translate(${CX}px, ${CY}px) scale(1);
          }
        }
        @keyframes rgHaloPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rg-center,
          .rg-halo {
            animation: none;
          }
        }
      `}</style>
    </g>
  );
}

interface NeighborNodeProps {
  x: number;
  y: number;
  neighbor: RelatedStatute;
  delayMs: number;
  onClick: () => void;
}

function NeighborNode({ x, y, neighbor, delayMs, onClick }: NeighborNodeProps) {
  // Mention count drives node size — capped to a small range so we never
  // get a single node so big it eats the page.
  const r = 30 + Math.min(neighbor.mention_count - 1, 4) * 2;

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${delayMs}ms` }}
      className="rg-neighbor cursor-pointer outline-none focus:outline-none"
    >
      <title>
        {neighbor.universal_citation}
        {"\n"}
        {neighbor.snippet}
      </title>
      <circle
        r={r}
        fill="rgb(var(--color-brand-surface))"
        stroke="rgb(var(--color-brand-border))"
        strokeWidth="1.5"
        className="rg-neighbor-bg"
      />
      <text
        y="-2"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="rgb(var(--color-brand-muted))"
        style={{ letterSpacing: "0.1em" }}
      >
        {neighbor.jurisdiction.toUpperCase()}
      </text>
      <text
        y="11"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="rgb(var(--color-brand-primary))"
        fontFamily="var(--font-sans), monospace"
      >
        § {neighbor.section_number}
        {neighbor.subdivision ? `(${neighbor.subdivision})` : ""}
      </text>

      <style jsx>{`
        .rg-neighbor {
          opacity: 0;
          animation: rgNeighborIn 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .rg-neighbor-bg {
          transition: stroke 200ms ease, fill 200ms ease;
        }
        .rg-neighbor:hover .rg-neighbor-bg,
        .rg-neighbor:focus-visible .rg-neighbor-bg {
          stroke: rgb(var(--color-brand-accent));
          fill: rgb(var(--color-brand-accent) / 0.08);
        }
        @keyframes rgNeighborIn {
          0% {
            opacity: 0;
            transform: translate(${x}px, ${y}px) scale(0.6);
          }
          100% {
            opacity: 1;
            transform: translate(${x}px, ${y}px) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rg-neighbor {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </g>
  );
}

// ---------------------------------------------------------------- helpers

interface RingPos {
  x: number;
  y: number;
}

/** Place N points evenly around a circle of radius `r` centered at (CX, CY).
 * First point is at the top (-π/2). With N==1 we still drop the single
 * neighbor at the top for visual stability. */
function layoutRing(n: number, r: number): RingPos[] {
  if (n === 0) return [];
  const points: RingPos[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    points.push({
      x: CX + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
    });
  }
  return points;
}

function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + "\u2026" + s.slice(s.length - half);
}
