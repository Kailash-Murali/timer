import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, lightbar, reduce, remainingAt, type Action, type State } from "./state";

const ready = () => {
  let s = reduce(initialState, { type: "POWER" });
  s = reduce(s, { type: "TIMER" });
  s = reduce(s, { type: "ROLL_START" });
  return reduce(s, { type: "ROLL_DONE", value: 17, source: "RANDOM_ORG" });
};
const run = () => reduce(ready(), { type: "START_PAUSE", now: 1000 });

test("all controller inputs other than Power are locked while off", () => {
  const actions: Action[] = [
    { type: "CLOCK" },
    { type: "TIMER" },
    { type: "ROLL_START" },
    { type: "ROLL_DONE", value: 20, source: "CRYPTO" },
    { type: "START_PAUSE", now: 0 },
    { type: "STOP_CLEAR", now: 0 },
    { type: "RESTART", now: 0 },
    { type: "EXPIRE" },
  ];
  for (const action of actions) assert.equal(reduce(initialState, action), initialState);
});

test("power-up always starts in clock mode; power-off cancels the active deadline", () => {
  const off = reduce(run(), { type: "POWER" });
  assert.equal(off.timer, "IDLE");
  assert.equal(off.endsAt, null);
  assert.equal(off.durationMs, 0); // timer mode shows --:-- after the next power-up
  const on = reduce(off, { type: "POWER" });
  assert.equal(on.power, "ON");
  assert.equal(on.mode, "CLOCK");
});

test("timer actions do not operate in clock mode", () => {
  const s = reduce(ready(), { type: "CLOCK" });
  assert.equal(reduce(s, { type: "START_PAUSE", now: 0 }), s);
  assert.equal(reduce(s, { type: "ROLL_START" }), s);
  assert.equal(reduce(s, { type: "STOP_CLEAR", now: 0 }), s);
  assert.equal(reduce(s, { type: "RESTART", now: 0 }), s);
});

test("generation is fixed to minutes, validates range, and locks duplicate/overlapping actions", () => {
  const loading = reduce(ready(), { type: "ROLL_START" });
  assert.equal(reduce(loading, { type: "ROLL_START" }), loading);
  assert.equal(reduce(loading, { type: "START_PAUSE", now: 0 }), loading);
  assert.equal(reduce(loading, { type: "STOP_CLEAR", now: 0 }), loading);
  assert.equal(reduce(loading, { type: "RESTART", now: 0 }), loading);
  for (const value of [9, 41, 10.5, NaN])
    assert.equal(reduce(loading, { type: "ROLL_DONE", value, source: "CRYPTO" }), loading);
  const result = reduce(loading, { type: "ROLL_DONE", value: 40, source: "CRYPTO" });
  assert.equal(result.durationMs, 40 * 60_000);
  assert.equal(result.remainingMs, result.durationMs);
  assert.equal(result.timer, "IDLE");
  assert.equal(result.rolling, false);
});

test("Square toggles idle → running → paused → running without losing remaining time", () => {
  const running = run();
  assert.equal(running.endsAt, 1_021_000);
  const paused = reduce(running, { type: "START_PAUSE", now: 6000 });
  assert.equal(paused.timer, "PAUSED");
  assert.equal(paused.remainingMs, 1_015_000);
  assert.equal(paused.endsAt, null);
  const resumed = reduce(paused, { type: "START_PAUSE", now: 20_000 });
  assert.equal(resumed.timer, "RUNNING");
  assert.equal(resumed.endsAt, 1_035_000);
});

test("Circle stops and holds an active run; second click clears to the initial set duration", () => {
  const stopped = reduce(run(), { type: "STOP_CLEAR", now: 6000 });
  assert.equal(stopped.timer, "STOPPED");
  assert.equal(stopped.remainingMs, 1_015_000);
  assert.equal(stopped.endsAt, null);
  assert.equal(reduce(stopped, { type: "START_PAUSE", now: 9000 }), stopped);
  const cleared = reduce(stopped, { type: "STOP_CLEAR", now: 9000 });
  assert.equal(cleared.timer, "IDLE");
  assert.equal(cleared.durationMs, 0); // back to --:--
  assert.equal(cleared.remainingMs, 0);
  assert.equal(reduce(cleared, { type: "START_PAUSE", now: 0 }), cleared);
});

