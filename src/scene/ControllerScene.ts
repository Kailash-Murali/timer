import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { lightbar, type State } from "../state";
import { DISPLAY_H, DISPLAY_W, drawDisplay } from "./display";

export type ButtonId = "ps" | "l1" | "r1" | "triangle" | "square" | "circle" | "cross";
export type AnimKind = "flip" | "tilt" | "dip";

type V2 = [number, number];

// ---------- Geometry constants (shape units, y-up, centre-top of controller at y≈1.6) ----------
const DEPTH = 0.62;
const BEVEL_T = 0.18;
const FRONT = DEPTH / 2 + BEVEL_T;

const START: V2 = [0, 1.62];
/** Right half of the silhouette, clockwise from top-centre. Left half is mirrored. */
const RIGHT: { to: V2; c1?: V2; c2?: V2 }[] = [
  { to: [1.7, 1.58] },
  { c1: [2.3, 1.62], c2: [2.75, 1.55], to: [3.05, 1.38] },
  { c1: [3.4, 1.2], c2: [3.6, 0.7], to: [3.75, 0.0] },
  { c1: [3.92, -0.8], c2: [4.02, -1.8], to: [3.92, -2.7] },
  { c1: [3.85, -3.35], c2: [3.6, -3.65], to: [3.22, -3.62] },
  { c1: [2.95, -3.6], c2: [2.86, -3.42], to: [2.77, -3.2] },
  { c1: [2.45, -2.5], c2: [2.1, -1.9], to: [1.6, -1.8] },
  { c1: [1.0, -1.7], c2: [0.5, -1.72], to: [0, -1.72] },
];

const FACE: Record<"triangle" | "square" | "circle" | "cross", V2> = {
  triangle: [2.54, 0.78],
  square: [1.92, 0.16],
  circle: [3.16, 0.16],
  cross: [2.54, -0.46],
};
const DPAD: V2 = [-2.54, 0.16];
const STICK_X = 1.3;
const STICK_Y = -0.85;
const PS: V2 = [0, -0.88];

function silhouette() {
  const s = new THREE.Shape();
  s.moveTo(...START);
  for (const seg of RIGHT) {
    if (seg.c1 && seg.c2) s.bezierCurveTo(...seg.c1, ...seg.c2, ...seg.to);
    else s.lineTo(...seg.to);
  }
  const m = (p: V2): V2 => [-p[0], p[1]];
  for (let i = RIGHT.length - 1; i >= 0; i--) {
    const seg = RIGHT[i];
    const from = i === 0 ? START : RIGHT[i - 1].to;
    if (seg.c1 && seg.c2) s.bezierCurveTo(...m(seg.c2), ...m(seg.c1), ...m(from));
    else s.lineTo(...m(from));
  }
  return s;
}

function touchpadShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.56, 1.48);
  s.lineTo(1.56, 1.48);
  s.lineTo(1.34, 0.05);
  s.quadraticCurveTo(1.31, -0.1, 1.15, -0.1);
  s.lineTo(-1.15, -0.1);
  s.quadraticCurveTo(-1.31, -0.1, -1.34, 0.05);
  s.closePath();
  return s;
}

// Black center insert follows the touchpad and the inner edges of both grips,
// matching the white/black separation in the supplied controller reference.
function centerShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.7, 1.5);
  s.lineTo(1.7, 1.5);
  s.bezierCurveTo(1.65, 0.8, 1.6, 0.22, 1.42, -0.05);
  s.bezierCurveTo(1.9, -0.58, 2.68, -2.0, 3.23, -3.59);
  s.bezierCurveTo(2.96, -3.58, 2.86, -3.42, 2.77, -3.2);
  s.bezierCurveTo(2.45, -2.5, 2.1, -1.9, 1.6, -1.8);
  s.bezierCurveTo(1.0, -1.7, 0.5, -1.72, 0, -1.72);
  s.bezierCurveTo(-0.5, -1.72, -1.0, -1.7, -1.6, -1.8);
  s.bezierCurveTo(-2.1, -1.9, -2.45, -2.5, -2.77, -3.2);
  s.bezierCurveTo(-2.86, -3.42, -2.96, -3.58, -3.23, -3.59);
  s.bezierCurveTo(-2.68, -2.0, -1.9, -0.58, -1.42, -0.05);
  s.bezierCurveTo(-1.6, 0.22, -1.65, 0.8, -1.7, 1.5);
  return s;
}

function dpadShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.22);
  s.lineTo(0.19, -0.04);
  s.quadraticCurveTo(0.23, 0, 0.21, 0.1);
  s.lineTo(0.18, 0.21);
  s.quadraticCurveTo(0.16, 0.26, 0.09, 0.26);
  s.lineTo(-0.09, 0.26);
  s.quadraticCurveTo(-0.16, 0.26, -0.18, 0.21);
  s.lineTo(-0.21, 0.1);
  s.quadraticCurveTo(-0.23, 0, -0.19, -0.04);
  s.closePath();
  return s;
}

const shellDrop = (x: number, y: number) =>
  0.5 * Math.pow(x / 4.2, 4) + 0.1 * Math.pow((y + 1) / 3, 4);

const shellNormal = (x: number, y: number) =>
  new THREE.Vector3(
    (2 / 4.2) * Math.pow(x / 4.2, 3),
    (0.4 / 3) * Math.pow((y + 1) / 3, 3),
    1,
  ).normalize();

/** Tessellate only the lid so it can bow like a molded shell instead of a flat metal plate. */
function curveShell(source: THREE.BufferGeometry) {
  const positions: number[] = [];
  const normals: number[] = [];
  const p = source.getAttribute("position");
  const n = source.getAttribute("normal");
  const vertex = (v: THREE.Vector3, normal: THREE.Vector3) => {
    const w = THREE.MathUtils.smoothstep(v.z, -FRONT, FRONT);
    positions.push(v.x, v.y, v.z - shellDrop(v.x, v.y) * w);
    const dx = (2 / 4.2) * Math.pow(v.x / 4.2, 3);
    const dy = (0.4 / 3) * Math.pow((v.y + 1) / 3, 3);
    const curved = new THREE.Vector3(
      normal.x + dx * w * normal.z,
      normal.y + dy * w * normal.z,
      normal.z,
    ).normalize();
    normals.push(curved.x, curved.y, curved.z);
  };
  const lid = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) => {
    // Matching subdivisions on shared edges prevent cracks when the lid curves.
    if (depth < 3) {
      const ab = a.clone().lerp(b, 0.5);
      const bc = b.clone().lerp(c, 0.5);
      const ca = c.clone().lerp(a, 0.5);
      lid(a, ab, ca, depth + 1);
      lid(ab, b, bc, depth + 1);
      lid(ca, bc, c, depth + 1);
      lid(ab, bc, ca, depth + 1);
    } else {
      const normal = new THREE.Vector3(0, 0, 1);
      vertex(a, normal);
      vertex(b, normal);
      vertex(c, normal);
    }
  };
  for (let i = 0; i < p.count; i += 3) {
    const triangle = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, i + j));
    if (n.getZ(i) > 0.9999) lid(triangle[0], triangle[1], triangle[2], 0);
    else triangle.forEach((v, j) => vertex(v, new THREE.Vector3().fromBufferAttribute(n, i + j)));
  }
  source.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return result;
}

