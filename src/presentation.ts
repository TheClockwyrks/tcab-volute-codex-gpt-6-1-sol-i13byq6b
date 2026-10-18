import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { VoluteState } from "./game";
import { BACKGROUND } from "./game";
import * as C from "./constants";
import { danger, path, radians } from "./simulation";
import type { State } from "./simulation";

const images: Record<string, ImageBitmap> = {};
const tinted: Record<string, OffscreenCanvas> = {};
// Disposable prepared players: every entry can be reconstructed from a visual event.
const players = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, { player: ParticleCanvasPlayer; age: number }>
>();
const systems: Record<string, ParticleSystem> = {};
export const PALETTE: Record<C.ChargeId, string> = {
  halide: "#59e2d0",
  sulfur: "#ffd36a",
  cobalt: "#7cb7ff",
  garnet: "#f17b96",
  olivine: "#b5e475",
};
const ink = "#e4ead8",
  muted = "#8ba4a5",
  gold = "#dbbc83";
export async function loadAssets(api: InitApi<VoluteState>) {
  const names = [
    ...C.CHARGE_IDS.map((c) => "core-" + c),
    ...C.MACHINERY_KINDS.map((k) => "mark-" + k),
    "injector-base",
    "injector-barrel",
    "intake-maw",
    "channel-plate",
    "cell",
    "pressure",
    ...Array.from({ length: 4 }, (_, i) => "recoil-" + i),
    ...Array.from({ length: 6 }, (_, i) => "swallow-" + i),
    ...Array.from({ length: 6 }, (_, i) => "flash-" + i),
  ];
  await Promise.all([
    ...names.map(async (n) => {
      images[n] = await api.assets.loadImage(n + ".png");
    }),
    ...Object.values(C.CUES).map((c) => api.audio.load(c, c + ".wav")),
    ...["extraction", "bore", "intake", "pickup"].map(async (n) => {
      const blob = await api.assets.load(n + ".json");
      systems[n] = JSON.parse(await blob.text()) as ParticleSystem;
    }),
  ]);
  if (typeof OffscreenCanvas !== "undefined")
    for (const charge of C.CHARGE_IDS)
      for (let i = 0; i < 6; i++) {
        const canvas = new OffscreenCanvas(48, 48),
          ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(images["flash-" + i], 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = PALETTE[charge];
        ctx.fillRect(0, 0, 48, 48);
        tinted["flash-" + charge + "-" + i] = canvas;
      }
}
function text(
  ctx: CanvasRenderingContext2D,
  copy: string,
  x: number,
  y: number,
  size = 12,
  color = ink,
  font = "monospace",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.fillText(copy, x, y);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  scale = 1,
) {
  const image = tinted[name] ?? images[name];
  if (image)
    ctx.drawImage(
      image,
      Math.round(x - (image.width * scale) / 2),
      Math.round(y - (image.height * scale) / 2),
      image.width * scale,
      image.height * scale,
    );
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#10232bea";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#496063";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = gold;
  ctx.fillRect(x, y, 3, 12);
  ctx.fillRect(x + w - 3, y + h - 12, 3, 12);
}
function ground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  const gradient = ctx.createRadialGradient(480, 280, 30, 480, 280, 600);
  gradient.addColorStop(0, "#1c333b");
  gradient.addColorStop(1, "#0b171f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  for (let x = 0; x < C.FIELD_W; x += 80)
    line(ctx, x, 0, x, C.FIELD_H, "#ffffff03");
  for (let y = 0; y < C.FIELD_H; y += 60)
    line(ctx, 0, y, C.FIELD_W, y, "#ffffff03");
  // A continuous cast plate; the produced tile supplies its metal grain and rivets.
  const pattern = images["channel-plate"]
    ? ctx.createPattern(images["channel-plate"], "repeat")
    : null;
  ctx.beginPath();
  C.CHANNEL.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
  );
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#050f16";
  ctx.lineWidth = 45;
  ctx.stroke();
  ctx.strokeStyle = "#506267";
  ctx.lineWidth = 39;
  ctx.stroke();
  ctx.strokeStyle = pattern ?? "#26383f";
  ctx.lineWidth = 35;
  ctx.stroke();
  ctx.strokeStyle = "#0c202a";
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = "#29434b";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let s = 55; s < C.PATH_LENGTH - 50; s += 96) {
    const p = path(s);
    const q = path(s + 6);
    line(ctx, p.x, p.y, q.x, q.y, "#a6c1b344", 2);
  }
  text(ctx, "INLET  /  01", 25, 78, 9, muted);
  sprite(ctx, "intake-maw", 480, 320);
  text(ctx, "INTAKE", 464, 365, 9, gold);
  text(ctx, "GEOTHERMAL PRECIPITATION HALL", 32, 525, 9, "#718b8d");
  text(ctx, "VOLUTE   /   DEEP SYSTEMS DIVISION", 678, 525, 9, "#718b8d");
}
function sightline(ctx: CanvasRenderingContext2D, s: State) {
  const dx = Math.cos(radians(s.aim)),
    dy = Math.sin(radians(s.aim));
  let distance = Infinity;
  if (dx > 0) distance = Math.min(distance, (C.FIELD_W - C.INJECTOR_X) / dx);
  if (dx < 0) distance = Math.min(distance, -C.INJECTOR_X / dx);
  if (dy > 0) distance = Math.min(distance, (C.FIELD_H - C.INJECTOR_Y) / dy);
  if (dy < 0) distance = Math.min(distance, -C.INJECTOR_Y / dy);
  for (const c of s.cores) {
    const p = path(c.s),
      x = p.x - C.INJECTOR_X,
      y = p.y - C.INJECTOR_Y;
    const projection = x * dx + y * dy,
      perp = x * x + y * y - projection * projection;
    if (projection > 0 && perp <= C.CORE_RADIUS * C.CORE_RADIUS)
      distance = Math.min(
        distance,
        projection - Math.sqrt(C.CORE_RADIUS * C.CORE_RADIUS - perp),
      );
  }
  ctx.setLineDash([5, 5]);
  line(
    ctx,
    C.INJECTOR_X,
    C.INJECTOR_Y,
    C.INJECTOR_X + dx * distance,
    C.INJECTOR_Y + dy * distance,
    "#dce6b5aa",
  );
  ctx.setLineDash([]);
}
function machinery(ctx: CanvasRenderingContext2D, s: State) {
  if (s.machinery?.kind === "sightline") sightline(ctx, s);
  sprite(ctx, "injector-base", C.INJECTOR_X, C.INJECTOR_Y);
  ctx.save();
  ctx.translate(C.INJECTOR_X, C.INJECTOR_Y);
  ctx.rotate(radians(s.aim));
  const elapsed = C.FIRE_COOLDOWN - s.fireCooldown;
  const recoil =
    s.fireCooldown > 0
      ? Math.min(3, Math.floor((elapsed / C.FIRE_COOLDOWN) * 4))
      : -1;
  sprite(ctx, recoil >= 0 ? "recoil-" + recoil : "injector-barrel", 18, 0);
  ctx.restore();
  if (s.loaded) sprite(ctx, "core-" + s.loaded, C.INJECTOR_X, C.INJECTOR_Y);
  text(ctx, "INJECTOR", C.INJECTOR_X - 30, C.INJECTOR_Y + 37, 9, muted);
  if (s.machinery) {
    sprite(ctx, "mark-" + s.machinery.kind, 315, 381);
    text(ctx, s.machinery.kind.toUpperCase(), 332, 380, 10, gold);
    text(ctx, s.machinery.remaining.toFixed(1) + "s", 446, 380, 10, gold);
  }
}
function effects(ctx: CanvasRenderingContext2D, s: State) {
  const active = new Set(
    (s.visuals ?? []).map((v) => `${v.kind}/${v.seed}/${v.x}/${v.y}`),
  );
  const existing = players.get(ctx);
  if (existing)
    for (const key of existing.keys())
      if (!active.has(key)) existing.delete(key);
  for (const v of s.visuals ?? []) {
    if (v.kind === "extraction" && v.age < 0.3) {
      ctx.save();
      ctx.globalAlpha = 1 - v.age / 0.3;
      sprite(
        ctx,
        (tinted["flash-" + v.charge + "-0"]
          ? "flash-" + v.charge + "-"
          : "flash-") + Math.min(5, Math.floor((v.age / 0.3) * 6)),
        v.x,
        v.y,
      );
      ctx.restore();
    }
    if (v.kind === "intake" && v.age < 0.5)
      sprite(
        ctx,
        "swallow-" + Math.min(5, Math.floor((v.age / 0.5) * 6)),
        v.x,
        v.y,
      );
    const system = systems[v.kind];
    if (!system) continue;
    // Prepared players follow the simulation age; held screens pass a zero delta.
    const colored =
      v.kind === "extraction"
        ? {
            ...system,
            emitters: system.emitters.map((em) => ({
              ...em,
              particle: {
                ...em.particle,
                colorGradient: [
                  { at: 0, color: PALETTE[v.charge] },
                  { at: 1, color: "#ffffff" },
                ],
              },
            })),
          }
        : system;
    ctx.save();
    const w = ctx.canvas.width,
      h = ctx.canvas.height;
    ctx.translate(v.x - 100, v.y - 100);
    ctx.scale(200 / w, 200 / h);
    let cache = players.get(ctx);
    if (!cache) {
      cache = new Map();
      players.set(ctx, cache);
    }
    const key = `${v.kind}/${v.seed}/${v.x}/${v.y}`;
    let prepared = cache.get(key);
    if (!prepared || prepared.age > v.age) {
      prepared = {
        player: new ParticleCanvasPlayer(colored, ctx, {
          clear: false,
          pixelRadius: 2.2,
          seed: v.seed,
        }),
        age: 0,
      };
      cache.set(key, prepared);
    }
    prepared.player.update(Math.max(0, v.age - prepared.age));
    prepared.age = v.age;
    ctx.restore();
  }
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  // The open bay between the outer runs keeps every channel leg visible.
  panel(ctx, 160, 66, 640, 32);
  text(ctx, "VOLUTE", 173, 87, 14, gold);
  line(ctx, 242, 74, 242, 91, "#496063");
  text(ctx, "SCORE", 255, 79, 8, muted);
  text(ctx, String(s.score).padStart(6, "0"), 255, 91, 12);
  text(ctx, "HALL", 345, 79, 8, muted);
  text(
    ctx,
    `${String(s.level).padStart(2, "0")} / ${C.LEVEL_COUNT}`,
    345,
    91,
    12,
  );
  for (let i = 0; i < s.cells; i++) sprite(ctx, "cell", 442 + i * 22, 82);
  sprite(ctx, "pressure", 533, 82);
  text(ctx, "PRESSURE", 550, 78, 8, muted);
  ctx.fillStyle = "#071922";
  ctx.fillRect(550, 84, 104, 6);
  ctx.fillStyle = s.pressure > 70 ? "#ec8a72" : gold;
  ctx.fillRect(550, 84, (104 * s.pressure) / C.PRESSURE_MAX, 6);
  text(ctx, `${Math.round(s.pressure)}%`, 662, 89, 11, gold);
  text(ctx, `${s.quotaRemaining} TO FEED`, 714, 86, 9, muted);
  panel(ctx, 271, 446, 385, 33);
  text(ctx, "LOADED", 284, 460, 8, muted);
  if (s.loaded) sprite(ctx, "core-" + s.loaded, 348, 462);
  text(ctx, "NEXT", 379, 460, 8, muted);
  if (s.queued) sprite(ctx, "core-" + s.queued, 429, 462);
  line(ctx, 451, 454, 451, 471, "#496063");
  text(ctx, "X  SWAP", 464, 466, 10, gold);
  text(ctx, "P  PAUSE", 548, 466, 10, muted);
  if (s.chainTimer > 0) text(ctx, `CHAIN ×${s.chainStep}`, 680, 463, 14, gold);
  if (danger(s)) {
    ctx.strokeStyle = "#ed8e6a";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, C.FIELD_W - 8, C.FIELD_H - 8);
    text(ctx, "! INTAKE APPROACHING", 664, 385, 13, "#ffad86");
  }
  text(ctx, s.muted ? "M  SOUND OFF" : "M  SOUND ON", 720, 181, 9, muted);
}
function title(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = "#08141cc9";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  // The inner bay becomes the title plaque; the visible spiral frames it.
  panel(ctx, 176, 102, 608, 338);
  text(ctx, "D E E P   S Y S T E M S   /   H A L L   0 1", 235, 137, 10, gold);
  text(ctx, C.TITLE_TEXT, 231, 220, 80, ink, "Georgia");
  text(ctx, "A GEOTHERMAL ARCADE PUZZLE", 236, 249, 12, gold);
  line(ctx, 236, 266, 724, 266, "#496063");
  text(
    ctx,
    "Gather three like minerals. Keep the intake hungry.",
    236,
    291,
    12,
    ink,
  );
  C.CHARGE_IDS.forEach((c, i) => sprite(ctx, "core-" + c, 569 + i * 34, 326));
  text(ctx, "AIM", 236, 323, 10, gold);
  text(ctx, "POINTER / ← →", 286, 323, 10, ink);
  text(ctx, "FIRE", 236, 344, 10, gold);
  text(ctx, "CLICK / SPACE", 286, 344, 10, ink);
  text(ctx, "X  SWAP    P / ESC  PAUSE    M  SOUND", 236, 369, 10, muted);
  ctx.fillStyle = "#dbbc83";
  ctx.fillRect(236, 389, 488, 31);
  text(ctx, "ENTER / SPACE / CLICK  —  OPEN THE HALL", 286, 409, 12, "#152832");
  text(
    ctx,
    "MATCH MINERALS     /     BUILD CHAINS     /     HARNESS MACHINERY",
    236,
    466,
    10,
    muted,
  );
  void s;
}
export function renderHall(s: State, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  ground(ctx);
  for (const core of s.cores) {
    const p = path(core.s);
    sprite(ctx, "core-" + core.charge, p.x, p.y);
    if (core.mark) sprite(ctx, "mark-" + core.mark, p.x + 7, p.y + 7);
  }
  machinery(ctx, s);
  for (const p of s.projectiles) sprite(ctx, "core-" + p.charge, p.x, p.y);
  effects(ctx, s);
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (["playing", "paused", "cleared", "setback"].includes(s.screen))
    hud(ctx, s);
  if (s.screen === "playing") return;
  ctx.fillStyle = "#07131b8c";
  ctx.fillRect(235, 156, 490, 242);
  panel(ctx, 250, 165, 460, 224);
  const headings = {
    paused: "HALL ON HOLD",
    cleared: `HALL ${String(s.level).padStart(2, "0")} / CLEAR`,
    setback: "CELL SPENT",
    gameover: "PRESSURE WON",
    victory: "THE HALL RUNS CLEAN",
  };
  text(
    ctx,
    headings[s.screen],
    280,
    217,
    s.screen === "victory" ? 25 : 32,
    gold,
    "Georgia",
  );
  const copy =
    s.screen === "paused"
      ? "The train is held. Take a breath."
      : s.screen === "setback"
        ? `${s.cells} cells remain. Re-priming this hall…`
        : s.screen === "cleared"
          ? `+${C.CLEAR_SCORE}  /  Next hall is priming…`
          : s.screen === "victory"
            ? "Every level of the hall cleared."
            : `The intake claimed the last cell. Hall ${s.level}.`;
  text(ctx, copy, 280, 252, 12, ink);
  if (
    s.screen === "gameover" ||
    s.screen === "victory" ||
    s.screen === "cleared"
  )
    text(
      ctx,
      `${s.screen === "cleared" ? "RUN OUTPUT" : "FINAL OUTPUT"}   ${String(s.score).padStart(6, "0")}`,
      280,
      286,
      17,
      ink,
    );
  if (s.screen === "paused")
    text(ctx, "P / ESC  —  RESUME", 280, 339, 12, gold);
  else if (s.screen === "cleared" || s.screen === "setback") {
    ctx.fillStyle = "#36515a";
    ctx.fillRect(280, 337, 400, 3);
    ctx.fillStyle = gold;
    ctx.fillRect(280, 337, 400 * (1 - s.interlude / C.INTERLUDE), 3);
  } else text(ctx, "ENTER / SPACE / CLICK  —  RETURN", 280, 339, 12, gold);
}
