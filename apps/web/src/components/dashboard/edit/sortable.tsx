"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/*
 * Drag-and-drop ordering, as a list on the web is reordered: grab a row by its
 * handle and drop it where it should go; the rows around it slide out of the
 * way while it moves, and the list scrolls when the row is held near its edge.
 * With the keyboard, the handle moves its row with the arrow keys. Each list
 * orders only its own rows, so lists nest (groups, and accounts in each).
 */

/** `list` with the entry at `from` moved to `to`. */
function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type Drag = {
  id: string;
  from: number;
  to: number;
  /** How far the row has moved, in the list's own coordinates (scrolling included). */
  dy: number;
  /** How far the other rows move to make room: the dragged row's height and the gap after it. */
  shift: number;
};

type Start = {
  pointerId: number;
  y: number;
  scroll: number;
  /** `undefined`: nothing to scroll. */
  scroller: HTMLElement | null | undefined;
  /** Every row's top and bottom when the drag began, in the list's coordinates. */
  rects: { top: number; bottom: number }[];
};

/**
 * The nearest scrolling box around `el`, or the page; `undefined` inside a
 * sheet whose list does not scroll, so a drag there never scrolls the page behind.
 */
function scrollParent(el: HTMLElement | null): HTMLElement | null | undefined {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    if (node.hasAttribute("data-sheet")) return undefined;
  }
  return null;
}

const scrollTop = (scroller: HTMLElement | null | undefined) => (scroller ? scroller.scrollTop : scroller === null ? window.scrollY : 0);

export function SortableList({
  ids,
  onChange,
  renderItem,
  label,
  disabled,
  className = "",
  itemClassName = "",
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  /** A row's content; `handle` is its grip, placed where the row shows it. */
  renderItem: (id: string, handle: ReactNode, dragging: boolean) => ReactNode;
  /** The row's name, for the grip's label. */
  label: (id: string) => string;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  const t = useTranslations("dashboard.edit.reorder");
  const rows = useRef(new Map<string, HTMLLIElement>());
  const start = useRef<Start | null>(null);
  const pointerY = useRef(0);
  const frame = useRef(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** Where the dragged row lands, from its centre against the others' as they stood. */
  const update = () => {
    const s = start.current;
    const current = dragRef.current;
    if (!s || !current) return;
    const dy = pointerY.current - s.y + (scrollTop(s.scroller) - s.scroll);
    const own = s.rects[current.from];
    const centre = (own.top + own.bottom) / 2 + dy;
    let to = current.from;
    for (let i = current.from + 1; i < s.rects.length; i++) if (centre > (s.rects[i].top + s.rects[i].bottom) / 2) to = i;
    for (let i = current.from - 1; i >= 0; i--) if (centre < (s.rects[i].top + s.rects[i].bottom) / 2) to = i;
    setDrag({ ...current, dy, to });
  };

  // Held near the edge of its scrolling box, the list scrolls under the row.
  const autoscroll = () => {
    const s = start.current;
    if (!s || !dragRef.current || s.scroller === undefined) return;
    const box = s.scroller ? s.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const edge = 48;
    const y = pointerY.current;
    const speed = y < box.top + edge ? -Math.ceil((box.top + edge - y) / 4) : y > box.bottom - edge ? Math.ceil((y - (box.bottom - edge)) / 4) : 0;
    if (speed) {
      if (s.scroller) s.scroller.scrollTop += speed;
      else window.scrollBy(0, speed);
      update();
    }
    frame.current = requestAnimationFrame(autoscroll);
  };

  const onPointerDown = (id: string) => (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0 || ids.length < 2) return;
    event.preventDefault();
    const el = rows.current.get(id);
    if (!el) return;
    const scroller = scrollParent(el);
    const scroll = scrollTop(scroller);
    const rects = ids.map((rowId) => {
      const rect = rows.current.get(rowId)?.getBoundingClientRect();
      return { top: (rect?.top ?? 0) + scroll, bottom: (rect?.bottom ?? 0) + scroll };
    });
    const from = ids.indexOf(id);
    const next = rects[from + 1] ?? null;
    const previous = rects[from - 1] ?? null;
    const gap = next ? next.top - rects[from].bottom : previous ? rects[from].top - previous.bottom : 0;
    start.current = { pointerId: event.pointerId, y: event.clientY, scroll, scroller, rects };
    pointerY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = { id, from, to: from, dy: 0, shift: rects[from].bottom - rects[from].top + gap };
    dragRef.current = state;
    setDrag(state);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(autoscroll);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current || event.pointerId !== start.current.pointerId) return;
    pointerY.current = event.clientY;
    update();
  };

  const finish = (commit: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current || event.pointerId !== start.current.pointerId) return;
    cancelAnimationFrame(frame.current);
    const current = dragRef.current;
    start.current = null;
    dragRef.current = null;
    setDrag(null);
    if (commit && current && current.to !== current.from) {
      onChange(moveTo(ids, current.from, current.to));
      setAnnounce(t("moved", { name: label(current.id), position: current.to + 1, count: ids.length }));
    }
  };

  const onKeyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const from = ids.indexOf(id);
    const to = event.key === "ArrowUp" ? from - 1 : event.key === "ArrowDown" ? from + 1 : event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0 || to >= ids.length || to === from) return;
    onChange(moveTo(ids, from, to));
    setAnnounce(t("moved", { name: label(id), position: to + 1, count: ids.length }));
    // The row re-renders in its new place; keep the grip focused.
    requestAnimationFrame(() => rows.current.get(id)?.querySelector<HTMLButtonElement>("[data-grip]")?.focus());
  };

  const styleOf = (id: string, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (id === drag.id) return { transform: `translateY(${drag.dy}px)`, zIndex: 10, position: "relative" };
    const { from, to, shift } = drag;
    const by = from < to && index > from && index <= to ? -shift : to < from && index >= to && index < from ? shift : 0;
    return { transform: by ? `translateY(${by}px)` : undefined, transition: "transform 150ms ease" };
  };

  return (
    <>
      <ul className={className}>
        {ids.map((id, index) => {
          const name = label(id);
          const dragging = drag?.id === id;
          const handle = (
            <button
              type="button"
              data-grip
              disabled={disabled || ids.length < 2}
              onPointerDown={onPointerDown(id)}
              onPointerMove={onPointerMove}
              onPointerUp={finish(true)}
              onPointerCancel={finish(false)}
              onKeyDown={onKeyDown(id)}
              aria-label={t("dragNamed", { name })}
              title={t("drag")}
              className={`inline-flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded-lg text-foreground-muted hover:bg-background-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-30 ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <svg viewBox="0 0 12 20" width={10} height={16} fill="currentColor" aria-hidden="true">
                {[4, 10, 16].map((cy) => (
                  <g key={cy}>
                    <circle cx={3} cy={cy} r={1.6} />
                    <circle cx={9} cy={cy} r={1.6} />
                  </g>
                ))}
              </svg>
            </button>
          );
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              style={styleOf(id, index)}
              data-dragging={dragging || undefined}
              className={`${itemClassName} ${dragging ? "shadow-[var(--shadow-float-lg)] ring-1 ring-primary/30" : ""}`}
            >
              {renderItem(id, handle, dragging)}
            </li>
          );
        })}
      </ul>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </>
  );
}
