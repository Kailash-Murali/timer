import { remainingAt, type State } from "../state";

export const DISPLAY_W = 1024;
export const DISPLAY_H = 528;
export const FONT = '"Saira Semi Condensed", system-ui, sans-serif';

const pad = (n: number) => String(n).padStart(2, "0");

/** Touchpad readout. `t` = seconds (drives the reels), `dark` = console colourway. */
export function drawDisplay(
  ctx: CanvasRenderingContext2D,
  s: State,
  now: number,
  t: number,
  dark: boolean,
) {
  ctx.fillStyle = dark ? "#1b1d25" : "#e0e2ed";
  ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
  if (s.power === "OFF") return;

  const ink = dark ? "#eef0f7" : "#11131b";
  const dim = dark ? "#8a8fa3" : "#6b6e80";
  const date = new Date(now);
  const seconds = Math.ceil(remainingAt(s, now) / 1000);
  let text: string;
  if (s.mode === "CLOCK") text = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  else if (s.rolling) text = "00:00";
  else if (s.durationMs === 0) text = "--:--";
  else text = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

  const size = 290;
  const cy = DISPLAY_H * 0.45;
  ctx.fillStyle = ink;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cell = ctx.measureText("0").width;
  const widths = [...text].map((ch) => (ch === ":" ? cell * 0.45 : cell));
  let x = (DISPLAY_W - widths.reduce((sum, w) => sum + w, 0)) / 2;
  [...text].forEach((ch, i) => {
    const cx = x + widths[i] / 2;
    if (s.mode === "TIMER" && s.rolling && i < 2) {
      // Slot-machine reel for the minute digits while a duration is generated.
      const pos = t * (9 + i * 1.7) + i * 3.3;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - cell / 2, cy - size * 0.48, cell, size * 0.96);
      ctx.clip();
      for (let k = -1; k <= 1; k++) {
        const off = (k - (pos % 1)) * size * 0.9;
        ctx.globalAlpha = 1 - Math.min(1, Math.abs(off) / (size * 0.7));
        ctx.fillText(String((((Math.floor(pos) + k) % 10) + 10) % 10), cx, cy + off);
      }
      ctx.restore();
    } else {
      ctx.fillText(ch, cx, cy);
    }
    x += widths[i];
  });

  ctx.font = `600 ${s.mode === "CLOCK" ? 52 : 36}px ${FONT}`;
  ctx.letterSpacing = "5px";
  ctx.fillStyle = s.mode === "CLOCK" ? ink : dim;
  const label =
    s.mode === "CLOCK"
      ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
      : s.rolling
        ? "ROLLING"
        : s.durationMs === 0
          ? "TIMER"
          : s.timer;
  ctx.fillText(label, DISPLAY_W / 2, 448);
  ctx.letterSpacing = "0px";
  // Small amber dot when the local crypto fallback supplied the duration.
  if (s.mode === "TIMER" && !s.rolling && s.source === "CRYPTO") {
    ctx.beginPath();
    ctx.arc(DISPLAY_W / 2 + 140, 445, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#c08a2a";
    ctx.fill();
  }
}
