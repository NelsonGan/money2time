"use client";

import { useState } from "react";

import { ChartTooltip } from "./tooltip";
import { INK_MUTED, useElementWidth } from "./scale";

type SankeyNode = { key: string; label: string; value: number; color: string };

/**
 * Money in on the left, one central pool, money out on the right — the
 * three-column shape Monarch made popular. Flows are bands whose thickness is
 * their share of the pool, so the two sides always balance: the caller adds a
 * "saved" node on the right or a "from savings" node on the left.
 */
export function Sankey({
  sources,
  targets,
  centerLabel,
  height = 380,
  format,
  percent,
}: {
  sources: SankeyNode[];
  targets: SankeyNode[];
  centerLabel: string;
  height?: number;
  format: (value: number) => string;
  /** A share as the page's locale writes it. */
  percent: (ratio: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(800);
  const [hover, setHover] = useState<{ node: SankeyNode; x: number; y: number } | null>(null);

  const total = Math.max(
    sources.reduce((s, n) => s + n.value, 0),
    targets.reduce((s, n) => s + n.value, 0),
  );
  const nodeW = 12;
  const gap = 8;
  const labelW = Math.min(170, width * 0.22);
  // Labels are cut to what fits beside the nodes (about 7px a character), so
  // a phone-width chart does not run off its edge.
  const labelChars = Math.max(5, Math.floor((labelW - 10) / 7));
  const leftX = labelW;
  const rightX = width - labelW - nodeW;
  const midX = width / 2 - nodeW / 2;
  const padY = 8;

  // Every node gets at least enough height for its two-line label; the rest
  // of the column is shared in proportion, so small flows stay readable.
  const MIN_NODE = 26;
  const layout = (nodes: SankeyNode[]) => {
    const usable = height - padY * 2 - gap * Math.max(0, nodes.length - 1);
    const sum = nodes.reduce((s, n) => s + n.value, 0) || 1;
    let small = new Set<number>();
    let scale = usable / sum;
    for (let pass = 0; pass < 4; pass++) {
      const next = new Set(nodes.map((n, i) => (n.value * scale < MIN_NODE ? i : -1)).filter((i) => i >= 0));
      const rest = nodes.reduce((s, n, i) => (next.has(i) ? s : s + n.value), 0) || 1;
      scale = Math.max(0, usable - next.size * MIN_NODE) / rest;
      if (next.size === small.size) break;
      small = next;
    }
    let cursor = padY;
    return nodes.map((node, i) => {
      const h = total ? (small.has(i) ? MIN_NODE : Math.max(MIN_NODE, node.value * scale)) : 0;
      const item = { node, y: cursor, h };
      cursor += h + gap;
      return item;
    });
  };

  const left = layout(sources);
  const right = layout(targets);
  const usableMid = height - padY * 2;
  const midTop = padY;
  const midH = usableMid;

  // Flows enter/leave the central node stacked in the same order.
  const band = (
    x0: number,
    y0: number,
    h0: number,
    x1: number,
    y1: number,
    h1: number,
  ) => {
    const cx = (x0 + x1) / 2;
    return `M${x0},${y0}C${cx},${y0} ${cx},${y1} ${x1},${y1}L${x1},${y1 + h1}C${cx},${y1 + h1} ${cx},${y0 + h0} ${x0},${y0 + h0}Z`;
  };

  const share = (value: number) => (total ? (value / total) * midH : 0);
  // Each flow's slice of the central node, stacked in node order.
  const stack = (nodes: { node: SankeyNode }[]) => {
    const tops: number[] = [];
    let cursor = midTop;
    for (const { node } of nodes) {
      tops.push(cursor);
      cursor += share(node.value);
    }
    return tops;
  };
  const leftTops = stack(left);
  const rightTops = stack(right);

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={centerLabel} className="block overflow-visible">
        {left.map(({ node, y, h }, i) => {
          const d = band(leftX + nodeW, y, h, midX, leftTops[i], share(node.value));
          return (
            <path
              key={`l-${node.key}`}
              d={d}
              fill={node.color}
              opacity={hover && hover.node.key !== node.key ? 0.12 : 0.28}
              onMouseMove={(e) => setHover({ node, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
            />
          );
        })}
        {right.map(({ node, y, h }, i) => {
          const d = band(midX + nodeW, rightTops[i], share(node.value), rightX, y, h);
          return (
            <path
              key={`r-${node.key}`}
              d={d}
              fill={node.color}
              opacity={hover && hover.node.key !== node.key ? 0.12 : 0.28}
              onMouseMove={(e) => setHover({ node, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
            />
          );
        })}

        <rect x={midX} y={midTop} width={nodeW} height={midH} rx={4} fill="#1A2E2A" />

        {left.map(({ node, y, h }) => (
          <g key={`ln-${node.key}`}>
            <rect x={leftX} y={y} width={nodeW} height={h} rx={3} fill={node.color} />
            <text x={leftX - 8} y={y + h / 2} dy="-0.15em" textAnchor="end" fontSize={12} fontWeight={700} fill="#1A2E2A">
              {truncate(node.label, labelChars)}
            </text>
            <text x={leftX - 8} y={y + h / 2} dy="1.05em" textAnchor="end" fontSize={11} fill={INK_MUTED} className="tabular">
              {format(node.value)}
            </text>
          </g>
        ))}
        {right.map(({ node, y, h }) => (
          <g key={`rn-${node.key}`}>
            <rect x={rightX} y={y} width={nodeW} height={h} rx={3} fill={node.color} />
            <text x={rightX + nodeW + 8} y={y + h / 2} dy="-0.15em" fontSize={12} fontWeight={700} fill="#1A2E2A">
              {truncate(node.label, labelChars)}
            </text>
            <text x={rightX + nodeW + 8} y={y + h / 2} dy="1.05em" fontSize={11} fill={INK_MUTED} className="tabular">
              {format(node.value)}
            </text>
          </g>
        ))}
      </svg>
      {hover ? (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          width={width}
          title={hover.node.label}
          rows={[
            { color: hover.node.color, label: format(hover.node.value), value: total ? percent(hover.node.value / total) : "" },
          ]}
        />
      ) : null}
    </div>
  );
}

function truncate(text: string, max: number) {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}