function glyphTexture(kind: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.strokeStyle = g.fillStyle = "#fff";
  g.lineWidth = 11;
  g.lineCap = g.lineJoin = "round";
  g.beginPath();
  switch (kind) {
    case "triangle":
      g.moveTo(128, 64);
      g.lineTo(196, 180);
      g.lineTo(60, 180);
      g.closePath();
      break;
    case "circle":
      g.arc(128, 128, 64, 0, Math.PI * 2);
      break;
    case "cross":
      g.moveTo(76, 76);
      g.lineTo(180, 180);
      g.moveTo(180, 76);
      g.lineTo(76, 180);
      break;
    case "square":
      g.rect(72, 72, 112, 112);
      break;
    case "arrow":
      g.moveTo(128, 80);
      g.lineTo(170, 150);
      g.lineTo(86, 150);
      g.closePath();
      g.fill();
      break;
    case "ps":
      g.lineWidth = 17;
      g.moveTo(112, 175);
      g.lineTo(112, 65);
      g.bezierCurveTo(160, 66, 178, 83, 176, 109);
      g.bezierCurveTo(174, 133, 151, 132, 147, 122);
      g.lineTo(147, 91);
      g.moveTo(96, 134);
      g.bezierCurveTo(24, 151, 49, 184, 105, 179);
      g.moveTo(148, 146);
      g.bezierCurveTo(221, 148, 213, 164, 148, 180);
      break;
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function remapUV(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y));
  uv.needsUpdate = true;
}

// ---------- Scene ----------
interface Btn {
  id: ButtonId;
  obj: THREE.Object3D;
  base: THREE.Vector3;
  axis: THREE.Vector3; // press direction
  mat: THREE.MeshPhysicalMaterial;
  p: number;
  hover: number;
}

const SHELL_LIGHT = new THREE.Color("#e4e5f0");
const SHELL_DARK = new THREE.Color("#111217");
const KEYS_LIGHT = new THREE.Color("#c8ccdc");
const KEYS_DARK = new THREE.Color("#2a2c35");

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const DUR: Record<AnimKind, number> = { flip: 1.25, tilt: 1.1, dip: 0.7 };

