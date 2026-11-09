import Image from "next/image";
import { media } from "@/lib/media";

/**
 * The coin-purse chick, copied byte-for-byte from the app's
 * `assets/mascots/`. Only the poses the site actually uses live in
 * `media/mascots/` — the app carries all 33, and pulling the rest across
 * would ship art nothing renders.
 *
 * The `save-*` names are the three frames of the app's `save` flipbook, played
 * by `MascotFlipbook`. Each is a valid still on its own, and `save-3` (the
 * chick hugging its piggy bank) is the pose the sequence settles on.
 */
export type MascotPose =
  | "laptop"
  | "love"
  | "waving"
  | "save-1"
  | "save-2"
  | "save-3";

/** Every pose is a square 512x512 render, so one intrinsic size covers all. */
const ARTWORK_SIZE = 512;

/**
 * A single pose. Decorative by default: the mascot repeats what the copy
 * beside it already says, so it stays out of the accessibility tree unless a
 * caller passes an `alt`.
 */
export function Mascot({
  pose,
  size,
  className = "",
  alt = "",
  loading = "lazy",
}: {
  pose: MascotPose;
  /** Rendered size in px. Omit to size it responsively from `className`. */
  size?: number;
  className?: string;
  alt?: string;
  /** Above-the-fold poses pass "eager"; nothing here is ever the LCP image. */
  loading?: "eager" | "lazy";
}) {
  return (
    <Image
      src={media(`/mascots/${pose}.png`)}
      alt={alt}
      width={ARTWORK_SIZE}
      height={ARTWORK_SIZE}
      loading={loading}
      className={`block shrink-0 object-contain ${className}`}
      style={size === undefined ? undefined : { width: size, height: size }}
      draggable={false}
    />
  );
}
