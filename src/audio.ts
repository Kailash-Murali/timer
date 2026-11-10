let ctx: AudioContext | null = null;

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  gain: number,
  type: OscillatorType = "sine",
  endFreq?: number,
) {
  const c = ac();
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Vibration where supported (mobile); paired with every sound cue. */
const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

export const sfx = {
  click() {
    tone(2400, 0, 0.035, 0.07, "triangle", 1200);
    tone(180, 0, 0.05, 0.05, "sine", 90);
    buzz(8);
  },
  deny() {
    tone(170, 0, 0.07, 0.05, "square");
    tone(140, 0.09, 0.09, 0.05, "square");
    buzz([12, 40, 12]);
  },
  chime() {
    [880, 1318.5, 1760].forEach((f, i) => tone(f, i * 0.07, 0.9 - i * 0.15, 0.09, "sine"));
    buzz(20);
  },
  powerOn() {
    tone(220, 0, 0.4, 0.07, "sine", 880);
    tone(1320, 0.32, 0.6, 0.06, "sine");
    buzz(30);
  },
  powerOff() {
    tone(700, 0, 0.32, 0.07, "sine", 110);
    buzz(20);
  },
  alarm() {
    [0, 0.14, 0.28].forEach((d) => tone(1046.5, d, 0.1, 0.09, "square"));
    buzz([120, 60, 120]);
  },
};
