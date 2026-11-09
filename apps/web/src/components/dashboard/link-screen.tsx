"use client";

/* eslint-disable @next/next/no-img-element -- small static artwork */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { waitForPhone, type BrowserState, type LinkedPhone, type PhoneCandidate } from "@/lib/cloud/relay";

import { QrCode } from "./qr-code";
import type { Loading } from "./state";
import { ClayImg, TransferBar } from "./ui";
import { media, resizedMedia } from "@/lib/media";

const STEPS = [
  { key: "camera", icon: "entry/camera" },
  { key: "link", icon: "entry/qr-code" },
  { key: "dashboard", icon: "money-time/bar-chart" },
] as const;

const PROMISES = [
  { key: "edits", icon: "ui/pencil" },
  { key: "phone", icon: "status/shield-check" },
  { key: "private", icon: "money-time/bank" },
] as const;

type LinkScreenProps =
  | { mode: "qr"; notice: "unlinked" | "unsupported" | null; onLinked: (link: LinkedPhone) => void }
  | {
      mode: "waiting";
      phoneName: string | null;
      connection: BrowserState;
      progress: number | null;
      loading: Loading | null;
      error: string | null;
      refresh: () => void;
      takeOver: () => void;
      unlink: () => void;
    };

/**
 * The front door of app.money2time.com, WhatsApp Web style: what the Web
 * Dashboard is, and a QR code for the phone to scan. Once linked, the same
 * card waits for the phone to send its data.
 */
export function LinkScreen(props: LinkScreenProps) {
  const t = useTranslations("dashboard.link");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-[72px] max-w-[1180px] items-center px-5 sm:px-8">
        <a href="https://www.money2time.com" className="flex items-center gap-2" aria-label="Money2Time">
          <img src={resizedMedia("/icon.png", 128, 90)} alt="" width={32} height={32} className="h-8 w-8 rounded-[10px]" />
          <span className="text-[18px] font-extrabold tracking-[-0.02em] text-foreground">Money2Time</span>
        </a>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section>
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="headline mt-3 text-[clamp(32px,4vw,48px)]">{t("title")}</h1>
            <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-foreground-soft text-pretty">{t("subtitle")}</p>

            <ol className="mt-8 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.key} className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[14px] font-extrabold text-primary-dark">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-extrabold text-foreground">
                      <ClayImg name={step.icon} size={24} />
                      {t(`steps.${step.key}.title`)}
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-foreground-soft">{t(`steps.${step.key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>

            <ul className="mt-10 grid gap-5 border-t border-border pt-8 sm:grid-cols-3">
              {PROMISES.map((promise) => (
                <li key={promise.key}>
                  <ClayImg name={promise.icon} size={32} />
                  <h2 className="mt-2 text-[14.5px] font-bold text-foreground">{t(`promises.${promise.key}.title`)}</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-foreground-soft">{t(`promises.${promise.key}.body`)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card-surface rounded-[28px] p-6 sm:p-8">
            {props.mode === "qr" ? <QrCard {...props} /> : <WaitingCard {...props} />}
          </section>
        </div>
      </main>
    </div>
  );
}

function QrCard({ notice, onLinked }: Extract<LinkScreenProps, { mode: "qr" }>) {
  const t = useTranslations("dashboard.link");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<PhoneCandidate | null>(null);
  const [reachable, setReachable] = useState(true);
  const [failed, setFailed] = useState<"unsupported" | null>(notice === "unsupported" ? "unsupported" : null);

  useEffect(() => {
    if (notice === "unsupported") return;
    const controller = new AbortController();
    waitForPhone({ onOffer: setQr, onCode: setCode, onCandidate: setCandidate, onReachable: setReachable }, controller.signal)
      .then(onLinked)
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "unsupported") setFailed("unsupported");
      });
    return () => controller.abort();
  }, [onLinked, notice]);

  const spaced = (value: string) => `${value.slice(0, 3)} ${value.slice(3)}`;

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{t("cardTitle")}</h2>
      <p className="mt-1.5 max-w-[380px] text-[14px] leading-relaxed text-foreground-soft">{t("cardBody")}</p>
      {notice === "unlinked" ? (
        <p role="status" className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-[13.5px] font-semibold text-[#8A5A0B]">
          {t("unlinkedNotice")}
        </p>
      ) : null}
      {candidate ? (
        // The phone confirmed; this computer decides too. A QR someone else
        // photographed would show a phone the person here does not recognise.
        <div role="alertdialog" aria-labelledby="link-candidate-title" className="mt-6 w-full max-w-[320px] rounded-[24px] border border-primary/40 bg-primary-soft/60 p-5 text-left">
          <p id="link-candidate-title" className="text-[17px] font-extrabold text-foreground">
            {candidate.phoneName ? t("candidateTitle", { phone: candidate.phoneName }) : t("candidateTitleUnnamed")}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground-soft">{t("candidateBody")}</p>
          <p className="tabular mt-3 text-center text-[30px] font-extrabold tracking-[0.18em] text-primary-dark">{spaced(candidate.code)}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={candidate.reject} className="h-11 flex-1 rounded-full border border-border bg-card text-[14px] font-bold text-foreground-soft hover:bg-background-subtle">
              {t("candidateReject")}
            </button>
            <button type="button" onClick={candidate.accept} className="h-11 flex-1 rounded-full bg-primary text-[14px] font-extrabold text-card hover:bg-primary-dark">
              {t("candidateAccept")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex aspect-square w-full max-w-[288px] items-center justify-center rounded-[24px] border border-border bg-white p-3 shadow-[var(--shadow-soft)]">
          {failed ? (
            <p className="px-4 text-[14px] font-semibold text-error">{t("errors.unsupported")}</p>
          ) : qr ? (
            <QrCode value={qr} label={t("qrLabel")} />
          ) : !reachable ? (
            <p role="status" className="px-4 text-[14px] font-semibold text-foreground-soft">
              {t("offline")}
            </p>
          ) : (
            <span role="status" className="h-10 w-10 animate-spin rounded-full border-4 border-primary-soft border-t-primary" aria-label={t("preparing")} />
          )}
        </div>
      )}
      {code && !candidate ? (
        <div role="status" className="mt-4 rounded-2xl bg-primary-soft px-5 py-3 text-primary-dark">
          <p className="text-[13px] font-semibold">{t("confirmCode")}</p>
          <p className="tabular mt-1 text-[28px] font-extrabold tracking-[0.18em]">{spaced(code)}</p>
        </div>
      ) : !candidate ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-foreground-soft">
          <ClayImg name="status/shield-check" size={20} />
          {t("noAccount")}
        </p>
      ) : null}
      <p className="mt-5 text-[12px] leading-relaxed text-foreground-muted">{t("terms")}</p>
    </div>
  );
}