test("Circle also stops paused timers and is a no-op in idle", () => {
  const paused = reduce(run(), { type: "START_PAUSE", now: 6000 });
  const stopped = reduce(paused, { type: "STOP_CLEAR", now: 20_000 });
  assert.equal(stopped.remainingMs, paused.remainingMs);
  assert.equal(stopped.timer, "STOPPED");
  const idle = ready();
  assert.equal(reduce(idle, { type: "STOP_CLEAR", now: 0 }), idle);
});

test("Cross restarts from the beginning in every timer state", () => {
  const states: State[] = [
    ready(),
    run(),
    reduce(run(), { type: "START_PAUSE", now: 4000 }),
    reduce(run(), { type: "STOP_CLEAR", now: 4000 }),
  ];
  for (const s of states) {
    const next = reduce(s, { type: "RESTART", now: 12_000 });
    assert.equal(next.timer, "RUNNING");
    assert.equal(next.remainingMs, next.durationMs);
    assert.equal(next.endsAt, 12_000 + next.durationMs);
  }
});

test("generation cannot overlap a running or paused timer", () => {
  const running = run();
  const paused = reduce(running, { type: "START_PAUSE", now: 6000 });
  assert.equal(reduce(running, { type: "ROLL_START" }), running);
  assert.equal(reduce(paused, { type: "ROLL_START" }), paused);
});

test("expiry uses STOPPED at 00:00, not a fifth timer state; Circle then clears", () => {
  const expired = reduce(run(), { type: "EXPIRE" });
  assert.equal(expired.timer, "STOPPED");
  assert.equal(expired.remainingMs, 0);
  assert.equal(expired.endsAt, null);
  const cleared = reduce(expired, { type: "STOP_CLEAR", now: 100 });
  assert.equal(cleared.timer, "IDLE");
  assert.equal(cleared.durationMs, 0);
});

test("mode changes preserve the active deadline; expiration returns to timer mode", () => {
  const clock = reduce(run(), { type: "CLOCK" });
  assert.equal(clock.timer, "RUNNING");
  assert.equal(clock.endsAt, 1_021_000);
  assert.equal(reduce(clock, { type: "EXPIRE" }).mode, "TIMER");
});

test("countdown is deadline-based and clamped at zero", () => {
  assert.equal(remainingAt(run(), 7000), 1_014_000);
  assert.equal(remainingAt(run(), 2_000_000), 0);
});

test("late generation after power-off is ignored", () => {
  const off = reduce(reduce(ready(), { type: "ROLL_START" }), { type: "POWER" });
  assert.equal(off.rolling, false);
  assert.equal(reduce(off, { type: "ROLL_DONE", value: 10, source: "RANDOM_ORG" }), off);
});

test("an unset timer cannot start or restart", () => {
  const unset = reduce(reduce(initialState, { type: "POWER" }), { type: "TIMER" });
  assert.equal(reduce(unset, { type: "START_PAUSE", now: 0 }), unset);
  assert.equal(reduce(unset, { type: "RESTART", now: 0 }), unset);
});

test("lightbar colours follow state", () => {
  const blue = lightbar(reduce(initialState, { type: "POWER" }), 0, 0, 10).color;
  assert.ok(blue[2] > blue[0]);
  const paused = reduce(run(), { type: "START_PAUSE", now: 6000 });
  assert.deepEqual(lightbar(paused, 6000, 0.2, 10).color, [1, 0.82, 0.05]);
  const stopped = reduce(paused, { type: "STOP_CLEAR", now: 7000 });
  assert.deepEqual(lightbar(stopped, 7000, 0, 10).color, [1, 0.08, 0.2]);
  assert.equal(lightbar(reduce(stopped, { type: "POWER" }), 0, 0, 10).intensity, 0);
});
