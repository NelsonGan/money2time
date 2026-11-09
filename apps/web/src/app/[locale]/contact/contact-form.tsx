"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { EVENTS, track } from "@/lib/analytics";
import { submitContactForm } from "./actions";
import { initialContactFormState } from "./form-state";

function FieldError({
  error,
  id,
}: {
  error?: string;
  id: string;
}) {
  if (!error) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-error">
      {error}
    </p>
  );
}

export function ContactForm() {
  const t = useTranslations("contact.form");
  const [state, formAction, pending] = useActionState(
    submitContactForm,
    initialContactFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lastOpenedMailto = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.status === "idle") return;
    track(EVENTS.contactFormResult, { status: state.status });
    if (state.status === "success") {
      formRef.current?.reset();
    }
    // Depend on `state` (not `state.status`): useActionState returns a fresh
    // object per submission, so repeated same-outcome submits still fire once each.
  }, [state]);

  useEffect(() => {
    if (
      state.status !== "mailto" ||
      !state.mailtoUrl ||
      state.mailtoUrl === lastOpenedMailto.current
    ) {
      return;
    }

    lastOpenedMailto.current = state.mailtoUrl;
    window.location.href = state.mailtoUrl;
  }, [state.mailtoUrl, state.status]);

  const statusTone =
    state.status === "success"
      ? "border-success/30 bg-success-soft text-success"
      : state.status === "mailto"
        ? "border-accent/40 bg-accent-soft text-foreground"
        : "border-error/30 bg-error-soft text-error";

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="company">{t("honeypot")}</label>
        <input
          id="company"
          name="company"
          autoComplete="off"
          tabIndex={-1}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="name"
            className="block text-sm font-semibold text-foreground"
          >
            {t("name")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            aria-invalid={Boolean(state.errors?.name)}
            aria-describedby={state.errors?.name ? "name-error" : undefined}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder={t("namePlaceholder")}
          />
          <FieldError id="name-error" error={state.errors?.name} />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-semibold text-foreground"
          >
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={160}
            aria-invalid={Boolean(state.errors?.email)}
            aria-describedby={state.errors?.email ? "email-error" : undefined}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder={t("emailPlaceholder")}
          />
          <FieldError id="email-error" error={state.errors?.email} />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="message"
          className="block text-sm font-semibold text-foreground"
        >
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={3000}
          rows={7}
          aria-invalid={Boolean(state.errors?.message)}
          aria-describedby={state.errors?.message ? "message-error" : undefined}
          className="w-full rounded-[24px] border border-border bg-surface px-4 py-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          placeholder={t("messagePlaceholder")}
        />
        <FieldError id="message-error" error={state.errors?.message} />
      </div>

      {state.message ? (
        <p
          aria-live="polite"
          className={`rounded-2xl border px-4 py-3 text-sm ${statusTone}`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-base font-bold text-surface transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? t("sending") : t("send")}
        </button>
      </div>
    </form>
  );
}
