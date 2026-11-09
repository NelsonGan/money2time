"use client";

import { useState, type AnimationEvent, type MouseEvent } from "react";

import { Mascot, type MascotPose } from "@/components/mascot";

/**
 * The app's three-frame flipbooks, kept to the same frames and cadence as
 * `components/feedback/Mascot.tsx` there. Only `save` is drawn on the site so
 * far; the shape is here so a second sequence is a one-line addition.
 */
const SEQUENCES = {
  /** Coin over the piggy bank, coin in, happy hug. */
  save: ["save-1", "save-2", "save-3"],
} as const satisfies Record<string, readonly MascotPose[]>;

export type MascotSequence = keyof typeof SEQUENCES;

/**
 * A mascot sequence that sits still until it is clicked, then plays one pass.
 *
 * Nothing moves on load, so the hero never animates at a visitor unprompted.
 * The pass ends on the pose the mascot rests on, so anyone who never clicks —
 * including anyone who asked for reduced motion, where the click does nothing
 * — still sees a complete pose rather than a coin frozen in mid-air.
 *
 * Frames are stacked and swapped by opacity rather than through one `src`,
 * which would paint an empty box the first time a frame is shown. Playback is
 * CSS (`mascot-frame-*` in globals.css); this only adds and drops the class
 * that starts it, so the next click replays it.
 */
export function MascotFlipbook({
  sequence,
  size,
  className = "",
}: {
  sequence: MascotSequence;
  /** Rendered size in px. Omit to size it responsively from `className`. */
  size?: number;
  className?: string;
}) {
  const frames: readonly MascotPose[] = SEQUENCES[sequence];
  const lastFrame = frames.length - 1;
  const [playing, setPlaying] = useState(false);

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // `animate-rise` runs on this same element, and its end would otherwise
    // clear a pass that has only just started. The frames are children, so
    // theirs is the one that bubbles.
    if (event.target !== event.currentTarget) {
      setPlaying(false);
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setPlaying(true);
  };

  return (
    <div
      aria-hidden
      onClick={handleClick}
      onAnimationEnd={handleAnimationEnd}
      className={`relative shrink-0 cursor-pointer select-none ${
        playing ? "mascot-playing" : ""
      } ${className}`}
      style={size === undefined ? undefined : { width: size, height: size }}
    >
      {/*
        Only the frame that paints first is eager — an eager `next/image` also
        gets a preload link, and three of those in the hero compete with the
        screenshot the page is actually judged on. The lead-in frames are in
        the viewport, so the browser still fetches them straight away; they
        only have to be decoded by the time the first click lands.
      */}
      {frames.map((pose, index) => (
        <Mascot
          key={pose}
          pose={pose}
          size={size}
          loading={index === lastFrame ? "eager" : "lazy"}
          className={`mascot-frame mascot-frame-${index + 1} absolute inset-0 h-full w-full`}
        />
      ))}
    </div>
  );
}
