import type { ReactNode } from "react";

/**
 * The hardware shell used everywhere a phone screen is shown. `notch` is only
 * needed for hand-built screens — real App Store captures already include the
 * status bar.
 */
export function DeviceFrame({
  children,
  className = "",
  notch = false,
  screenClassName = "",
}: {
  children: ReactNode;
  className?: string;
  notch?: boolean;
  screenClassName?: string;
}) {
  return (
    <div
      className={`aspect-[176/358] rounded-[clamp(34px,4vw,54px)] bg-[#14100F] p-[clamp(7px,0.8vw,10px)] shadow-[0_30px_70px_rgba(26,46,42,0.28)] ${className}`}
    >
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[clamp(28px,3.3vw,45px)] ${screenClassName}`}
      >
        {notch ? (
          <div className="absolute left-1/2 top-3 z-10 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#14100F]" />
        ) : null}
        {children}
      </div>
    </div>
  );
}
