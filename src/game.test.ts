/// <reference types="node" />
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import type { VoluteState } from "./game";
import { debugApi as D } from "./instrumentation";
import * as S from "./simulation";
import * as C from "./constants";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile("public/" + url)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(data: ArrayBuffer) {
        expect(new TextDecoder().decode(data.slice(0, 4))).toBe("RIFF");
        return { duration: 1 };
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
async function hall() {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.FIELD_W, C.FIELD_H) as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / C.TICK_HZ),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const pointer = (type: string, x: number, y: number) =>
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  return { engine, key, pointer };
}
function posed(train: Parameters<typeof D.poseTrain>[1]): VoluteState {
  let s = D.startLevel(S.fresh(), 1);
  s = D.setEmission(s, false);
  s = D.setFeed(s, false);
  return D.poseTrain(s, train);
}
function step(s: VoluteState, n = 1) {
  const e = S.events();
  for (let i = 0; i < n; i++) s = S.tick(s, e);
  return { s, e };
}

describe("channel and deterministic simulation", () => {
  it("maps every vertex and selects the outgoing forward direction", () => {
    let arc = 0;
    C.CHANNEL.forEach((p, i) => {
      if (i)
        arc += Math.hypot(p.x - C.CHANNEL[i - 1].x, p.y - C.CHANNEL[i - 1].y);
      const q = S.path(arc);
      expect(q.x).toBe(p.x);
      expect(q.y).toBe(p.y);
      if (i < C.CHANNEL.length - 1) {
        expect(q.fx).toBe(Math.sign(C.CHANNEL[i + 1].x - p.x));
        expect(q.fy).toBe(Math.sign(C.CHANNEL[i + 1].y - p.y));
      }
    });
    expect(S.path(-50)).toMatchObject({ x: C.CHANNEL[0].x, y: C.CHANNEL[0].y });
  });
  it("starts with the required seed, mark and quota", () => {
    const s = D.startLevel(S.fresh(), 4);
    expect(s.cores).toHaveLength(C.SEEDED_CORES);
    expect(s.cores[0].s).toBe(C.SEEDED_HEAD_S);
    expect(s.cores[s.cores.length - 1]?.mark).toBe("choke");
    expect(s.quotaRemaining).toBe(C.LEVELS[3].quota - C.SEEDED_CORES);
    expect(s.segments).toEqual([{ count: C.SEEDED_CORES, hold: 0 }]);
  });
  it("holds and resumes emission, consuming a posed charge only once", () => {
    let s = D.setFeed(D.clearTrain(D.startLevel(S.fresh(), 1)), false);
    s = D.setNextEmitted(D.setEmission(s, false), "olivine");
    s = step(s).s;
    expect(s.cores).toHaveLength(0);
    expect(s.nextEmitted).toBe("olivine");
    s = step(D.setEmission(s, true)).s;
    expect(s.cores[0].charge).toBe("olivine");
    expect(s.nextEmitted).toBeNull();
  });
  it("marks every twelfth emission in the fixed cycle", () => {
    C.MACHINERY_KINDS.forEach((kind, i) => {
      let s = D.clearTrain(D.startLevel(S.fresh(), 5));
      s = D.setQuotaRemaining(
        s,
        C.LEVELS[4].quota - (i + 1) * C.MARK_INTERVAL + 1,
      );
      s = step(s).s;
      expect(s.cores[0].mark).toBe(kind);
    });
  });
  it("advances lead and catching segments at their own rates", () => {
    const s = step(
      D.setFeed(
        posed([
          [400, "halide", null],
          [100, "sulfur", null],
        ]),
        true,
      ),
    ).s;
    expect(s.cores[0].s).toBeCloseTo(400 + C.LEVELS[0].feedSpeed * C.TICK_DT);
    expect(s.cores[1].s).toBeCloseTo(100 + C.CATCHUP_SPEED * C.TICK_DT);
  });
  it("clamps a catch-up join to exact spacing", () => {
    const s = step(
      D.setFeed(
        posed([
          [100, "halide", null],
          [71, "sulfur", null],
          [43, "cobalt", null],
        ]),
        true,
      ),
    ).s;
    expect(s.cores[0].s - s.cores[1].s).toBeCloseTo(C.SPACING);
    expect(s.segments).toEqual([{ count: 3, hold: 0 }]);
  });
  it("leaves a posed matching run intact until an insertion or merge", () => {
    const s = step(
      posed([
        [100, "halide", null],
        [72, "halide", null],
        [44, "halide", null],
      ]),
      20,
    ).s;
    expect(s.cores).toHaveLength(3);
    expect(s.score).toBe(0);
  });
  it("computes and clamps pressure and choke speed", () => {
    const train = Array.from(
      { length: 30 },
      (_, i) => [1000 - i * C.SPACING, "halide", null] as const,
    );
    let s = posed(train);
    s = step(s, C.TICK_HZ).s;
    expect(s.pressure).toBeCloseTo(
      (train.length - C.PRESSURE_FREE) * C.PRESSURE_RISE_PER_CORE,
    );
    s = D.grantMachinery(D.setPressure(s, C.PRESSURE_MAX), "choke");
    expect(D.snapshot(s).feedSpeed).toBeCloseTo(
      C.LEVELS[0].feedSpeed * 2 * C.CHOKE_FEED_MULTIPLIER,
    );
    expect(step(s).s.pressure).toBe(C.PRESSURE_MAX);
    expect(step(posed([])).s.pressure).toBe(C.PRESSURE_MIN);
  });
  it("packs backflow against the inlet even during recoil holds", () => {
    let s = D.setFeed(
      posed([
        [90, "halide", null],
        [28, "cobalt", null],
        [0, "sulfur", null],
      ]),
      true,
    );
    s = D.grantMachinery(
      {
        ...s,
        segments: s.segments.map((g) => ({ ...g, hold: C.RECOIL_HOLD })),
      },
      "backflow",
    );
    s = step(s, 60).s;
    expect(s.cores.map((c) => c.s)).toEqual([56, 28, 0]);
    expect(s.quotaRemaining).toBe(C.LEVELS[0].quota - C.SEEDED_CORES);
  });
  it("releases recoil on the exact expiry tick", () => {
    const initial = D.setFeed(posed([[100, "cobalt", null]]), true);
    const held = { ...initial, segments: [{ count: 1, hold: C.RECOIL_HOLD }] };
    const before = step(held, C.RECOIL_HOLD * C.TICK_HZ - 1).s;
    expect(before.cores[0].s).toBe(100);
    const after = step(before).s;
    expect(after.segments[0].hold).toBe(0);
    expect(after.cores[0].s).toBeCloseTo(
      100 + C.LEVELS[0].feedSpeed * C.TICK_DT,
    );
  });
  it("preserves negative insertion positions through backflow", () => {
    let s = D.grantMachinery(
      D.setFeed(
        posed([
          [0, "halide", null],
          [-28, "sulfur", null],
        ]),
        true,
      ),
      "backflow",
    );
    s = step(s, 20).s;
    expect(s.cores.map((c) => c.s)).toEqual([0, -28]);
  });
});

