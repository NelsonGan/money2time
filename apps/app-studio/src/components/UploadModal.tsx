'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ExportDeviceType } from '../utils/export';
import { isCreativePlacement } from '../data/appStoreCreative';
import { IOS_LOCALE_MAP } from '../data/storeLocales.mjs';
import {
  checkServer, captureCurrentView,
  uploadIOSLocale, startAndroidSession, uploadAndroidLocale, commitAndroidSession,
  appIconSize, startAndroidIconSession, uploadAndroidIcon, PLAY_ICON_SIZE, APP_ICON_URL,
} from '../utils/upload';
import type { ServerStatus, UploadDevice } from '../utils/upload';

// ── Types ─────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_CONCURRENCY = 6;

type Platform = 'ios' | 'android';
type Scope    = 'current' | 'all';
type LogType  = 'info' | 'success' | 'error' | 'dim' | 'head';

interface LogLine {
  ts: string;
  text: string;
  type: LogType;
}

interface Props {
  device: UploadDevice;
  activeLocale: string;
  localeOptions: string[];
  setLocale: (l: string) => void;
  sceneRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  featureRef: React.RefObject<HTMLDivElement | null>;
  creativeRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/**
 * Which stores an asset can go to.
 *
 * The icon is Android-only, and not for want of an API: the App Store reads an
 * app's icon out of the binary, so there is no listing asset to send. On Play
 * the icon is a listing asset like any screenshot, kept per locale. The
 * iPhone Duo is the reverse: Play has no foldable iPhone gallery to fill.
 */
function platformsFor(device: UploadDevice): Platform[] {
  if (isCreativePlacement(device) || device === 'duo') return ['ios'];
  return device === 'feature' || device === 'icon' ? ['android'] : ['ios', 'android'];
}

function assetLabel(device: UploadDevice): string {
  if (device === 'header') return 'Header';
  if (device === 'search') return 'Search Results';
  if (device === 'ipad')    return 'iPad';
  if (device === 'duo')     return 'iPhone Duo';
  if (device === 'feature') return 'Feature Graphic';
  if (device === 'icon')    return 'App Icon';
  return 'iPhone';
}

function now() {
  return new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UploadModal({
  device, activeLocale, localeOptions, setLocale, sceneRefs, featureRef, creativeRef, onClose,
}: Props) {
  const available = platformsFor(device);
  const creative = isCreativePlacement(device);
  const uploadLocales = creative ? localeOptions.filter(l => IOS_LOCALE_MAP[l]?.length) : localeOptions;
  const [platform, setPlatform] = useState<Platform>(available[0]);
  const [scope, setScope]       = useState<Scope>('all');
  const unsupportedCurrent = creative && scope === 'current' && !IOS_LOCALE_MAP[activeLocale]?.length;
  const [server, setServer]     = useState<ServerStatus | null>(null);
  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const [completedWithErrors, setCompletedWithErrors] = useState(false);
  const [log, setLog]           = useState<LogLine[]>([]);
  /** Play's own listing locales, which is what "all" means for the icon. */
  const [iconLocales, setIconLocales] = useState<string[] | null>(null);
  const abortRef  = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  useEffect(() => { checkServer().then(setServer); }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const serverReady = server?.online && (platform === 'ios' ? server.ios : server.android);

  const addLog = useCallback((text: string, type: LogType = 'info', replace = false) => {
    const ts = now();
    setLog(prev => {
      const previous = prev[prev.length - 1];
      const localePrefix = (line: string) => line.match(/^\[[^\]]+\]/)?.[0];
      // Uploads finish between capture updates. Never overwrite another
      // language's result with the next language's progress.
      if (replace && previous && previous.type !== 'success' && previous.type !== 'error'
        && localePrefix(previous.text) === localePrefix(text)) {
        return [...prev.slice(0, -1), { ts: prev[prev.length - 1].ts, text, type }];
      }
      return [...prev, { ts, text, type }];
    });
  }, []);

  const handleIconUpload = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setCompletedWithErrors(false);
    setLog([]);

    let sessionId: string | undefined;
    let successCount = 0;
    let failureCount = 0;

    try {
      const size = await appIconSize();
      if (size.width !== PLAY_ICON_SIZE || size.height !== PLAY_ICON_SIZE) {
        throw new Error(
          `Play takes the icon at ${PLAY_ICON_SIZE} × ${PLAY_ICON_SIZE}; ` +
          `${APP_ICON_URL} is ${size.width} × ${size.height}`,
        );
      }

      addLog('Opening Play Store edit session…', 'dim');
      const session = await startAndroidIconSession();
      sessionId = session.sessionId;
      const locales = session.locales;
      setIconLocales(locales);
      addLog('Edit session started', 'dim');
      if (!locales.length) throw new Error('Play holds no listing for this app to put an icon on');
      addLog(`Uploading the app icon to ${locales.length} Play listings`, 'head');

      // Nothing to render per locale, so this is a plain worker pool over the
      // listing list rather than the capture-then-upload pipeline above.
      const queue = [...locales];
      const worker = async () => {
        while (queue.length && !abortRef.current) {
          const playLocale = queue.shift()!;
          try {
            await uploadAndroidIcon(sessionId!, playLocale);
            successCount++;
            addLog(`[${playLocale}] ✓ icon uploaded  (${successCount}/${locales.length})`, 'success');
          } catch (err) {
            failureCount++;
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`[${playLocale}] ✗ ${msg}`, 'error');
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_UPLOAD_CONCURRENCY, locales.length) }, worker),
      );

      // An uncommitted edit never reached the store, so a cancelled or partly
      // failed run is left uncommitted rather than committing half a change.
      if (abortRef.current) {
        addLog('Cancelled — the edit was never committed, nothing changed.', 'dim');
        return;
      }
      if (failureCount) {
        addLog(`${failureCount} listing(s) failed — not committing, nothing changed.`, 'error');
        return;
      }

      addLog('Committing Play Store edit…', 'dim');
      await commitAndroidSession(sessionId);
      addLog(`Edit committed — the icon is on all ${successCount} Play listings`, 'success');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, [addLog]);

