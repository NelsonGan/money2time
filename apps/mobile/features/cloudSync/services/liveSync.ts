// Live updates from the cloud-sync Worker (src/live.ts there). See README.md >
// Cloud Sync > How it works (When it runs).
//
// While the app is open and signed in, one WebSocket to the Worker hears when
// another phone pushed changes to a channel this user reads (their own data,
// or a shared ledger), so this phone syncs it within a second or two instead
// of at the next scheduled pull. Messages carry only the channel name; the
// data still comes through Turso. The socket closes in the background and
// reconnects with backoff; every reconnect counts as a change (a push may
// have been missed while it was down).

import * as Crypto from 'expo-crypto';
import { AppState, type AppStateStatus } from 'react-native';

import { type LiveChange, parseLiveMessage, retryDelay } from '../lib/liveMessages';
import { liveUrl } from './cloudSyncApi';

/** This run of the app, so the Worker does not tell a phone of its own push. */
export const LIVE_DEVICE_ID = Crypto.randomUUID();

/**
 * React Native's WebSocket takes request headers as a third argument (the
 * DOM typings the app compiles against do not know it).
 */
const NativeWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: string | string[] | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

const PING_EVERY_MS = 25_000;
/** The Worker's close code for a socket replaced by a newer one (src/live.ts). */
const CLOSE_REPLACED = 4001;
export interface LiveSyncOptions {
  getSessionToken: () => Promise<string>;
  onChange: (change: LiveChange) => void;
  /** Connected again after a drop or a return to the app: catch up. */
  onReconnect: () => void;
}

/**
 * Starts listening; returns a function that stops. Holds no state between
 * runs: a sign-out stops it and a sign-in starts a new one.
 */
export function startLiveSync(options: LiveSyncOptions): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let everConnected = false;
  /** Reconnecting on return to the app, which syncs by itself: no catch-up. */
  let quietReconnect = false;

  const clearTimers = () => {
    if (ping) clearInterval(ping);
    if (retry) clearTimeout(retry);
    ping = null;
    retry = null;
  };

  const close = () => {
    clearTimers();
    const current = socket;
    socket = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      try {
        current.close();
      } catch {
        // Already closed.
      }
    }
  };

  const scheduleRetry = () => {
    if (stopped || retry || AppState.currentState !== 'active') return;
    retry = setTimeout(() => {
      retry = null;
      void connect();
    }, retryDelay(attempt));
    attempt += 1;
  };

  const connect = async () => {
    if (stopped || socket || AppState.currentState !== 'active') return;
    let url: string;
    let token: string;
    try {
      [url, token] = await Promise.all([liveUrl(LIVE_DEVICE_ID), options.getSessionToken()]);
    } catch {
      scheduleRetry();
      return;
    }
    if (stopped || socket || AppState.currentState !== 'active') return;
    const next = new NativeWebSocket(url, undefined, {
      headers: { Authorization: `Bearer ${token}` },
    });
    socket = next;
    next.onopen = () => {
      attempt = 0;
      if (ping) clearInterval(ping);
      ping = setInterval(() => {
        try {
          next.send('ping');
        } catch {
          // The close handler reconnects.
        }
      }, PING_EVERY_MS);
      // The first connection follows a sync of its own, and so does a return
      // to the app; a reconnect after a drop catches up.
      if (everConnected && !quietReconnect) options.onReconnect();
      everConnected = true;
      quietReconnect = false;
    };
    next.onmessage = (event) => {
      const change = parseLiveMessage(event.data);
      if (change) options.onChange(change);
    };
    next.onclose = (event) => {
      if (socket !== next) return;
      // Replaced by a newer socket of this run of the app: let that one be.
      if (event.code === CLOSE_REPLACED) {
        socket = null;
        if (ping) clearInterval(ping);
        ping = null;
        return;
      }
      socket = null;
      if (ping) clearInterval(ping);
      ping = null;
      scheduleRetry();
    };
    // An error is followed by a close, which reconnects.
    next.onerror = () => undefined;
  };

  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') {
      attempt = 0;
      // Only a socket closed in the background is reopened quietly; one kept
      // through a brief inactive spell must not swallow a later catch-up.
      if (!socket) quietReconnect = true;
      void connect();
    } else if (state === 'background') {
      // The OS would cut it anyway; the return to the app syncs.
      close();
    }
  };

  const subscription = AppState.addEventListener('change', onAppState);
  void connect();

  return () => {
    stopped = true;
    subscription.remove();
    close();
  };
}