describe("projectiles, extraction and machinery", () => {
  it("seats behind on a perpendicular hit and shifts the trailing cores", () => {
    let s = posed([
      [380, "halide", null],
      [352, "cobalt", null],
      [324, "sulfur", null],
    ]);
    s = {
      ...s,
      projectiles: [
        {
          x: 420,
          y: 50 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "garnet",
        },
      ],
    };
    const result = step(s);
    expect(result.e.cues.has(C.CUES.seat)).toBe(true);
    expect(result.s.cores.map((c) => [c.s, c.charge])).toEqual([
      [380, "halide"],
      [352, "garnet"],
      [324, "cobalt"],
      [296, "sulfur"],
    ]);
  });
  it("seats ahead when the dot product is positive without advancing the head", () => {
    let s = posed([
      [380, "halide", null],
      [352, "cobalt", null],
    ]);
    s = {
      ...s,
      projectiles: [
        {
          x: 430 - C.PROJECTILE_SPEED * C.TICK_DT,
          y: 40,
          angle: 0,
          charge: "garnet",
        },
      ],
    };
    s = step(s).s;
    expect(s.cores.map((c) => [c.s, c.charge])).toEqual([
      [380, "garnet"],
      [352, "halide"],
      [324, "cobalt"],
    ]);
  });
  it("extracts a seated run at step one and recoils the train behind it", () => {
    let s = D.setChainStep(
      posed([
        [380, "halide", null],
        [352, "halide", "choke"],
        [324, "cobalt", null],
        [296, "sulfur", null],
      ]),
      7,
    );
    s = {
      ...s,
      pressure: 50,
      projectiles: [
        {
          x: 420,
          y: 50 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide",
        },
      ],
    };
    const result = step(s);
    s = result.s;
    expect(s.score).toBe(C.SCORE_PER_CORE * C.MIN_RUN);
    expect(s.chainStep).toBe(1);
    expect(s.cores.map((c) => c.s)).toEqual([254, 226]);
    expect(s.segments).toEqual([{ count: 2, hold: C.RECOIL_HOLD }]);
    expect(s.machinery).toEqual({
      kind: "choke",
      remaining: C.MACHINERY_DURATIONS.choke,
    });
    expect(
      result.e.effects.filter((v) => v.kind === "extraction"),
    ).toHaveLength(3);
    expect(s.pressure).toBeCloseTo(
      50 - 3 * C.PRESSURE_DROP_PER_CORE - C.PRESSURE_BLEED * C.TICK_DT,
    );
  });
  it("extracts a merge at the incremented chain step", () => {
    let s = D.setFeed(
      posed([
        [200, "halide", null],
        [172, "halide", null],
        [143, "halide", null],
      ]),
      true,
    );
    s = D.setChainStep(s, 2);
    const result = step(s);
    expect(result.s.cores).toHaveLength(0);
    expect(result.s.score).toBe(C.SCORE_PER_CORE * 3 * 3);
    expect(result.s.chainStep).toBe(3);
    expect(result.e.cues.has(C.CUES.extract3)).toBe(true);
  });
  it("continues advancing original segments after a prior join extracts", () => {
    const s = step(
      D.setFeed(
        posed([
          [200, "halide", null],
          [172, "halide", null],
          [143, "halide", null],
          [10, "cobalt", null],
        ]),
        true,
      ),
    ).s;
    expect(s.cores).toHaveLength(1);
    expect(s.cores[0].s).toBe(0);
    expect(s.segments[0].hold).toBe(C.RECOIL_HOLD);
  });
  it("resets a chain exactly when its window expires", () => {
    const s = step(
      D.setChainStep(posed([[100, "sulfur", null]]), 4),
      C.CHAIN_RESET * C.TICK_HZ,
    ).s;
    expect(s.chainStep).toBe(1);
    expect(s.chainTimer).toBeCloseTo(0);
  });
  it("resolves a bore across adjacent channel legs without granting bore-removed marks", () => {
    let s = posed([
      [4900, "cobalt", "backflow"],
      [380, "halide", null],
      [352, "halide", "bore"],
      [324, "sulfur", "choke"],
    ]);
    s = {
      ...s,
      projectiles: [
        {
          x: 420,
          y: 50 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide",
        },
      ],
    };
    const result = step(s);
    expect(result.s.machinery).toBeNull();
    expect(result.s.cores.map((c) => c.charge)).toEqual(["cobalt"]);
    expect(result.s.score).toBe(C.SCORE_PER_CORE * 4);
    expect(result.e.effects.some((v) => v.kind === "bore")).toBe(true);
  });
  it("grants multiple extracted marks in head-to-tail order", () => {
    let s = posed([
      [380, "halide", "sightline"],
      [352, "halide", "choke"],
    ]);
    s = {
      ...s,
      projectiles: [
        {
          x: 420,
          y: 50 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide",
        },
      ],
    };
    expect(step(s).s.machinery?.kind).toBe("choke");
  });
  it("discards a projectile once its center leaves the field", () => {
    let s = posed([]);
    s = {
      ...s,
      projectiles: [{ x: C.FIELD_W - 1, y: 100, angle: 0, charge: "cobalt" }],
    };
    expect(step(s).s.projectiles).toEqual([]);
  });
});

