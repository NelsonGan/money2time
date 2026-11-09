"use client";

import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` elements as they scroll into view.
 *
 * The hidden state is scoped to `html[data-reveal-ready]`, which is only set
 * once this mounts — so without JavaScript, or before hydration, everything
 * renders visible. Elements can stagger with `style={{ "--reveal-delay": … }}`.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");

    if (
      targets.length === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    root.setAttribute("data-reveal-ready", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    for (const target of targets) {
      // Anything already on screen at load reveals immediately, so the first
      // viewport never animates in behind the user.
      if (target.getBoundingClientRect().top < window.innerHeight) {
        target.setAttribute("data-revealed", "");
      } else {
        observer.observe(target);
      }
    }

    return () => {
      observer.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);

  return null;
}
