export type Power = "OFF" | "ON";
export type Mode = "CLOCK" | "TIMER";
export type TimerState = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";
export type Source = "RANDOM_ORG" | "CRYPTO";

export interface State {
  power: Power;
  mode: Mode;
  timer: TimerState;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  rolling: boolean;
  source: Source | null;
}

export type Action =
  | { type: "POWER" }
  | { type: "CLOCK" }
  | { type: "TIMER" }
  | { type: "ROLL_START" }
  | { type: "ROLL_DONE"; value: number; source: Source }
  | { type: "START_PAUSE"; now: number }
  | { type: "STOP_CLEAR"; now: number }
  | { type: "RESTART"; now: number }
  | { type: "EXPIRE" };

export const initialState: State = {
  power: "OFF",
  mode: "CLOCK",
  timer: "IDLE",
  durationMs: 0,
  remainingMs: 0,
  endsAt: null,
  rolling: false,
  source: null,
};

/** Pure transitions. Rejected actions preserve object identity. */
export function reduce(s: State, a: Action): State {
  if (a.type === "POWER") {
    return s.power === "OFF"
      ? { ...s, power: "ON", mode: "CLOCK" }
      : {
          ...s,
          power: "OFF",
          timer: "IDLE",
          durationMs: 0,
          remainingMs: 0,
          endsAt: null,
          rolling: false,
          source: null,
        };
  }
  if (s.power === "OFF") return s;

  switch (a.type) {
    case "CLOCK":
      return s.mode === "CLOCK" ? s : { ...s, mode: "CLOCK" };
    case "TIMER":
      return s.mode === "TIMER" ? s : { ...s, mode: "TIMER" };
    case "EXPIRE":
      return s.timer === "RUNNING"
        ? { ...s, timer: "STOPPED", mode: "TIMER", remainingMs: 0, endsAt: null }
        : s;
    case "ROLL_DONE": {
      if (!s.rolling || !Number.isInteger(a.value) || a.value < 10 || a.value > 40) return s;
      const durationMs = a.value * 60_000;
      return {
        ...s,
        rolling: false,
        source: a.source,
        durationMs,
        remainingMs: durationMs,
        timer: "IDLE",
        endsAt: null,
      };
    }
  }

  if (s.mode !== "TIMER" || s.rolling) return s;

  switch (a.type) {
    case "ROLL_START":
      // A new generation cannot overlap an active or paused run.
      return s.timer === "RUNNING" || s.timer === "PAUSED" ? s : { ...s, rolling: true };
    case "START_PAUSE":
      if (s.timer === "RUNNING") {
        const remainingMs = remainingAt(s, a.now);
        return {
          ...s,
          timer: remainingMs > 0 ? "PAUSED" : "STOPPED",
          remainingMs,
          endsAt: null,
        };
      }
      if ((s.timer !== "IDLE" && s.timer !== "PAUSED") || s.remainingMs <= 0) return s;
      return { ...s, timer: "RUNNING", endsAt: a.now + s.remainingMs };
    case "STOP_CLEAR":
      if (s.timer === "RUNNING" || s.timer === "PAUSED") {
        return { ...s, timer: "STOPPED", remainingMs: remainingAt(s, a.now), endsAt: null };
      }
      // Second press returns to the untouched timer: --:--.
      return s.timer === "STOPPED"
        ? { ...s, timer: "IDLE", durationMs: 0, remainingMs: 0, endsAt: null, source: null }
        : s;
    case "RESTART":
      return s.durationMs > 0
        ? { ...s, timer: "RUNNING", remainingMs: s.durationMs, endsAt: a.now + s.durationMs }
        : s;
  }
}

export function remainingAt(s: State, now: number) {
  return s.timer === "RUNNING" && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

type RGB = [number, number, number];

/** Lightbar colour + intensity. `t` = seconds (for pulses), `since` = seconds since the last timer change. */
export function lightbar(
  s: State,
  now: number,
  t: number,
  since: number,
): { color: RGB; intensity: number } {
  const pulse = (hz: number) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * hz);
  const crimson: RGB = [1, 0.08, 0.2];
  if (s.power === "OFF") return { color: [0.07, 0.33, 1], intensity: 0 };
  if (s.rolling) return { color: [0.55, 0.95, 1], intensity: 0.55 + 0.45 * pulse(6) };
  if (s.mode === "CLOCK") return { color: [0.07, 0.33, 1], intensity: 1 };
  switch (s.timer) {
    case "RUNNING": {
      // Cyan drifting to amber as the countdown drains.
      const k = s.durationMs > 0 ? 1 - remainingAt(s, now) / s.durationMs : 0;
      const e = k * k;
      return { color: [0.1 + 0.9 * e, 0.88 - 0.22 * e, 1 - 0.88 * e], intensity: 1 };
    }
    case "PAUSED":
      return { color: [1, 0.82, 0.05], intensity: 0.25 + 0.75 * pulse(1.2) };
    case "STOPPED":
      // Expired (00:00) strobes; a manual stop flashes, then holds a dim crimson.
      if (s.remainingMs === 0)
        return { color: crimson, intensity: Math.floor(t * 6) % 2 ? 0.1 : 1 };
      return {
        color: crimson,
        intensity: since < 1.2 ? (Math.floor(since * 8) % 2 ? 0.15 : 1) : 0.45,
      };
    default:
      return { color: [0.13, 0.83, 0.93], intensity: 0.55 };
  }
}