describe("run progression and debug validation", () => {
  it("clears a quota-exhausted hall, awards points, then opens the next", () => {
    let s = D.setQuotaRemaining(posed([]), 0);
    s = step(s).s;
    expect(s.screen).toBe("cleared");
    expect(s.score).toBe(C.CLEAR_SCORE);
    s = step(s, C.INTERLUDE * C.TICK_HZ).s;
    expect(s.screen).toBe("playing");
    expect(s.level).toBe(2);
    expect(s.score).toBe(C.CLEAR_SCORE);
  });
  it("wins on the final clearing tick", () => {
    const s = step(
      D.setLevel(D.setQuotaRemaining(posed([]), 0), C.LEVEL_COUNT),
    ).s;
    expect(s.screen).toBe("victory");
    expect(s.interlude).toBe(0);
  });
  it("spends one cell at most and restarts the same level", () => {
    let s = posed([
      [C.PATH_LENGTH, "halide", null],
      [C.PATH_LENGTH, "sulfur", null],
    ]);
    s = step(s).s;
    expect(s.screen).toBe("setback");
    expect(s.cells).toBe(C.CELLS - 1);
    expect(s.cores).toEqual([]);
    s = step(s, C.INTERLUDE * C.TICK_HZ).s;
    expect(s.screen).toBe("playing");
    expect(s.level).toBe(1);
    expect(s.cells).toBe(C.CELLS - 1);
  });
  it("ends on the last cell and preserves the run score", () => {
    const s = step(
      D.setScore(D.setCells(posed([[C.PATH_LENGTH, "cobalt", null]]), 1), 123),
    ).s;
    expect(s.screen).toBe("gameover");
    expect(s.score).toBe(123);
    expect(s.cells).toBe(0);
  });
  it("reconciles idempotently without moving a clock or extracting", () => {
    const s = D.poseTrain(D.setScreen(S.fresh(), "paused"), [
      [200, "halide", null],
      [172, "halide", null],
      [144, "halide", null],
    ]);
    const a = D.reconcile(s);
    expect(D.reconcile(a)).toEqual(a);
    expect(a).toEqual(s);
    expect(D.snapshot(a).train.map((c) => c.segment)).toEqual([0, 0, 0]);
  });
  it("returns independent snapshots and derived readings after poses", () => {
    const s = D.setPressure(
      D.poseTrain(S.fresh(), [
        [C.DANGER_S, "halide", null],
        [100, "sulfur", null],
      ]),
      50,
    );
    const snap = D.snapshot(s);
    expect(snap.danger).toBe(true);
    expect(snap.segments).toHaveLength(2);
    snap.train.splice(0, 1);
    expect(s.cores[0].s).toBe(C.DANGER_S);
    expect(D.snapshot(D.clearTrain(s)).danger).toBe(false);
  });
  it("rejects invalid poses and normalizes arbitrary angles", () => {
    const s = S.fresh();
    for (const n of [NaN, Infinity, -1, 1.5])
      expect(() => D.setScore(s, n)).toThrow();
    expect(() => D.setLevel(s, 0)).toThrow();
    expect(() => D.setCells(s, C.CELLS + 1)).toThrow();
    expect(() => D.setPressure(s, 101)).toThrow();
    expect(() => D.grantMachinery(s, "bore" as "choke")).toThrow();
    expect(() => D.setScreen(s, "missing" as "title")).toThrow();
    expect(() => D.setLoaded(s, "missing" as "halide")).toThrow();
    expect(() =>
      D.poseTrain(s, [[C.PATH_LENGTH + 1, "halide", null]]),
    ).toThrow();
    expect(D.setAim(s, -450).aim).toBe(270);
    expect(D.setQuotaRemaining(s, 1000).quotaRemaining).toBe(1000);
  });
  it("resets preferences and gates correctly and fires even from an empty paused injector", () => {
    let s = D.setEmission(
      D.setFeed({ ...S.fresh(), muted: true }, false),
      false,
    );
    s = D.fire(D.pause(s));
    expect(s.projectiles).toHaveLength(1);
    expect(s.screen).toBe("paused");
    expect(s.fireCooldown).toBe(C.FIRE_COOLDOWN);
    s = D.reset(s);
    expect(s).toEqual({
      ...S.fresh(),
      emission: false,
      feed: false,
      muted: true,
    });
  });
});