export class ControllerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private buttons: Btn[] = [];
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private mouse = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private anims: { kind: AnimKind; start: number }[] = [];
  private last = performance.now() / 1000;
  private raf = 0;
  private ro: ResizeObserver;
  private dispCtx: CanvasRenderingContext2D;
  private dispTex: THREE.CanvasTexture;
  private strips: THREE.MeshBasicMaterial[] = [];
  private glows: THREE.MeshBasicMaterial[] = [];
  // Colourway materials that switch between white (light) and Midnight Black (dark).
  private shellMat!: THREE.MeshPhysicalMaterial;
  private keyMats: THREE.MeshPhysicalMaterial[] = [];
  private prevTimer: State["timer"] = "IDLE";
  private timerAt = 0;
  private keyLight = new THREE.DirectionalLight(0xffffff, 2);
  private cursorLight = new THREE.PointLight(0xffffff, 1, 0, 2);
  private hovered: Btn | null = null;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private container: HTMLElement,
    private getState: () => State,
    private onPress: (id: ButtonId) => void,
    private isDark: () => boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    container.appendChild(canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    this.keyLight.position.set(5, 6, 8);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
    rim.position.set(-6, -2, -6);
    this.scene.add(
      this.keyLight,
      rim,
      this.cursorLight,
      new THREE.AmbientLight(0xc5d1f2, 0.4),
      this.pivot,
    );

    // Display canvas
    const dc = document.createElement("canvas");
    dc.width = DISPLAY_W;
    dc.height = DISPLAY_H;
    this.dispCtx = dc.getContext("2d")!;
    this.dispTex = new THREE.CanvasTexture(dc);
    this.dispTex.colorSpace = THREE.SRGBColorSpace;
    this.dispTex.anisotropy = 8;

    this.build();
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Interactive white DualSense controller with clock and timer touchpad",
    );

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("pointermove", this.onPointerMove);
    this.raf = requestAnimationFrame(this.frame);
  }

  private build() {
    const rig = new THREE.Group();
    rig.position.y = 0.95;
    this.pivot.add(rig);

    const white = new THREE.MeshPhysicalMaterial({
      color: "#e4e5f0",
      metalness: 0,
      roughness: 0.42,
      clearcoat: 0.2,
      clearcoatRoughness: 0.35,
    });
    const keys = new THREE.MeshPhysicalMaterial({
      color: "#c8ccdc",
      metalness: 0,
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.22,
    });
    const black = new THREE.MeshPhysicalMaterial({
      color: "#070910",
      metalness: 0,
      roughness: 0.55,
      specularIntensity: 0.3,
    });
    const rubber = new THREE.MeshPhysicalMaterial({
      color: "#11131d",
      metalness: 0,
      roughness: 0.85,
    });
    const rim = new THREE.MeshPhysicalMaterial({
      color: "#747b91",
      metalness: 0,
      roughness: 0.5,
      specularIntensity: 0.3,
    });

    this.shellMat = white;
    this.keyMats.push(keys);

    // Molded plastic shell; no metallic finish or annotated texture.
    const bodyGeo = new THREE.ExtrudeGeometry(silhouette(), {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL_T,
      bevelSize: 0.18,
      bevelSegments: 10,
      curveSegments: 16,
    });
    bodyGeo.translate(0, 0, -DEPTH / 2);
    rig.add(new THREE.Mesh(curveShell(bodyGeo), white));

    const center = new THREE.Mesh(
      new THREE.ExtrudeGeometry(centerShape(), {
        depth: 0.025,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 3,
        curveSegments: 36,
      }),
      black,
    );
    center.position.z = FRONT + 0.006;
    rig.add(center);

    // Rear casing and seam visible during the existing 3D flip.
    const back = new THREE.Mesh(new THREE.ShapeGeometry(silhouette(), 48), black);
    back.position.z = -FRONT - 0.002;
    back.rotation.y = Math.PI;
    rig.add(back);

    // Pale physical touchpad with plain black digits, as in the reference.
    const tpGeo = new THREE.ShapeGeometry(touchpadShape(), 24);
    remapUV(tpGeo);
    const tp = new THREE.Mesh(
      tpGeo,
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        map: this.dispTex,
        metalness: 0,
        roughness: 0.65,
        specularIntensity: 0.1,
        clearcoat: 0.08,
        clearcoatRoughness: 0.65,
        emissive: "#c8cfe8",
        emissiveMap: this.dispTex,
        emissiveIntensity: 0.08,
      }),
    );
    tp.position.z = FRONT + 0.06;
    rig.add(tp);

    // Lightbar strips + additive glow.
    const glowTex = glowTexture();
    for (const sx of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(sx * 1.63, 1.42, FRONT + 0.065),
        new THREE.Vector3(sx * 1.53, 0.6, FRONT + 0.065),
        new THREE.Vector3(sx * 1.39, -0.06, FRONT + 0.065),
      );
      const strip = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
      rig.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.03, 8), strip));
      const glow = new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.1), glow);
      plane.position.set(sx * 1.52, 0.68, FRONT + 0.08);
      plane.rotation.z = sx * -0.16;
      plane.raycast = () => {}; // purely visual; must not block clicks on nearby buttons
      rig.add(plane);
      this.strips.push(strip);
      this.glows.push(glow);
    }

    const decal = (kind: string, size: number) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: glyphTexture(kind),
          transparent: true,
          depthWrite: false,
          color: 0x7b8299,
        }),
      );
    const zAxis = new THREE.Vector3(0, 0, -1);

    // Face buttons.
    for (const [id, [x, y]] of Object.entries(FACE) as [ButtonId, V2][]) {
      const mat = keys.clone();
      mat.emissive = new THREE.Color(0);
      this.keyMats.push(mat);
      const g = new THREE.Group();
      const well = new THREE.Mesh(new THREE.TorusGeometry(0.282, 0.013, 12, 48), rim);
      well.position.set(x, y, FRONT + 0.024 - shellDrop(x, y));
      well.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), shellNormal(x, y));
      rig.add(well);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.12, 48), mat);
      cap.rotation.x = Math.PI / 2;
      const d = decal(id, 0.4);
      d.position.z = 0.061;
      g.add(cap, d);
      g.position.set(x, y, FRONT + 0.06 - shellDrop(x, y));
      g.quaternion.copy(well.quaternion);
      rig.add(g);
      this.addButton(id, g, shellNormal(x, y).negate(), mat);
    }

    // PS / power button.
    {
      const mat = black.clone();
      mat.emissive = new THREE.Color(0);
      const g = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 40), mat);
      cap.rotation.x = Math.PI / 2;
      const d = decal("ps", 0.36);
      d.material.color.set("#b9bdcc");
      d.position.z = 0.051;
      g.add(cap, d);
      g.position.set(PS[0], PS[1], FRONT + 0.07);
      rig.add(g);
      this.addButton("ps", g, zAxis, mat);
    }

    // Shoulder bumpers L1 / R1 — press downward.
    for (const [id, sx] of [
      ["l1", -1],
      ["r1", 1],
    ] as const) {
      const mat = black.clone();
      mat.emissive = new THREE.Color(0);
      const m = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.5, 0.62, 4, 0.16), mat);
      m.position.set(sx * 2.5, 1.74, -0.02);
      m.rotation.z = sx * -0.07;
      rig.add(m);
      this.addButton(id, m, new THREE.Vector3(0, -1, -0.4).normalize(), mat);
    }

    // Four separated directional keys, not a metal cross or an etched circle.
    for (const [dx, dy, rot] of [
      [0, 1, 0],
      [0, -1, Math.PI],
      [-1, 0, Math.PI / 2],
      [1, 0, -Math.PI / 2],
    ]) {
      const g = new THREE.Group();
      const cap = new THREE.Mesh(
        new THREE.ExtrudeGeometry(dpadShape(), {
          depth: 0.09,
          bevelSize: 0.028,
          bevelThickness: 0.025,
          bevelSegments: 4,
          curveSegments: 12,
        }),
        keys,
      );
      g.add(cap);
      const d = decal("arrow", 0.2);
      d.position.set(0, 0.05, 0.118);
      g.add(d);
      g.rotation.z = rot;
      const x = DPAD[0] + dx * 0.28;
      const y = DPAD[1] + dy * 0.28;
      g.position.set(x, y, FRONT + 0.02 - shellDrop(x, y));
      g.quaternion.premultiply(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), shellNormal(x, y)),
      );
      rig.add(g);
    }

    // Decorative thumbsticks.
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.07, 16, 64), black);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.4, 0.21, 48), rubber);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.14;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 16, 64), rubber);
      lip.position.z = 0.235;
      g.add(ring, cap, lip);
      g.position.set(sx * STICK_X, STICK_Y, FRONT + 0.06);
      rig.add(g);
    }

    // Create / Options pills.
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.17, 4, 12), keys);
      m.position.set(sx * 1.9, 1.12, FRONT + 0.035);
      m.rotation.z = sx * 0.3;
      rig.add(m);
    }
    // Recessed grille and physical mic button are visual details, never audio controls.
    for (let row = 0; row < 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), rubber);
        hole.position.set(col * 0.085, -0.3 - row * 0.075, FRONT + 0.052);
        rig.add(hole);
      }
    }
    const mic = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.045, 0.055, 2, 0.015), black);
    mic.position.set(0, -1.35, FRONT + 0.07);
    rig.add(mic);
  }

  private addButton(
    id: ButtonId,
    obj: THREE.Object3D,
    axis: THREE.Vector3,
    mat: THREE.MeshPhysicalMaterial,
  ) {
    obj.traverse((o) => (o.userData.buttonId = id));
    this.buttons.push({
      id,
      obj,
      base: obj.position.clone(),
      axis,
      mat,
      p: 0,
      hover: 0,
    });
  }

  /** Visual press: depress along the button's axis with a local glow. */
  press(id: ButtonId) {
    const b = this.buttons.find((b) => b.id === id);
    if (b) b.p = 1;
  }

  play(kind: AnimKind) {
    if (this.reducedMotion) return;
    // One action animation at a time; inputs still change state immediately.
    if (this.anims.length) return;
    this.anims.push({ kind, start: performance.now() / 1000 });
  }

  private pick(e: MouseEvent): ButtonId | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    // Only the nearest surface counts, so a button hidden behind the body (mid-flip) can't be hit.
    const hit = this.raycaster.intersectObject(this.pivot, true)[0];
    return (hit?.object.userData.buttonId as ButtonId | undefined) ?? null;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const id = this.pick(e);
    if (id) this.onPress(id);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.reducedMotion)
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.target !== this.renderer.domElement) {
      this.hovered = null;
      return;
    }
    const id = this.pick(e);
    this.hovered = this.buttons.find((b) => b.id === id) ?? null;
    this.renderer.domElement.style.cursor = id ? "pointer" : "default";
  };

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(4.4 / tan, 4.7 / (tan * this.camera.aspect));
    // Sit the controller slightly below centre to leave room for the title.
    this.camera.position.set(0, 0.8, dist);
    this.camera.updateProjectionMatrix();
  }

  private frame = (ts: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const t = ts / 1000;
    const dt = Math.min(Math.max(t - this.last, 0), 0.05);
    this.last = t;
    const s = this.getState();
    const now = Date.now();

    // --- Motion: cursor parallax + additive action animations ---
    const k = 1 - Math.exp(-dt * 6);
    // Smoothed cursor tilt; animation offsets are added on top so spins land exactly back at rest.
    this.tilt.x += (this.mouse.y * -0.22 - this.tilt.x) * k;
    this.tilt.y += (this.mouse.x * 0.32 - this.tilt.y) * k;
    let rx = this.tilt.x;
    let ry = this.tilt.y;
    let rz = 0;
    let y = this.reducedMotion ? 0 : Math.sin(t * 0.9) * 0.035;
    this.anims = this.anims.filter((a) => {
      const p = Math.min(1, (t - a.start) / DUR[a.kind]);
      const e = ease(p);
      const bell = Math.sin(Math.PI * e);
      if (a.kind === "flip") {
        ry += Math.PI * 2 * e;
        y += bell * 0.25;
      } else if (a.kind === "tilt") {
        rx += -0.75 * bell;
        rz += 0.4 * Math.sin(Math.PI * 2 * e) * (1 - e);
      } else if (a.kind === "dip") {
        rx += 0.35 * bell;
        y -= 0.18 * bell;
      }
      return p < 1;
    });
    this.pivot.rotation.set(rx, ry, rz);
    this.pivot.position.y = y;

    // Soft studio lighting for white molded plastic, rather than sweeping chrome glare.
    this.keyLight.position.set(-4, 6, 8);
    const dark = this.isDark();
    this.keyLight.intensity = 1.8;
    this.scene.environmentIntensity = 0.72;
    this.shellMat.color.lerp(dark ? SHELL_DARK : SHELL_LIGHT, k);
    for (const m of this.keyMats) m.color.lerp(dark ? KEYS_DARK : KEYS_LIGHT, k);
    this.cursorLight.position.set(this.mouse.x * 6, this.mouse.y * 4 + 0.8, 4.5);

    // --- Lightbar ---
    if (s.timer !== this.prevTimer) {
      this.prevTimer = s.timer;
      this.timerAt = t;
    }
    const lb = lightbar(s, now, t, t - this.timerAt);
    const col = new THREE.Color(...lb.color);
    for (const m of this.strips) m.color.copy(col).multiplyScalar(0.08 + 1.1 * lb.intensity);
    for (const m of this.glows) {
      m.color.copy(col);
      m.opacity = 0.65 * lb.intensity;
    }

    // --- Buttons ---
    for (const b of this.buttons) {
      b.p *= Math.exp(-dt * 6);
      b.hover += ((this.hovered === b ? 1 : 0) - b.hover) * k;
      b.obj.position.copy(b.base).addScaledVector(b.axis, 0.07 * Math.min(1, b.p * 1.6));
      b.mat.emissive.copy(col);
      b.mat.emissiveIntensity = b.p * 0.08 + b.hover * 0.015;
    }

    // --- Display ---
    drawDisplay(this.dispCtx, s, now, t, dark);
    this.dispTex.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContextMenu);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        materials.add(mat);
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((texture) => texture.dispose());
    this.scene.environment?.dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
