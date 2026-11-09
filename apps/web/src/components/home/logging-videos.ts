import { media } from "@/lib/media";

export const LOGGING_METHODS = ["receiptScan", "backTap", "applePay"] as const;

export type LoggingMethod = (typeof LOGGING_METHODS)[number];

export type LoggingClip = {
  /** H.264 MP4, muted, encoded at the width the section actually renders. */
  src: string;
  /** First frame, so the slot is filled before the video has any data. */
  poster: string;
};

/**
 * Screen recordings for the "Never type an entry again" section.
 *
 * These are filmed on a real phone rather than captured off the screen, so
 * they are shown without the device frame the rest of the page uses — a phone
 * inside a phone reads as a mistake. A `null` slot falls back to a neutral
 * placeholder inside the frame, which is still the right treatment for a
 * screen capture if one ever replaces these.
 */
export const LOGGING_VIDEOS: Record<LoggingMethod, LoggingClip | null> = {
  receiptScan: {
    src: media("/videos/receipt-scan.mp4"),
    poster: media("/videos/receipt-scan.webp"),
  },
  backTap: {
    src: media("/videos/back-tap.mp4"),
    poster: media("/videos/back-tap.webp"),
  },
  applePay: {
    src: media("/videos/apple-pay.mp4"),
    poster: media("/videos/apple-pay.webp"),
  },
};
