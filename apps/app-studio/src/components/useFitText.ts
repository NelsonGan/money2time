import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps a headline on the lines it was written with.
 *
 * Every headline in `src/scenes/locales` is authored as two lines split with a
 * `\n`, and the scenes are laid out around that: the block ends where the phone
 * begins. A translation that is a few characters longer soft-wraps into a third
 * line and pushes the supporting line into the device.
 *
 * So rather than trusting the copy to be short in twenty-three languages, the
 * element is measured with wrapping switched off, and the type is scaled by
 * whatever ratio makes the widest authored line fit. One pass, no loop: the
 * ratio of the overflow is the ratio to shrink by.
 *
 * Transforms do not affect `scrollWidth` or `clientWidth`, so this measures the
 * real export-size layout even while the scene is previewed scaled down.
 */
export function useFitText<T extends HTMLElement>(base: number, minScale = 0.62) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      el.style.fontSize = `${base}px`;

      const previous = el.style.whiteSpace;
      el.style.whiteSpace = 'pre';
      const available = el.clientWidth;
      const widest = el.scrollWidth;
      el.style.whiteSpace = previous;

      if (available > 0 && widest > available) {
        const fitted = Math.floor(base * (available / widest));
        el.style.fontSize = `${Math.max(Math.round(base * minScale), fitted)}px`;
      }
    };
    fit();
    void document.fonts.ready.then(fit);
    return () => { cancelled = true; };
  });

  return ref;
}

/**
 * The same idea for a wrapping paragraph, where the constraint is a line count
 * rather than a width. The supporting line under a headline is allowed two
 * lines; a third one reaches the device.
 */
export function useFitLines<T extends HTMLElement>(base: number, maxLines: number, minScale = 0.66) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let size = base;
    el.style.fontSize = `${size}px`;

    const floor = Math.round(base * minScale);
    const lineHeight = () => parseFloat(getComputedStyle(el).lineHeight) || size * 1.32;

    while (size > floor && el.scrollHeight > lineHeight() * maxLines + 1) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
  });

  return ref;
}