describe("engine integration, input, audio and rendering", () => {
  it("loads committed assets, registers diagnostics, starts by keyboard and pauses all gameplay timers", async () => {
    const { engine, key } = await hall();
    expect(engine.debug.version).toBe(C.VOLUTE_DEBUG_VERSION);
    expect(engine.diagnostics()).toHaveLength(12);
    key("Enter");
    await engine.advance(1);
    key("Enter", "keyup");
    expect(engine.state.screen).toBe("playing");
    engine.apply((s) => D.grantMachinery(s, "choke"));
    key("KeyP");
    await engine.advance(1);
    key("KeyP", "keyup");
    const before = engine.state;
    await engine.advance(20);
    expect(engine.state.cores).toEqual(before.cores);
    expect(engine.state.machinery).toEqual(before.machinery);
    expect(engine.state.simTime).toBeGreaterThan(before.simTime);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    engine.destroy();
  });
  it("reads pointer confirmation, aim, fire, cooldown denial, swap and mute", async () => {
    const { engine, pointer, key } = await hall();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    pointer("pointerdown", 300, 200);
    await engine.advance(1);
    pointer("pointerup", 300, 200);
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.projectiles).toHaveLength(0);
    pointer("pointermove", C.INJECTOR_X, C.INJECTOR_Y - 100);
    key("Space");
    await engine.advance(1);
    expect(engine.state.aim).toBe(270);
    expect(cues).toContain(C.CUES.fire);
    key("Space", "keyup");
    await engine.advance(1);
    key("Space");
    await engine.advance(1);
    expect(cues).toContain(C.CUES.denied);
    const loaded = engine.state.loaded,
      queued = engine.state.queued;
    key("KeyX");
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.loaded).toBe(queued);
    expect(engine.state.queued).toBe(loaded);
    expect(engine.state.muted).toBe(true);
    expect(cues).toContain(C.CUES.swap);
    engine.destroy();
  });
  it("switches music exclusively with danger and stops it on pause", async () => {
    const { engine } = await hall();
    const looped: string[] = [],
      stopped: string[] = [];
    engine.events.on("cue:looped", (e) => looped.push(e.cue));
    engine.events.on("cue:stopped", (e) => stopped.push(e.cue));
    engine.apply((s) => D.startLevel(s, 1));
    await engine.advance(1);
    expect(looped).toEqual([C.CUES.hallLoop]);
    engine.apply((s) => D.poseTrain(s, [[C.DANGER_S, "halide", null]]));
    await engine.advance(1);
    expect(looped).toEqual([C.CUES.hallLoop, C.CUES.dangerLoop]);
    expect(stopped).toContain(C.CUES.hallLoop);
    engine.apply((s) => D.pause(s));
    await engine.advance(1);
    expect(stopped).toContain(C.CUES.dangerLoop);
    engine.destroy();
  });
  it("runs the same fixed simulation under uneven frame deltas", async () => {
    const a = await hall(),
      b = await hall();
    const prepare = (s: S.State) =>
      D.setFeed(
        D.setEmission(
          D.poseTrain(D.startLevel(s, 1), [
            [100, "halide", null],
            [72, "sulfur", null],
          ]),
          false,
        ),
        true,
      );
    a.engine.apply(prepare);
    b.engine.apply(prepare);
    b.engine.setClock(new SequenceClock([5, 20, 25]));
    await a.engine.advance(60);
    await b.engine.advance(60);
    expect(b.engine.state.cores).toEqual(a.engine.state.cores);
    expect(b.engine.state.pressure).toBe(a.engine.state.pressure);
    expect(b.engine.state.simTime).toBeCloseTo(a.engine.state.simTime);
    a.engine.destroy();
    b.engine.destroy();
  });
  it("renders every screen, sights and live particle effects without changing simulation state", async () => {
    const { engine } = await hall();
    for (const screen of C.SCREENS) {
      engine.apply((s) => ({
        ...D.setScreen(D.startLevel(s, 1), screen),
        visuals: [
          { kind: "bore", x: 400, y: 200, charge: "sulfur", age: 0.1, seed: 5 },
        ],
      }));
      await engine.advance(1);
    }
    engine.apply((s) => D.grantMachinery(D.startLevel(s, 1), "sightline"));
    await engine.advance(2);
    engine.destroy();
  });
});
