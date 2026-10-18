import * as C from "./constants";
import type { DeepReadonly } from "ts-essentials";
import type { CoreState, SegmentState, VoluteState } from "./game";
export type State = DeepReadonly<VoluteState>;
export type Signal = {
  kind: "extraction" | "bore" | "pickup" | "intake";
  x: number;
  y: number;
  charge: C.ChargeId;
};
export type Events = {
  cues: Set<string>;
  effects: Signal[];
  grants: { kind: C.MachineryKind; core: CoreState }[];
  tags: Map<CoreState, number>;
};
export const events = (): Events => ({
  cues: new Set(),
  effects: [],
  grants: [],
  tags: new Map(),
});
export const clamp = (n: number, lo = C.PRESSURE_MIN, hi = C.PRESSURE_MAX) =>
  Math.max(lo, Math.min(hi, n));
export const angle = (n: number) => ((n % 360) + 360) % 360;
export const radians = (n: number) => (n * Math.PI) / 180;
export function path(s: number) {
  let a = 0;
  for (let i = 0; i < C.CHANNEL.length - 1; i++) {
    const p = C.CHANNEL[i],
      q = C.CHANNEL[i + 1];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (s < a + length || i === C.CHANNEL.length - 2) {
      const fx = (q.x - p.x) / length,
        fy = (q.y - p.y) / length;
      return {
        x: p.x + fx * Math.max(0, s - a),
        y: p.y + fy * Math.max(0, s - a),
        fx,
        fy,
      };
    }
    a += length;
  }
  throw new Error("Empty channel");
}
export function groups(
  cores: readonly CoreState[],
  holds: readonly number[] = [],
): SegmentState[] {
  const result: { count: number; hold: number }[] = [];
  cores.forEach((core, i) => {
    if (i && Math.abs(cores[i - 1].s - core.s - C.SPACING) < 1e-6)
      result[result.length - 1].count++;
    else result.push({ count: 1, hold: holds[i] ?? 0 });
  });
  return result;
}
export function coreHolds(s: State): number[] {
  return s.segments.flatMap((g) => Array<number>(g.count).fill(g.hold));
}
export function reconcile(s: State): VoluteState {
  return { ...s, segments: groups(s.cores, coreHolds(s)) };
}
export const danger = (s: State) => (s.cores[0]?.s ?? -1) >= C.DANGER_S;
export const feedSpeed = (s: State) =>
  C.LEVELS[s.level - 1].feedSpeed *
  (1 + s.pressure / C.PRESSURE_MAX) *
  (s.machinery?.kind === "choke" ? C.CHOKE_FEED_MULTIPLIER : 1);
