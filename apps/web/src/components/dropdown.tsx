"use client";

import { useEffect, useId, useRef, useState } from "react";

export type DropdownOption<T extends string> = {
  flag?: string;
  label: string;
  value: T;
};

export function Dropdown<T extends string>({
  ariaLabel,
  className = "",
  /** Below `sm`, show only the flag so the trigger stays narrow. */
  compact = false,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  compact?: boolean;
  onChange: (value: T) => void;
  options: Array<DropdownOption<T>>;
  value: T;
}) {
  const buttonId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const selectOption = (option: DropdownOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
    setActiveIndex(null);
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    setIsOpen(true);
    setActiveIndex((current) => {
      const next = (current ?? selectedIndex) + direction;
      if (next < 0) {
        return options.length - 1;
      }
      if (next >= options.length) {
        return 0;
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={buttonId}
        type="button"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => {
          setActiveIndex(null);
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActiveIndex(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActiveIndex(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setActiveIndex(null);
            setIsOpen((current) => !current);
          } else if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(null);
          }
        }}
        className={`group inline-flex h-10 items-center justify-between gap-2 rounded-lg bg-transparent px-2 text-sm font-bold text-foreground outline-none transition duration-200 hover:text-primary active:text-primary focus-visible:ring-4 focus-visible:ring-primary/10 sm:min-w-[132px] sm:max-w-none sm:px-2.5 ${
          compact
            ? "min-w-0"
            : "min-w-[104px] max-w-[calc(100vw-188px)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedOption.flag ? (
            <span
              className="shrink-0 text-base leading-none"
              aria-hidden="true"
            >
              {selectedOption.flag}
            </span>
          ) : null}
          <span
            className={`truncate leading-normal ${compact ? "hidden sm:inline" : ""}`}
          >
            {selectedOption.label}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`grid size-4 shrink-0 place-items-center text-foreground-muted transition-transform duration-200 group-hover:text-primary ${
            isOpen
              ? "rotate-180"
              : ""
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="size-3.5"
            aria-hidden="true"
          >
            <path
              d="M4 6.25L8 10.25L12 6.25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[min(252px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border/70 bg-surface shadow-[0_12px_28px_rgba(26,46,42,0.09)]">
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={buttonId}
            tabIndex={-1}
            className="max-h-[min(360px,calc(100svh-96px))] overflow-y-auto p-1"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveIndex(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveIndex(-1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectOption(options[activeIndex ?? selectedIndex]);
              } else if (event.key === "Escape") {
                setIsOpen(false);
                setActiveIndex(null);
              }
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold outline-none transition duration-150 ${
                    isSelected
                      ? "bg-background-subtle text-foreground"
                      : isActive
                        ? "bg-background-subtle text-foreground"
                        : "text-foreground-soft hover:bg-background-subtle hover:text-foreground"
                  }`}
                >
                  {option.flag ? (
                    <span
                      className="w-6 shrink-0 text-base leading-none"
                      aria-hidden="true"
                    >
                      {option.flag}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected ? (
                    <span
                      className="grid size-4 shrink-0 place-items-center text-primary"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        className="size-3.5"
                        aria-hidden="true"
                      >
                        <path
                          d="M3.5 8.25L6.5 11.25L12.5 4.75"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
