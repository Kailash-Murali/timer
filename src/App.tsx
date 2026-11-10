import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "./audio";
import { rollRandom } from "./random";
import { ControllerScene, type ButtonId } from "./scene/ControllerScene";
import { initialState, lightbar, reduce, type Action, type State } from "./state";

const CONTROLS: { id: ButtonId; key: string; glyph: string; name: string; label: string }[] = [
  { id: "ps", key: "Space", glyph: "PS", name: "PS button", label: "Power on / off" },
  { id: "l1", key: "A", glyph: "L1", name: "Left shoulder", label: "Clock mode" },
  { id: "r1", key: "D", glyph: "R1", name: "Right shoulder", label: "Timer mode" },
  { id: "triangle", key: "↑", glyph: "△", name: "Triangle", label: "Random 10–40 minutes" },
  { id: "square", key: "←", glyph: "□", name: "Square", label: "Start / pause" },
  { id: "circle", key: "→", glyph: "○", name: "Circle", label: "Stop · press again to reset" },
  { id: "cross", key: "↓", glyph: "✕", name: "Cross", label: "Restart from the beginning" },
];

const LIGHTBAR_LEGEND = [
  { color: "#1254ff", label: "Clock" },
  { color: "linear-gradient(90deg,#1ae0ff,#ffa21f)", label: "Running" },
  { color: "#ffd10d", label: "Paused" },
  { color: "#ff1433", label: "Stopped / time up" },
];

function accentCss(s: State) {
  const { color, intensity } = lightbar(s, Date.now(), 0, 10);
  return { color: `rgb(${color.map((c) => c * 255).join(" ")})`, intensity };
}

function actionFor(id: ButtonId): Action {
  switch (id) {
    case "ps":
      return { type: "POWER" };
    case "l1":
      return { type: "CLOCK" };
    case "r1":
      return { type: "TIMER" };
    case "triangle":
      return { type: "ROLL_START" };
    case "square":
      return { type: "START_PAUSE", now: Date.now() };
    case "circle":
      return { type: "STOP_CLEAR", now: Date.now() };
    case "cross":
      return { type: "RESTART", now: Date.now() };
  }
}

