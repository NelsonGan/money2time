import Image from "next/image";
import { resizedMedia } from "@/lib/media";

/**
 * The Money₂Time wordmark. Colours come from the app's wordmark palette; the
 * lockup scales off the inherited font size, so callers set the size with a
 * text utility (and can make it responsive).
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-[0.42em] ${className}`}>
      <Image
        src={resizedMedia("/icon.png", 128, 90)}
        alt=""
        width={128}
        height={128}
        className="block h-[1.5em] w-[1.5em] shrink-0 rounded-[28%] object-cover"
      />
      <span className="font-display font-extrabold leading-none tracking-[-0.04em] whitespace-nowrap">
        <span style={{ color: "var(--wordmark-money)" }}>Money</span>
        <span
          className="inline-block"
          style={{
            color: "var(--wordmark-two)",
            fontSize: "0.5em",
            transform: "translateY(-0.6em)",
          }}
        >
          2
        </span>
        <span style={{ color: "var(--wordmark-time)" }}>Time</span>
      </span>
    </span>
  );
}
