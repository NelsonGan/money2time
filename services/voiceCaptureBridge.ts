/**
 * Publishes the live voice-capture session so a surface that already has room
 * for it — the + sheet — can draw the "listening" UI *inside itself* instead of
 * letting a full-screen overlay float over the top.
 *
 * A module bridge rather than a context, like `scanCameraNavigation` and
 * `receiptSplitBridge`: the session lives in `VoiceQuickAddOverlay` (mounted
 * once by the app shell) and the host is an unrelated component several levels
 * away, so threading it through the tree would mean a provider whose only job
 * is to relay two values.
 */

export interface VoiceCaptureState {
  recording: boolean;
  /** Interim transcript, updated as the user speaks. */
  liveTranscript: string;
  /** Instruction under "Listening…"; hold-to-release vs tap-to-stop. */
  hint?: string;
  /**
   * Bumped every time a session finishes — including one that never started
   * (permission denied, Pro limit, a native throw). An inline host needs this
   * as its own signal: those paths bail before `recording` is ever true, so
   * watching `recording` fall to false would leave the host waiting forever on
   * a session that is already over.
   */
  endedNonce: number;
}

const IDLE: VoiceCaptureState = { recording: false, liveTranscript: '', endedNonce: 0 };

let state: VoiceCaptureState = IDLE;
const stateListeners = new Set<(next: VoiceCaptureState) => void>();

export function publishVoiceCapture(next: Omit<VoiceCaptureState, 'endedNonce'>) {
  state = { ...next, endedNonce: state.endedNonce };
  stateListeners.forEach((listener) => listener(state));
}

/** Marks the current session finished, however it ended. */
export function publishVoiceSessionEnded() {
  state = { ...state, recording: false, endedNonce: state.endedNonce + 1 };
  stateListeners.forEach((listener) => listener(state));
}

/**
 * The current state, read synchronously. A host must baseline `endedNonce`
 * against *this* rather than its own last-subscribed copy: it only subscribes
 * while its panel is up, so its local copy is stale between sessions and
 * comparing against it would fire the "session ended" branch immediately.
 */
export function getVoiceCaptureState(): VoiceCaptureState {
  return state;
}

/** Subscribes and immediately replays the current state, so a host that mounts
 *  mid-session paints the right thing on its first render. */
export function subscribeVoiceCapture(listener: (next: VoiceCaptureState) => void) {
  stateListeners.add(listener);
  listener(state);
  return () => {
    stateListeners.delete(listener);
  };
}

let hostCount = 0;
const hostListeners = new Set<(hosted: boolean) => void>();

function notifyHosts() {
  const hosted = hostCount > 0;
  hostListeners.forEach((listener) => listener(hosted));
}

/**
 * Claim the capture UI for an inline host. While anything holds a claim the
 * full-screen overlay renders nothing, so the two can never both be on screen.
 * Returns the release function — call it on unmount.
 */
export function claimInlineVoiceHost() {
  hostCount += 1;
  notifyHosts();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hostCount -= 1;
    notifyHosts();
  };
}

export function subscribeInlineVoiceHost(listener: (hosted: boolean) => void) {
  hostListeners.add(listener);
  listener(hostCount > 0);
  return () => {
    hostListeners.delete(listener);
  };
}
