# Let's Play — 3D DualSense Timer & Clock

An interactive 3D DualSense/PS4 controller-inspired clock and countdown timer built with **React 19**, **Three.js**, **Tailwind CSS v4**, and **Vite**.

Includes tactile feedback, realistic 3D lighting, animated button presses, randomized intervals (via random.org with cryptographic fallback), and customizable audio cues.

---

## Prerequisites

- **Node.js**: v20 or higher (v22+ recommended)
- **pnpm**: v9 or higher

Check your installed versions:

```bash
node -v
pnpm -v
```

If you do not have `pnpm` installed:

```bash
npm install -g pnpm
```

---

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/kailash-murali/timer.git
   cd timer
   ```
2. **Install dependencies:**

   ```bash
   pnpm install
   ```
3. **Start the development server:**

   ```bash
   pnpm dev
   ```

   Open the browser URL displayed in your terminal (usually `http://localhost:5173`).
4. **Build for production:**

   ```bash
   pnpm build
   ```
5. **Preview production build:**

   ```bash
   pnpm preview
   ```

---

## Controls & Keybindings

You can interact with the app by clicking directly on the 3D controller buttons or by using your keyboard:

|            Key            |         Button         | Action                                                       |
| :------------------------: | :---------------------: | :----------------------------------------------------------- |
|      **Space**      |   **PS Button**   | Power on / off the controller                                |
|        **A**        |      **L1**      | Switch to **Clock** mode                               |
|        **D**        |      **R1**      | Switch to **Timer** mode                               |
|  **↑** (Up Arrow)  | **△** (Triangle) | Roll random duration (10–40 min)                            |
| **←** (Left Arrow) |  **□** (Square)  | Start / pause timer                                          |
| **→** (Right Arrow) |  **○** (Circle)  | Stop timer (press again to reset to `--:--`)               |
| **↓** (Down Arrow) |  **✕** (Cross)  | Restart countdown from the beginning                         |
|        **?**        |           —           | Open / close help & legend panel (or click outside to close) |

---

## Project Structure

```text
├── src/
│   ├── scene/
│   │   ├── ControllerScene.ts   # Three.js 3D controller model & lighting
│   │   └── display.ts           # Digital touchpad canvas renderer
│   ├── App.tsx                  # Root application & keyboard binding logic
│   ├── audio.ts                 # Web Audio API sound effects
│   ├── random.ts                # random.org duration fetcher & fallback
│   ├── state.ts                 # State machine reducer & lightbar colors
│   └── index.css                # Global styling & Tailwind CSS v4 setup
├── index.html                   # HTML entry template
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript configuration
└── vite.config.ts               # Vite build configuration
```