export function fresh(s?: State): VoluteState {
  return {
    screen: "title",
    score: 0,
    level: 1,
    cells: C.CELLS,
    quotaRemaining: C.LEVELS[0].quota,
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    cores: [],
    segments: [],
    projectiles: [],
    loaded: null,
    queued: null,
    aim: C.AIM_START,
    fireCooldown: 0,
    interlude: 0,
    simTime: 0,
    accumulator: 0,
    emission: s?.emission ?? true,
    feed: s?.feed ?? true,
    nextEmitted: null,
    muted: s?.muted ?? false,
  };
}
export function drawCharge(s: State): C.ChargeId {
  const charges = s.cores.length
    ? [...new Set(s.cores.map((c) => c.charge))]
    : C.LEVELS[s.level - 1].charges;
  return charges[Math.floor(Math.random() * charges.length)];
}
function mark(n: number): C.MachineryKind | null {
  return n > 0 && n % C.MARK_INTERVAL === 0
    ? C.MACHINERY_KINDS[(n / C.MARK_INTERVAL - 1) % C.MACHINERY_KINDS.length]
    : null;
}
export function startLevel(s: State, level: number): VoluteState {
  const base = { ...s, level, cores: [], machinery: null };
  const cores = Array.from({ length: C.SEEDED_CORES }, (_, i) => ({
    charge: drawCharge(base),
    s: C.SEEDED_HEAD_S - i * C.SPACING,
    mark: mark(i + 1),
  }));
  const next: VoluteState = {
    ...s,
    screen: "playing",
    level,
    cores,
    segments: groups(cores),
    projectiles: [],
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    fireCooldown: 0,
    machinery: null,
    interlude: 0,
    quotaRemaining: C.LEVELS[level - 1].quota - C.SEEDED_CORES,
  };
  return { ...next, loaded: drawCharge(next), queued: drawCharge(next) };
}
export function fire(s: State): VoluteState {
  return {
    ...s,
    projectiles: [
      ...s.projectiles,
      {
        charge: s.loaded ?? drawCharge(s),
        x: C.INJECTOR_X,
        y: C.INJECTOR_Y,
        angle: s.aim,
      },
    ],
    loaded: s.queued ?? drawCharge(s),
    queued: drawCharge(s),
    fireCooldown: C.FIRE_COOLDOWN,
  };
}
function copyCore(
  c: CoreState,
  patch: Partial<CoreState>,
  e: Events,
): CoreState {
  const next = { ...c, ...patch };
  const tag = e.tags.get(c);
  if (tag !== undefined) e.tags.set(next, tag);
  return next;
}
function remove(s: State, indices: number[], e: Events): VoluteState {
  if (!indices.length) return { ...s };
  const front = s.cores[indices[0]].s;
  const oldHolds = coreHolds(s);
  const remaining = s.cores
    .filter((_, i) => !indices.includes(i))
    .map((c) => copyCore(c, {}, e));
  const holds = oldHolds.filter((_, i) => !indices.includes(i));
  const gs = groups(remaining, holds);
  let offset = 0;
  for (const g of gs) {
    const end = offset + g.count;
    if (remaining[offset].s < front) {
      const tail = remaining[end - 1];
      const room = Math.min(
        tail.s,
        remaining[end] ? tail.s - remaining[end].s - C.SPACING : C.RECOIL,
      );
      const moved = clamp(room, 0, C.RECOIL);
      for (let i = offset; i < end; i++) {
        remaining[i] = copyCore(remaining[i], { s: remaining[i].s - moved }, e);
        holds[i] = C.RECOIL_HOLD;
      }
    }
    offset = end;
  }
  return {
    ...s,
    cores: remaining,
    segments: groups(remaining, holds),
    pressure: clamp(s.pressure - indices.length * C.PRESSURE_DROP_PER_CORE),
    score: s.score + C.SCORE_PER_CORE * indices.length * s.chainStep,
  };
}
function extract(
  s: State,
  index: number,
  merge: boolean,
  e: Events,
): VoluteState {
  const charge = s.cores[index]?.charge;
  if (!charge) return { ...s };
  let lo = index,
    hi = index;
  while (
    lo > 0 &&
    s.cores[lo - 1].charge === charge &&
    Math.abs(s.cores[lo - 1].s - s.cores[lo].s - C.SPACING) < 1e-6
  )
    lo--;
  while (
    hi < s.cores.length - 1 &&
    s.cores[hi + 1].charge === charge &&
    Math.abs(s.cores[hi].s - s.cores[hi + 1].s - C.SPACING) < 1e-6
  )
    hi++;
  if (hi - lo + 1 < C.MIN_RUN) return { ...s };
  const removed = s.cores.slice(lo, hi + 1);
  const next = remove(
    { ...s, chainStep: merge ? s.chainStep + 1 : 1, chainTimer: C.CHAIN_RESET },
    Array.from({ length: removed.length }, (_, i) => lo + i),
    e,
  );
  e.cues.add(
    C.EXTRACT_CUES[Math.min(next.chainStep, C.EXTRACT_CUES.length) - 1],
  );
  for (const core of removed) {
    const p = path(core.s);
    e.effects.push({ kind: "extraction", ...p, charge: core.charge });
    if (!core.mark) continue;
    e.cues.add(C.CUES.machinery);
    e.effects.push({ kind: "pickup", ...p, charge: core.charge });
    e.grants.push({ kind: core.mark, core });
  }
  return next;
}
function advance(s: State, e: Events): VoluteState {
  if (!s.feed) return { ...s };
  let next = { ...s };
  if (s.machinery?.kind === "backflow") {
    const cores = s.cores.map((c) => ({ ...c }));
    for (let i = cores.length - 1; i >= 0; i--)
      if (cores[i].s >= 0)
        cores[i].s = Math.max(
          cores[i + 1] ? cores[i + 1].s + C.SPACING : 0,
          cores[i].s - C.BACKFLOW_SPEED * C.TICK_DT,
        );
    return { ...s, cores, segments: groups(cores, coreHolds(s)) };
  }
  // Core object identities identify each original segment even when an extraction removes an earlier join.
  s.cores.forEach((c, i) => e.tags.set(c, i));
  const originals: number[][] = [];
  let at = 0;
  for (const g of s.segments) {
    originals.push(Array.from({ length: g.count }, (_, i) => at + i));
    at += g.count;
  }
  for (let gi = 0; gi < originals.length; gi++) {
    const original = originals[gi];
    const indices = next.cores.flatMap((c, i) =>
      original.includes(e.tags.get(c) ?? -1) ? [i] : [],
    );
    if (!indices.length) continue;
    const first = indices[0],
      last = indices[indices.length - 1];
    const hs = coreHolds(next);
    if ((hs[first] ?? 0) > 0) continue;
    const distance = (gi === 0 ? feedSpeed(next) : C.CATCHUP_SPEED) * C.TICK_DT;
    const room = first
      ? next.cores[first - 1].s - C.SPACING - next.cores[first].s
      : Infinity;
    const move = Math.min(distance, room);
    const merged = first > 0 && distance >= room - 1e-7;
    const cores = next.cores.map((c, i) =>
      i >= first && i <= last ? copyCore(c, { s: c.s + move }, e) : c,
    );
    if (merged) for (let i = first; i <= last; i++) hs[i] = hs[first - 1];
    next = { ...next, cores, segments: groups(cores, hs) };
    if (merged && cores[first].charge === cores[first - 1].charge)
      next = extract(next, first, true, e);
  }
  return next;
}
function projectiles(s: State, e: Events): VoluteState {
  let next = { ...s, projectiles: [] as VoluteState["projectiles"] };
  for (const projectile of s.projectiles) {
    const a = radians(projectile.angle);
    const p = {
      ...projectile,
      x: projectile.x + Math.cos(a) * C.PROJECTILE_SPEED * C.TICK_DT,
      y: projectile.y + Math.sin(a) * C.PROJECTILE_SPEED * C.TICK_DT,
    };
    if (p.x < 0 || p.y < 0 || p.x > C.FIELD_W || p.y > C.FIELD_H) continue;
    let hit = -1,
      best = Infinity;
    next.cores.forEach((c, i) => {
      const q = path(c.s),
        d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= C.STRIKE_DISTANCE && d < best - 1e-8) {
        best = d;
        hit = i;
      }
    });
    if (hit < 0) {
      next = { ...next, projectiles: [...next.projectiles, p] };
      continue;
    }
    const c = next.cores[hit],
      q = path(c.s);
    const position =
      c.s - ((p.x - q.x) * q.fx + (p.y - q.y) * q.fy > 0 ? 0 : C.SPACING);
    const hs = coreHolds(next);
    const records = next.cores.map((core, i) => ({
      core: core.s <= position ? { ...core, s: core.s - C.SPACING } : core,
      hold: hs[i],
    }));
    const inserted: CoreState = { s: position, charge: p.charge, mark: null };
    records.push({ core: inserted, hold: hs[hit] ?? 0 });
    records.sort((a, b) => b.core.s - a.core.s);
    next = {
      ...next,
      cores: records.map((r) => r.core),
      segments: groups(
        records.map((r) => r.core),
        records.map((r) => r.hold),
      ),
    };
    e.cues.add(C.CUES.seat);
    next = extract(next, next.cores.indexOf(inserted), false, e);
  }
  return next;
}
// Timers that land on a tick boundary must expire on that boundary despite IEEE rounding.
const countdown = (n: number) => (n - C.TICK_DT < 1e-8 ? 0 : n - C.TICK_DT);
export function tick(s: State, e: Events): VoluteState {
  if (s.screen === "cleared" || s.screen === "setback") {
    const interlude = countdown(s.interlude);
    return interlude <= 1e-8
      ? startLevel(s, s.level + (s.screen === "cleared" ? 1 : 0))
      : { ...s, interlude };
  }
  if (s.screen !== "playing") return { ...s };
  const chainTimer = countdown(s.chainTimer);
  const remaining = countdown(s.machinery?.remaining ?? 0);
  let next: VoluteState = {
    ...s,
    chainTimer,
    chainStep: chainTimer <= 1e-8 ? 1 : s.chainStep,
    fireCooldown: countdown(s.fireCooldown),
    machinery:
      s.machinery && remaining > 1e-8 ? { ...s.machinery, remaining } : null,
    segments: s.segments.map((g) => ({
      ...g,
      hold: countdown(g.hold),
    })),
  };
  next = advance(next, e);
  next = projectiles(next, e);
  for (const grant of e.grants) {
    if (grant.kind === "bore") {
      const p = path(grant.core.s);
      const indices = next.cores.flatMap((c, i) =>
        Math.hypot(path(c.s).x - p.x, path(c.s).y - p.y) <= C.BORE_RADIUS
          ? [i]
          : [],
      );
      next = remove(next, indices, e);
      e.effects.push({ kind: "bore", ...p, charge: grant.core.charge });
    } else
      next = {
        ...next,
        machinery: {
          kind: grant.kind,
          remaining: C.MACHINERY_DURATIONS[grant.kind],
        },
      };
  }
  next = {
    ...next,
    pressure: clamp(
      next.pressure +
        (next.cores.length > C.PRESSURE_FREE
          ? (next.cores.length - C.PRESSURE_FREE) * C.PRESSURE_RISE_PER_CORE
          : -C.PRESSURE_BLEED) *
          C.TICK_DT,
    ),
  };
  if ((next.cores[0]?.s ?? 0) >= C.INTAKE_S) {
    e.cues.add(C.CUES.intake);
    e.cues.add(C.CUES.cellLost);
    const p = path(C.INTAKE_S);
    e.effects.push({ kind: "intake", ...p, charge: next.cores[0].charge });
    const cells = Math.max(0, next.cells - 1);
    return {
      ...next,
      cells,
      screen: cells ? "setback" : "gameover",
      interlude: cells ? C.INTERLUDE : 0,
      cores: [],
      segments: [],
      projectiles: [],
      pressure: 0,
      machinery: null,
      chainStep: 1,
      chainTimer: 0,
      quotaRemaining: C.LEVELS[next.level - 1].quota - C.SEEDED_CORES,
    };
  }
  if (!next.quotaRemaining && !next.cores.length) {
    e.cues.add(C.CUES.levelClear);
    return {
      ...next,
      score: next.score + C.CLEAR_SCORE,
      screen: next.level === C.LEVEL_COUNT ? "victory" : "cleared",
      interlude: next.level === C.LEVEL_COUNT ? 0 : C.INTERLUDE,
    };
  }
  if (
    next.emission &&
    next.quotaRemaining > 0 &&
    next.machinery?.kind !== "backflow" &&
    (!next.cores.length || next.cores[next.cores.length - 1].s >= C.SPACING)
  ) {
    const emitted = C.LEVELS[next.level - 1].quota - next.quotaRemaining + 1;
    const cores = [
      ...next.cores,
      {
        s: 0,
        charge: next.nextEmitted ?? drawCharge(next),
        mark: mark(emitted),
      },
    ];
    next = {
      ...next,
      cores,
      segments: groups(cores, coreHolds(next)),
      quotaRemaining: next.quotaRemaining - 1,
      nextEmitted: null,
    };
  }
  return next;
}
