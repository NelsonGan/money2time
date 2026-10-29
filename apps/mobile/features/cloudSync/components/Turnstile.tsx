import React, {
  type ComponentType,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';

import { Button, Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { reportError } from '~/services/errorReporting';

/**
 * Cloudflare Turnstile in front of mailing a sign-in code, so a script cannot
 * use the Worker to spam inboxes. The Worker checks the token it gets in
 * `x-turnstile-token` (apps/cloudflare/workers/cloud-sync, README "Cloud-sync
 * Worker"). Modelled on RiceCal's features/auth/turnstile.tsx.
 *
 * Turnstile decides whether to challenge by watching a page, so the page is
 * inline HTML in a WebView that stays invisible unless Cloudflare wants a
 * human; then the same WebView is shown over the form. It is never remounted
 * or resized: a reload throws away the challenge in progress, and a 0x0
 * WebView is not reliably laid out on Android.
 *
 * It fails open: no site key, no WebView in the binary, a widget that will not
 * load, all end with `undefined` and the code is asked for without a token.
 * The control is on the Worker, so failing closed here adds no protection and
 * does add a way to lock someone out.
 */

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
/** The page's origin; the widget's hostname list must hold it. */
const ORIGIN = process.env.EXPO_PUBLIC_TURNSTILE_ORIGIN || 'money2time.com';

/** How long to wait for a token, unless a human is answering a challenge. */
const TOKEN_TIMEOUT_MS = 20_000;

/** Codes that never recover (bad configuration); anything else is worth one retry. */
const FATAL_CODES = new Set([
  'unsupported',
  '110100',
  '110110',
  '110200',
  '110420',
  '110430',
  '200100',
  '400010',
  '400020',
  '400070',
]);

type WebViewHandle = { injectJavaScript: (script: string) => void };
type WebViewComponent = ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/**
 * `react-native-webview`, if this binary has it. Required, not imported: a
 * build made before the dependency landed throws at import time.
 */
function loadWebView(): WebViewComponent | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    return require('react-native-webview').default as WebViewComponent;
  } catch {
    return null;
  }
}

