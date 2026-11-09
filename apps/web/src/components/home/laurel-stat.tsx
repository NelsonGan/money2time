import type { ReactNode } from "react";

import { LaurelBranch } from "@/components/icons";

/** A number wrapped in a pair of award laurels, as the App Store shows them. */
export function LaurelStat({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <LaurelBranch className="h-[58px] w-auto text-primary/55" />
      <div className="flex flex-col items-center gap-1 px-0.5">
        <span className="tabular font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">
          {value}
        </span>
        {children}
      </div>
      <LaurelBranch className="h-[58px] w-auto -scale-x-100 text-primary/55" />
    </div>
  );
}
