import * as C from "./constants";
import * as S from "./simulation";
import type { VoluteDebugApi, VoluteSnapshot } from "./game";
function number(
  n: number,
  min = -Infinity,
  max = Infinity,
  integer = false,
): number {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new RangeError(`Invalid number: ${n}`);
  return n;
}
function member<T>(v: T, set: readonly T[]): T {
  if (!set.includes(v)) throw new RangeError(`Unknown value: ${v}`);
  return v;
}
function bool(v: boolean) {
  if (typeof v !== "boolean") throw new TypeError("Expected boolean");
  return v;
}
const charge = (v: C.ChargeId) => member(v, C.CHARGE_IDS);
const level = (v: number) => number(v, 1, C.LEVEL_COUNT, true);
export const debugApi: VoluteDebugApi = {
  version: C.VOLUTE_DEBUG_VERSION,
  reset: S.fresh,
  reconcile: S.reconcile,
  snapshot(s): VoluteSnapshot {
    const segments = S.groups(s.cores, S.coreHolds(s));
    let segment = 0,
      count = 0;
    return {
      version: C.VOLUTE_DEBUG_VERSION,
      screen: s.screen,
      score: s.score,
      level: s.level,
      cells: s.cells,
      quotaRemaining: s.quotaRemaining,
      emitted: C.LEVELS[s.level - 1].quota - s.quotaRemaining,
      pressure: s.pressure,
      feedSpeed: S.feedSpeed(s),
      chainStep: s.chainStep,
      chainTimer: s.chainTimer,
      interlude: s.interlude,
      danger: S.danger(s),
      train: s.cores.map((c) => {
        if (count === segments[segment].count) {
          segment++;
          count = 0;
        }
        count++;
        const p = S.path(c.s);
        return { ...c, x: p.x, y: p.y, segment };
      }),
      segments: segments.map((g) => ({ ...g })),
      injector: {
        aim: s.aim,
        cooldown: s.fireCooldown,
        loaded: s.loaded,
        queued: s.queued,
      },
      projectiles: s.projectiles.map((p) => ({ ...p })),
      machinery: s.machinery ? { ...s.machinery } : null,
      emission: s.emission,
      feed: s.feed,
      nextEmitted: s.nextEmitted,
      muted: s.muted,
      simTime: s.simTime,
    };
  },
  setScreen: (s, name) => ({ ...s, screen: member(name, C.SCREENS) }),
  setLevel: (s, n) => ({ ...s, level: level(n) }),
  setScore: (s, n) => ({ ...s, score: number(n, 0, Infinity, true) }),
  setCells: (s, n) => ({ ...s, cells: number(n, 0, C.CELLS, true) }),
  setChainStep: (s, k) => ({
    ...s,
    chainStep: number(k, 1, Infinity, true),
    chainTimer: C.CHAIN_RESET,
  }),
  startLevel: (s, n) => S.startLevel(s, level(n)),
  poseTrain: (s, train) => {
    const cores = train
      .map(([arc, c, m]) => ({
        s: number(arc, -Infinity, C.PATH_LENGTH),
        charge: charge(c),
        mark: m === null ? null : member(m, C.MACHINERY_KINDS),
      }))
      .sort((a, b) => b.s - a.s);
    return { ...s, cores, segments: S.groups(cores) };
  },
  clearTrain: (s) => ({ ...s, cores: [], segments: [], projectiles: [] }),
  setLoaded: (s, c) => ({ ...s, loaded: charge(c) }),
  setQueued: (s, c) => ({ ...s, queued: charge(c) }),
  setAim: (s, a) => ({ ...s, aim: S.angle(number(a)) }),
  fire: S.fire,
  setPressure: (s, p) => ({
    ...s,
    pressure: number(p, C.PRESSURE_MIN, C.PRESSURE_MAX),
  }),
  setQuotaRemaining: (s, n) => ({
    ...s,
    quotaRemaining: number(n, 0, Infinity, true),
  }),
  setEmission: (s, b) => ({ ...s, emission: bool(b) }),
  setFeed: (s, b) => ({ ...s, feed: bool(b) }),
  setNextEmitted: (s, c) => ({
    ...s,
    nextEmitted: c === null ? null : charge(c),
  }),
  grantMachinery: (s, k) => ({
    ...s,
    machinery: {
      kind: member(k, ["choke", "backflow", "sightline"] as const),
      remaining:
        C.MACHINERY_DURATIONS[
          member(k, ["choke", "backflow", "sightline"] as const)
        ],
    },
  }),
  pause: (s) => ({ ...s, screen: "paused" }),
  resume: (s) => ({ ...s, screen: "playing" }),
};
