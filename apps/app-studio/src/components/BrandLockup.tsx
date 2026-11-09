/**
 * The app icon beside the Money2Time wordmark. Brand assets carry the icon
 * people will tap on their home screen, not the full-body mascot: the icon is
 * `play_store_512.png` (copied from apps/mobile, see the README's App Studio section), and the
 * wordmark is the lettering cut out of `money2time-logo.png`.
 */
const WORDMARK_ASPECT = 1437 / 243;

interface BrandLockupProps {
  /** Height of the icon tile; the wordmark is sized from it. */
  height: number;
  /** Place the lockup inline (centred in a text block) rather than as a block. */
  inline?: boolean;
  style?: React.CSSProperties;
}

export function BrandLockup({ height, inline = false, style }: BrandLockupProps) {
  const wordHeight = height * 0.52;
  return (
    <div
      style={{
        display: inline ? 'inline-flex' : 'flex',
        alignItems: 'center',
        gap: height * 0.26,
        ...style,
      }}
    >
      <img
        src="/assets/icons/play_store_512.png"
        alt=""
        crossOrigin="anonymous"
        style={{
          width: height,
          height,
          // iOS app icon corner: ~22.4% of the tile.
          borderRadius: height * 0.224,
          boxShadow: `0 ${height * 0.06}px ${height * 0.16}px rgba(26,46,42,0.18)`,
          display: 'block',
        }}
      />
      <img
        src="/assets/icons/money2time-wordmark.png"
        alt="Money2Time"
        crossOrigin="anonymous"
        style={{ height: wordHeight, width: wordHeight * WORDMARK_ASPECT, display: 'block' }}
      />
    </div>
  );
}