function page(siteKey: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      #box { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="box"><div id="widget"></div></div>
    <script>
      var post = function (payload) { window.ReactNativeWebView.postMessage(JSON.stringify(payload)) }
      var id = null
      window.onloadTurnstileCallback = function () {
        id = window.turnstile.render('#widget', {
          sitekey: ${JSON.stringify(siteKey)},
          execution: 'execute',
          appearance: 'interaction-only',
          'refresh-expired': 'never',
          callback: function (token) { post({ type: 'token', token: token }) },
          // False on purpose: a truthy return makes a retryable error final.
          'error-callback': function (code) { post({ type: 'error', code: String(code) }); return false },
          'timeout-callback': function () { post({ type: 'error', code: 'timeout' }) },
          'before-interactive-callback': function () { post({ type: 'interactive' }) },
          'after-interactive-callback': function () { post({ type: 'answered' }) },
          'unsupported-callback': function () { post({ type: 'error', code: 'unsupported' }) },
        })
        post({ type: 'ready' })
      }
      window.m2tExecute = function () {
        if (id === null) return
        window.turnstile.reset(id)
        window.turnstile.execute(id)
      }
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
  </body>
</html>`;
}

/**
 * A token, `undefined` for "none to be had" (send without one), or `null`
 * when the person cancelled the challenge (do not send).
 */
type TurnstileAnswer = string | undefined | null;

interface Pending {
  resolve: (token: TurnstileAnswer) => void;
  timer: ReturnType<typeof setTimeout> | null;
  errors: number;
  interactive: boolean;
}

/**
 * A token for the next code request, and the element hosting the widget.
 * Render `element` inside a `position: relative` box the challenge may cover
 * (it takes no space until then).
 */
export function useTurnstile(): {
  requestToken: () => Promise<TurnstileAnswer>;
  element: React.ReactNode;
} {
  const WebViewImpl = useMemo(() => (SITE_KEY ? loadWebView() : null), []);
  const web = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const queued = useRef<(() => void)[]>([]);
  const pending = useRef<Pending | null>(null);
  const broken = useRef(false);
  const [challenging, setChallenging] = useState(false);

  const settle = useCallback((token: TurnstileAnswer) => {
    const waiting = pending.current;
    pending.current = null;
    setChallenging(false);
    if (!waiting) return;
    if (waiting.timer) clearTimeout(waiting.timer);
    waiting.resolve(token);
  }, []);

  const giveUp = useCallback(
    (why: string) => {
      if (!broken.current) {
        reportError(new Error(`turnstile unusable: ${why}`), { scope: 'cloud_sync_captcha' });
      }
      broken.current = true;
      settle(undefined);
    },
    [settle],
  );

  // The form went away: whoever was waiting sends nothing.
  useEffect(() => () => settle(null), [settle]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: { type?: string; token?: string; code?: string };
      try {
        payload = JSON.parse(event.nativeEvent.data) as typeof payload;
      } catch {
        return;
      }
      const waiting = pending.current;
      switch (payload.type) {
        case 'ready':
          ready.current = true;
          for (const run of queued.current.splice(0)) run();
          return;
        case 'token':
          settle(payload.token);
          return;
        case 'interactive':
          // A human is asked: stop the clock, show the widget.
          if (waiting) {
            if (waiting.timer) clearTimeout(waiting.timer);
            waiting.timer = null;
            waiting.interactive = true;
          }
          setChallenging(true);
          return;
        case 'answered':
          if (waiting) {
            waiting.interactive = false;
            waiting.timer ??= setTimeout(() => settle(undefined), TOKEN_TIMEOUT_MS);
          }
          setChallenging(false);
          return;
        case 'error': {
          const code = payload.code ?? 'unknown';
          if (!ready.current || FATAL_CODES.has(code)) {
            giveUp(code);
            return;
          }
          if (!waiting || waiting.interactive) return;
          waiting.errors += 1;
          if (waiting.errors > 1) settle(undefined);
          return;
        }
      }
    },
    [giveUp, settle],
  );

  const requestToken = useCallback((): Promise<TurnstileAnswer> => {
    if (!WebViewImpl || broken.current) return Promise.resolve(undefined);
    // One at a time: an earlier request still waiting is superseded, not sent.
    settle(null);
    return new Promise((resolve) => {
      const waiting: Pending = { resolve, timer: null, errors: 0, interactive: false };
      waiting.timer = setTimeout(() => {
        if (!ready.current) giveUp('never became ready');
        else settle(undefined);
      }, TOKEN_TIMEOUT_MS);
      pending.current = waiting;
      const execute = () => web.current?.injectJavaScript('window.m2tExecute(); true;');
      if (ready.current) execute();
      else queued.current.push(execute);
    });
  }, [WebViewImpl, giveUp, settle]);

  const element = WebViewImpl ? (
    <View
      pointerEvents={challenging ? 'auto' : 'none'}
      // Invisible until a challenge, and out of the screen reader's way too.
      accessibilityElementsHidden={!challenging}
      importantForAccessibility={challenging ? 'auto' : 'no-hide-descendants'}
      style={[styles.overlay, { opacity: challenging ? 1 : 0 }]}
    >
      <View style={styles.panel} className="rounded-3xl border border-border/30 bg-card">
        <Text variant="bodyStrong" className="text-center">
          {I18n.t('cloud_sync.captcha_title')}
        </Text>
        {/* Always mounted and always this size; only the opacity above changes. */}
        <View style={styles.widget}>
          <WebViewImpl
            ref={web}
            source={{ html: page(SITE_KEY), baseUrl: `https://${ORIGIN}` }}
            onMessage={onMessage}
            onError={() => {
              if (!ready.current) giveUp('load-failed');
            }}
            onHttpError={() => {
              if (!ready.current) giveUp('http-error');
            }}
            javaScriptEnabled
            domStorageEnabled
            // `about:` lets Turnstile's srcdoc iframe load inside the WebView.
            originWhitelist={['https://*', 'about:*']}
            scrollEnabled={false}
            style={styles.webview}
          />
        </View>
        <Button variant="ghost" size="sm" onPress={() => settle(null)}>
          <Text tone="muted">{I18n.t('common.cancel')}</Text>
        </Button>
      </View>
    </View>
  ) : null;

  return { requestToken, element };
}

const styles = StyleSheet.create({
  // Wider than the form's column (into its side padding), so the fixed
  // 300 pt widget fits on a 320 pt phone.
  overlay: {
    position: 'absolute',
    top: 0,
    right: -16,
    bottom: 0,
    left: -16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 16 },
  widget: { width: 300, height: 72 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