function WaitingCard({ phoneName, connection, progress, loading, error, refresh, takeOver, unlink }: Extract<LinkScreenProps, { mode: "waiting" }>) {
  const t = useTranslations("dashboard.link");
  const tc = useTranslations("dashboard.cloud");
  const here = connection === "phone" || connection === "receiving";
  return (
    <div>
      <img src={media(`/mascots/${loading ? "laptop" : "thinking"}.png`)} alt="" width={96} height={96} className="h-24 w-24 object-contain" />
      <p className="mt-3 text-[13px] font-semibold text-foreground-soft">{t("linkedTo", { phone: phoneName || tc("yourPhone") })}</p>
      {loading ? (
        <div role="status">
          <h2 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{t(`${loading}Title`)}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-soft">{t(`${loading}Body`)}</p>
          <TransferBar
            label={t(`${loading}Title`)}
            progress={loading === "receiving" ? progress : null}
            className="mt-5 h-3 w-full bg-surface-muted"
          />
        </div>
      ) : connection === "elsewhere" ? (
        <>
          <h2 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{tc("elsewhereTitle")}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-soft">{tc("elsewhereBody")}</p>
          <button type="button" onClick={takeOver} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14.5px] font-extrabold text-card hover:bg-primary-dark">
            {tc("useHere")}
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{t("waitingTitle")}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-soft">{t("waitingBody")}</p>
          <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-foreground-soft">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${here ? "bg-success" : "bg-foreground-muted/40"}`} />
            {here ? tc("phoneHere") : connection === "connecting" ? tc("connecting") : tc("phoneAway")}
          </p>
          {here ? (
            <button type="button" onClick={refresh} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14.5px] font-extrabold text-card hover:bg-primary-dark">
              {tc("refresh")}
            </button>
          ) : null}
        </>
      )}
      {/* A new attempt under way replaces the last one's failure, as on the dashboard. */}
      {error && !loading ? (
        <p role="alert" className="mt-4 rounded-2xl bg-error-soft px-4 py-3 text-[13.5px] font-semibold text-error">
          {tc(`errors.${error}`)}
        </p>
      ) : null}
      <button type="button" onClick={unlink} className="mt-6 w-full text-center text-[13px] font-semibold text-foreground-soft hover:text-foreground">
        {tc("unlink")}
      </button>
    </div>
  );
}