export default function App() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const sceneRef = useRef<ControllerScene | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const helpPanelRef = useRef<HTMLElement>(null);
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const rollToken = useRef(0);
  const [dark, setDark] = useState(false);
  const [help, setHelp] = useState(false);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  const commit = useCallback((action: Action) => {
    const previous = stateRef.current;
    const next = reduce(previous, action);
    if (next === previous) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const press = useCallback(
    (id: ButtonId) => {
      const action = actionFor(id);
      const scene = sceneRef.current;
      scene?.press(id);
      if (!commit(action)) {
        sfx.deny();
        return;
      }
      if (action.type === "POWER") {
        if (stateRef.current.power === "ON") {
          sfx.powerOn();
          scene?.play("flip");
        } else {
          rollToken.current++;
          sfx.powerOff();
          scene?.play("dip");
        }
      } else if (action.type === "ROLL_START") {
        sfx.click();
        scene?.play("tilt");
        const token = ++rollToken.current;
        void rollRandom().then(({ value, source }) => {
          if (token === rollToken.current && commit({ type: "ROLL_DONE", value, source })) {
            sfx.chime();
          }
        });
      } else {
        // Cross restarts in place: no spin.
        sfx.click();
      }
    },
    [commit],
  );

  useEffect(() => {
    let cancelled = false;
    let scene: ControllerScene | null = null;
    void document.fonts.load('600 48px "Saira Semi Condensed"').finally(() => {
      if (cancelled || !stageRef.current) return;
      scene = new ControllerScene(
        stageRef.current,
        () => stateRef.current,
        press,
        () => darkRef.current,
      );
      sceneRef.current = scene;
    });
    return () => {
      cancelled = true;
      rollToken.current++;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [press]);

  useEffect(() => {
    if (state.timer !== "RUNNING" || state.endsAt === null) return;
    const id = setTimeout(() => commit({ type: "EXPIRE" }), Math.max(0, state.endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [state.timer, state.endsAt, commit]);

  // Alarm pulse once the countdown hits 00:00; stops on reset, restart, or power-off.
  const expired = state.timer === "STOPPED" && state.remainingMs === 0 && state.durationMs > 0;
  useEffect(() => {
    if (!expired) return;
    sfx.alarm();
    let n = 0;
    const id = setInterval(() => (++n >= 15 ? clearInterval(id) : sfx.alarm()), 1200);
    return () => clearInterval(id);
  }, [expired]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?") return setHelp((h) => !h);
      if (e.key === "Escape") return setHelp(false);
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      )
        return;

      let id: ButtonId | undefined;
      switch (e.code) {
        case "Space":
          id = "ps";
          break;
        case "KeyA":
          id = "l1";
          break;
        case "KeyD":
          id = "r1";
          break;
        case "ArrowUp":
          id = "triangle";
          break;
        case "ArrowLeft":
          id = "square";
          break;
        case "ArrowRight":
          id = "circle";
          break;
        case "ArrowDown":
          id = "cross";
          break;
        default: {
          const digit = /^(?:Digit|Numpad)([0-6])$/.exec(e.code)?.[1];
          const legacyMap: Record<string, ButtonId> = {
            "0": "ps",
            "1": "l1",
            "2": "r1",
            "3": "triangle",
            "4": "square",
            "5": "circle",
            "6": "cross",
          };
          if (digit && legacyMap[digit]) {
            id = legacyMap[digit];
          }
          break;
        }
      }

      if (!id) return;
      e.preventDefault();
      press(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  useEffect(() => {
    if (!help) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (helpPanelRef.current?.contains(target)) return;
      if (helpToggleRef.current?.contains(target)) return;
      setHelp(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [help]);

  const accent = accentCss(state);

  return (
    <main
      className="app"
      data-theme={dark ? "dark" : "light"}
      data-power={state.power}
      data-mode={state.mode}
      data-timer={state.timer}
      data-loading={state.rolling}
      data-duration={state.durationMs}
      data-remaining={state.remainingMs}
      data-source={state.source ?? ""}
    >
      <div className="controller-shadow" aria-hidden="true" />
      <div
        className="floor-glow"
        aria-hidden="true"
        style={{ backgroundColor: accent.color, opacity: 0.32 * accent.intensity }}
      />
      <div ref={stageRef} className="absolute inset-0" />
      <h1 className="app-title">Let’s Play</h1>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setDark((value) => !value)}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={dark}
        title={dark ? "Light mode" : "Dark mode"}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {dark ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
            </>
          ) : (
            <path d="M20.7 13.1A9 9 0 0 1 10.9 3.3 9 9 0 1 0 20.7 13.1Z" />
          )}
        </svg>
      </button>
      <button
        ref={helpToggleRef}
        type="button"
        className="help-toggle"
        onClick={() => setHelp((h) => !h)}
        aria-label="Toggle control legend (?)"
        aria-expanded={help}
        aria-controls="legend"
        data-open={help}
      >
        ?
      </button>
      <section ref={helpPanelRef} id="legend" aria-label="Control legend" className="help-panel" data-open={help}>
        <h2>Controls</h2>
        <ul className="help-rows">
          {CONTROLS.map((c) => (
            <li key={c.id}>
              <kbd>{c.key}</kbd>
              <span className="help-glyph">{c.glyph}</span>
              <span className="help-name">{c.name}</span>
              <span className="help-action">{c.label}</span>
            </li>
          ))}
        </ul>
        <h2>Lightbar</h2>
        <ul className="help-lightbar">
          {LIGHTBAR_LEGEND.map((l) => (
            <li key={l.label}>
              <span style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      </section>
      <div className="sr-only" role="group" aria-label="Controller controls">
        {CONTROLS.map((control) => (
          <button
            type="button"
            key={control.id}
            aria-keyshortcuts={control.key}
            onClick={() => press(control.id)}
            disabled={control.id !== "ps" && state.power === "OFF"}
          >
            {control.label}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {state.power === "OFF"
          ? "Power off"
          : `${state.mode}. ${state.rolling ? "Generating duration" : state.timer}.${state.source === "CRYPTO" ? " Using local secure random fallback." : ""}`}
      </p>
    </main>
  );
}