  const handleUpload = useCallback(async () => {
    if (!serverReady || running || unsupportedCurrent) return;
    if (device === 'icon') { void handleIconUpload(); return; }

    // Narrowed once, here: every closure below rasterizes a scene, which the
    // icon — a file on disk — is not.
    const rasterDevice: ExportDeviceType = device;

    const originalLocale = activeLocale;
    const locales = scope === 'current' ? [activeLocale] : uploadLocales;
    const storeName = platform === 'ios' ? 'App Store Connect' : 'Google Play';

    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setCompletedWithErrors(false);
    setLog([]);

    addLog(`Starting ${platform.toUpperCase()} upload — ${locales.length} locale${locales.length !== 1 ? 's' : ''}`, 'head');
    addLog(`Uploading with concurrency ${MAX_UPLOAD_CONCURRENCY}`, 'dim');

    let androidSessionId: string | undefined;
    let successCount = 0;
    let failureCount = 0;
    let partialCount = 0;
    let skippedCount = 0;
    const activeUploads = new Set<Promise<void>>();

    const startUpload = (loc: string, screenshots: Awaited<ReturnType<typeof captureCurrentView>>) => {
      const task = async () => {
        addLog(`[${loc}] Uploading to ${storeName}…`);

        try {
          if (platform === 'ios') {
            const result = await uploadIOSLocale(rasterDevice, loc, screenshots,
              () => addLog(`[${loc}] Uploaded — waiting for Apple to process the image…`, 'dim'));
            if (result.skipped) {
              skippedCount++;
              addLog(`[${loc}] Skipped — ${result.reason ?? 'no App Store localization'}`, 'dim');
              return;
            }
            const versionNote = result.version ? ` → v${result.version}` : '';
            const where = result.uploaded?.length ? ` to ${result.uploaded.join(', ')}` : '';
            if (result.errors?.length) failureCount++;
            else successCount++;
            if (result.errors?.length && result.uploaded?.length) partialCount++;
            if (result.uploaded?.length || !result.errors?.length) {
              addLog(`[${loc}] ✓ ${screenshots.length} uploaded${where}${versionNote}`, 'success');
            }
            // Some App Store locales can fail while their siblings succeed.
            for (const error of result.errors ?? []) addLog(`[${loc}] ✗ ${error}`, 'error');
            return;
          }

          const result = await uploadAndroidLocale(androidSessionId!, loc, screenshots);
          if (result.skipped) {
            skippedCount++;
            addLog(`[${loc}] Skipped — ${result.reason ?? 'no Play Store localization'}`, 'dim');
            return;
          }
          if (result.errors?.length) {
            failureCount++;
            if (result.uploaded?.length) partialCount++;
            for (const error of result.errors) addLog(`[${loc}] ✗ ${error}`, 'error');
          } else successCount++;
          // Report what the server actually sent — Play caps the set, so this
          // can be fewer than we captured.
          const dropNote = result.dropped?.length
            ? `  (${result.dropped.length} over Play's limit, skipped)`
            : '';
          // Tablet art goes to two galleries, and saying so is the only way to
          // tell 7 uploads from 14.
          const where = (result.galleries?.length ?? 1) > 1
            ? ` to ${result.galleries!.join(' and ')}`
            : '';
          if (!result.errors?.length || result.uploaded?.length) {
            addLog(`[${loc}] ✓ ${result.count} screenshots staged${where}${dropNote}`, 'success');
          }
        } catch (err) {
          failureCount++;
          const msg = err instanceof Error ? err.message : String(err);
          addLog(`[${loc}] ✗ ${msg}`, 'error');
        }
      };

      const promise = task().finally(() => {
        activeUploads.delete(promise);
      });

      activeUploads.add(promise);
      return promise;
    };

    try {
      if (platform === 'android') {
        addLog('Opening Play Store edit session…', 'dim');
        androidSessionId = await startAndroidSession(rasterDevice);
        addLog('Edit session started', 'dim');
      }

      for (let i = 0; i < locales.length; i++) {
        const loc = locales[i];
        if (abortRef.current) { addLog('Cancelled.', 'dim'); break; }

        addLog(`[${loc}] Generating…`, 'info');
        flushSync(() => setLocale(loc));
        await new Promise(r => setTimeout(r, 350));

        let screenshots: Awaited<ReturnType<typeof captureCurrentView>>;
        try {
          screenshots = await captureCurrentView(
            rasterDevice, loc, sceneRefs.current, featureRef.current ?? null,
            (cur, total) => addLog(`[${loc}] Generating ${cur} / ${total}`, 'dim', true),
            creativeRef.current,
          );
        } catch (err) {
          failureCount++;
          addLog(`[${loc}] Capture failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
          continue;
        }

        if (!screenshots.length) {
          failureCount++;
          addLog(`[${loc}] Nothing to capture — skipped`, 'error', true);
          continue;
        }

        if (abortRef.current) { addLog('Cancelled.', 'dim'); break; }
        addLog(`[${loc}] Captured ${screenshots.length} ${creative ? 'creative' : 'screenshots'}`, 'dim', true);
        startUpload(loc, screenshots);

        if (activeUploads.size >= MAX_UPLOAD_CONCURRENCY) {
          await Promise.race(activeUploads);
        }
      }

      await Promise.allSettled([...activeUploads]);

      if (androidSessionId && !abortRef.current && !failureCount) {
        addLog('Committing Play Store edit…', 'dim');
        await commitAndroidSession(androidSessionId);
        addLog('Edit committed — changes are live in Play Console', 'success', true);
      } else if (androidSessionId) {
        addLog('Edit not committed — nothing changed in Play Console.', failureCount ? 'error' : 'dim');
      }

      if (!abortRef.current) {
        const type = failureCount ? 'error' : 'success';
        addLog(`Done — ${successCount} ${androidSessionId && failureCount ? 'staged' : 'uploaded'}, ${failureCount} failed${partialCount ? ` (${partialCount} partially ${androidSessionId ? 'staged' : 'uploaded'})` : ''}${skippedCount ? `, ${skippedCount} skipped` : ''}`, type);
        if (creative && (successCount || partialCount)) addLog('Saved to the editable app version. Preview and submit for review in App Store Connect.', 'info');
        setCompletedWithErrors(failureCount > 0);
        setDone(true);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, 'error');
    } finally {
      await Promise.allSettled([...activeUploads]);
      flushSync(() => setLocale(originalLocale));
      setRunning(false);
    }
  }, [serverReady, running, unsupportedCurrent, platform, scope, device, activeLocale, uploadLocales, creative, setLocale, sceneRefs, featureRef, creativeRef, addLog, handleIconUpload]);

  const handleCancel = () => { abortRef.current = true; };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose();
      if (e.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)
        || (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [running, onClose]);

  const localeCount = scope === 'current' ? 1 : uploadLocales.length;
  /** What the header and the button count. The icon counts Play's listings. */
  const targetCount = device === 'icon' ? iconLocales?.length ?? null : localeCount;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-title" className="relative w-[580px] max-h-[90vh] flex flex-col rounded-2xl
        bg-[#0f0f1a] border border-white/[0.08]
        shadow-[0_32px_80px_-8px_rgba(0,0,0,0.8)]">

        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-7 pb-6 border-b border-white/[0.06]">
          <div>
            <h2 id="upload-title" className="text-[17px] font-semibold text-white leading-tight">Upload to Store</h2>
            <p className="text-[13px] text-white/35 mt-1.5">
              {assetLabel(device)} · {device === 'icon'
                ? targetCount === null ? 'every Play listing' : `${targetCount} Play listings`
                : `${localeCount} locale${localeCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            aria-label="Close upload"
            onClick={onClose} disabled={running}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12]
              text-white/40 hover:text-white transition-all flex items-center justify-center
              disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer mt-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings */}
        <div className="px-8 py-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-white/[0.06]">

          {/* Platform */}
          {available.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Platform</span>
              <div className="flex gap-2">
                {(['ios', 'android'] as Platform[]).map(p => (
                  <button
                    key={p}
                    onClick={() => !running && setPlatform(p)}
                    disabled={running}
                    className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium transition-all cursor-pointer
                      ${platform === p
                        ? 'bg-[#10b981] text-white'
                        : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.09]'}
                      disabled:cursor-not-allowed`}
                  >
                    {p === 'ios'
                      ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                      : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.5-3.08-.77-4.87-.77-1.79 0-3.43.27-4.87.77L4.85 5.67c-.18-.28-.54-.37-.83-.22-.29.16-.42.54-.26.85l1.84 3.18C2.63 11.46 1 14.3 1 17.5h22c0-3.2-1.63-6.04-5.4-8.02zm-9.1 4.52c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1zm7 0c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1z"/></svg>
                    }
                    {p === 'ios' ? 'iOS' : 'Android'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scope. The icon has none: one file, every listing Play holds. */}
          {device !== 'feature' && device !== 'icon' && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Scope</span>
              <div className="flex gap-2">
                {(['current', 'all'] as Scope[]).map(s => (
                  <button
                    key={s}
                    onClick={() => !running && setScope(s)}
                    disabled={running}
                    className={`h-9 px-4 rounded-lg text-[13px] font-medium transition-all cursor-pointer
                      ${scope === s
                        ? 'bg-white/[0.12] text-white'
                        : 'bg-white/[0.04] text-white/45 hover:text-white hover:bg-white/[0.08]'}
                      disabled:cursor-not-allowed`}
                  >
                    {s === 'current' ? `Current (${activeLocale})` : `All (${uploadLocales.length})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Server status */}
          <div className="ml-auto flex items-center gap-2">
            {server === null ? (
              <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
            ) : serverReady ? (
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
            <span className="text-[12px] text-white/35">
              {server === null ? 'checking…'
                : !server.online ? 'offline'
                : creative && serverReady ? 'App Store ready'
                : server.detail?.[platform] ?? (serverReady ? 'ready' : 'not configured')}
            </span>
            <button
              onClick={() => { setServer(null); checkServer().then(setServer); }}
              className="text-white/25 hover:text-white/55 transition-colors cursor-pointer"
              title="Re-check"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115 0M20 15a9 9 0 01-15 0" />
              </svg>
            </button>
          </div>
        </div>

        {creative && (
          <p className="px-8 pt-4 text-[13px] leading-relaxed text-white/50">
            Saves the {device === 'search' ? 'animated MP4' : 'full image'} to App Store Connect’s <span className="text-white/75">{assetLabel(device)}</span> field on your editable app version.
            {' '}Review and submit in App Store Connect after uploading.
            {scope === 'all' && ` All includes the ${uploadLocales.length} Studio languages supported by the App Store. Filipino has no App Store localization.`}
            {unsupportedCurrent && ' Filipino has no App Store localization. Choose another language or All.'}
          </p>
        )}

        {/* Terminal log */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#080810] mx-5 my-5 rounded-xl
          border border-white/[0.06] font-mono text-[12.5px] leading-relaxed">
          {log.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[140px] text-white/20 text-[13px] font-mono">
              {unsupportedCurrent
                ? 'Choose a supported language or All'
                : server === null ? 'Checking upload availability…'
                : serverReady
                ? 'Ready — press Upload to start'
                : server?.online
                  ? server.detail?.[platform] ?? `${platform.toUpperCase()} is not ready`
                  : 'Start the dev server'}
            </div>
          ) : (
            <div className="p-5 flex flex-col gap-1">
              {log.map((line, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <span className="text-white/20 shrink-0 tabular-nums">{line.ts}</span>
                  <span className={logColor(line.type)}>{line.text}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="px-5 pb-5">
          {!running ? (
            <button
              onClick={handleUpload}
              disabled={!serverReady || done || unsupportedCurrent}
              className="w-full h-12 rounded-xl font-semibold text-[14px] transition-all cursor-pointer
                bg-[#10b981] hover:bg-[#0da870] active:bg-[#0b9562] text-white
                shadow-[0_8px_24px_-4px_rgba(16,185,129,0.4)]
                hover:shadow-[0_12px_32px_-4px_rgba(16,185,129,0.55)]
                hover:-translate-y-0.5
                disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
            >
              {done
                ? completedWithErrors ? 'Finished with errors — review results' : '✓ Upload complete — close when ready'
                : unsupportedCurrent ? 'Choose a supported language or All'
                : device === 'icon'
                  ? targetCount === null
                    ? 'Upload app icon → every Play listing'
                    : `Upload app icon → ${targetCount} Play listing${targetCount === 1 ? '' : 's'}`
                  : `Upload ${localeCount} locale${localeCount !== 1 ? 's' : ''} → ${platform === 'ios' ? 'App Store' : 'Play Store'}`}
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="w-full h-12 rounded-xl font-semibold text-[14px] transition-all cursor-pointer
                bg-white/[0.05] hover:bg-white/[0.09] text-white/50 hover:text-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Log colour helper ─────────────────────────────────────────────────────────

function logColor(type: LogType) {
  switch (type) {
    case 'head':    return 'text-white font-semibold';
    case 'success': return 'text-[#34d399]';
    case 'error':   return 'text-red-400';
    case 'dim':     return 'text-white/35';
    default:        return 'text-white/70';
  }
}
