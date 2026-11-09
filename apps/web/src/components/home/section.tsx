import type { ReactNode } from "react";

const TONES = {
  plain: "",
  band: "band",
} as const;

/** One rhythm for every block on the page. */
export function Section({
  id,
  tone = "plain",
  className = "",
  children,
}: {
  id?: string;
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`${TONES[tone]} relative px-5 py-16 sm:px-8 sm:py-24 ${className}`}
    >
      <div className="mx-auto max-w-[1180px]">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  aside,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  /** Optional right-hand column, bottom-aligned with the title on wide screens. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
      <div className="max-w-[620px]">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="headline mt-3 text-[clamp(30px,3.6vw,46px)]">{title}</h2>
        {body && !aside ? (
          <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-foreground-soft text-pretty">
            {body}
          </p>
        ) : null}
      </div>

      {aside ?? null}

      {body && aside ? (
        <p className="max-w-[420px] text-[17px] leading-relaxed text-foreground-soft text-pretty">
          {body}
        </p>
      ) : null}
    </div>
  );
}
