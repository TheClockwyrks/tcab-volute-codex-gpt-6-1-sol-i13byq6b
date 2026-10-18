import type { ChargeId, MachineryKind, ScreenName } from "./constants";

export type { ChargeId, MachineryKind, ScreenName };

export interface CoreState {
  readonly charge: ChargeId;
  readonly s: number;
  readonly mark: MachineryKind | null;
}

export interface SegmentState {
  readonly count: number;
  readonly hold: number;
}

export interface ProjectileState {
  readonly charge: ChargeId;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface MachineryState {
  readonly kind: MachineryKind;
  readonly remaining: number;
}

export interface VisualState {
  readonly kind: Sim.Signal["kind"];
  readonly x: number;
  readonly y: number;
  readonly charge: ChargeId;
  readonly age: number;
  readonly seed: number;
}

export interface VoluteState {
  /** Disposable presentation cache, derived from transition events. */
  readonly visuals?: readonly VisualState[];
  readonly screen: ScreenName;

  readonly score: number;
  readonly level: number;
  readonly cells: number;
  readonly quotaRemaining: number;

  readonly pressure: number;
  readonly chainStep: number;
  readonly chainTimer: number;
  readonly machinery: MachineryState | null;

  readonly cores: readonly CoreState[];
  readonly segments: readonly SegmentState[];
  readonly projectiles: readonly ProjectileState[];

  readonly loaded: ChargeId | null;
  readonly queued: ChargeId | null;
  readonly aim: number;
  readonly fireCooldown: number;

  readonly interlude: number;
  readonly simTime: number;
  readonly accumulator: number;
  readonly emission: boolean;
  readonly feed: boolean;
  readonly nextEmitted: ChargeId | null;
  readonly muted: boolean;
}

import type { DeepReadonly } from "ts-essentials";
import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import * as Sim from "./simulation";
import { debugApi } from "./instrumentation";
import { loadAssets, renderHall } from "./presentation";

export interface VoluteDebugApi {
  readonly version: number;
  reset(state: DeepReadonly<VoluteState>): VoluteState;
  reconcile(state: DeepReadonly<VoluteState>): VoluteState;
  snapshot(state: DeepReadonly<VoluteState>): VoluteSnapshot;
  setScreen(state: DeepReadonly<VoluteState>, name: ScreenName): VoluteState;
  setLevel(state: DeepReadonly<VoluteState>, level: number): VoluteState;
  setScore(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setCells(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setChainStep(state: DeepReadonly<VoluteState>, k: number): VoluteState;
  startLevel(state: DeepReadonly<VoluteState>, level: number): VoluteState;
  poseTrain(
    state: DeepReadonly<VoluteState>,
    cores: readonly (readonly [number, ChargeId, MachineryKind | null])[],
  ): VoluteState;
  clearTrain(state: DeepReadonly<VoluteState>): VoluteState;
  setLoaded(state: DeepReadonly<VoluteState>, charge: ChargeId): VoluteState;
  setQueued(state: DeepReadonly<VoluteState>, charge: ChargeId): VoluteState;
  setAim(state: DeepReadonly<VoluteState>, angleDegrees: number): VoluteState;
  fire(state: DeepReadonly<VoluteState>): VoluteState;
  setPressure(state: DeepReadonly<VoluteState>, value: number): VoluteState;
  setQuotaRemaining(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setEmission(state: DeepReadonly<VoluteState>, enabled: boolean): VoluteState;
  setFeed(state: DeepReadonly<VoluteState>, enabled: boolean): VoluteState;
  setNextEmitted(
    state: DeepReadonly<VoluteState>,
    charge: ChargeId | null,
  ): VoluteState;
  grantMachinery(
    state: DeepReadonly<VoluteState>,
    kind: Exclude<MachineryKind, "bore">,
  ): VoluteState;
  pause(state: DeepReadonly<VoluteState>): VoluteState;
  resume(state: DeepReadonly<VoluteState>): VoluteState;
}
export interface VoluteSnapshot {
  version: number;
  screen: ScreenName;
  score: number;
  level: number;
  cells: number;
  quotaRemaining: number;
  emitted: number;
  pressure: number;
  feedSpeed: number;
  chainStep: number;
  chainTimer: number;
  interlude: number;
  danger: boolean;
  train: (CoreState & { x: number; y: number; segment: number })[];
  segments: SegmentState[];
  injector: {
    aim: number;
    cooldown: number;
    loaded: ChargeId | null;
    queued: ChargeId | null;
  };
  projectiles: ProjectileState[];
  machinery: MachineryState | null;
  emission: boolean;
  feed: boolean;
  nextEmitted: ChargeId | null;
  muted: boolean;
  simTime: number;
}
export const BACKGROUND = "#101e26";

function syncMusic(s: Sim.State, api: UpdateApi) {
  const bed =
    s.screen === "playing"
      ? Sim.danger(s)
        ? C.CUES.dangerLoop
        : C.CUES.hallLoop
      : null;
  for (const cue of C.LOOPING_CUES)
    if (cue !== bed && api.audio.looping(cue)) api.audio.stop(cue);
  if (bed && !api.audio.looping(bed)) api.audio.loop(bed);
}

export const game: Game<VoluteState, VoluteDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const sources: Record<string, (s: Sim.State) => string | number | boolean> =
      {
        screen: (s) => s.screen,
        run: (s) => `L${s.level} / ${s.score}`,
        cells: (s) => s.cells,
        quota: (s) => s.quotaRemaining,
        pressure: (s) =>
          `${s.pressure.toFixed(1)} / ${Sim.feedSpeed(s).toFixed(1)} u/s`,
        chain: (s) => s.chainStep,
        train: (s) =>
          `${s.cores.length} / head ${(s.cores[0]?.s ?? 0).toFixed(1)}`,
        segments: (s) => s.segments.length,
        danger: Sim.danger,
        injector: (s) =>
          `${s.loaded} > ${s.queued} / ${s.aim.toFixed(1)}° / ${s.fireCooldown.toFixed(2)}`,
        projectiles: (s) => s.projectiles.length,
        machinery: (s) =>
          s.machinery
            ? `${s.machinery.kind} ${s.machinery.remaining.toFixed(1)}s`
            : "none",
      };
    for (const [name, source] of Object.entries(sources))
      api.diagnostics.register(name, source);
    await loadAssets(api);
    return [Sim.fresh(), debugApi];
  },
  update(state, api, dt) {
    let next: VoluteState = { ...state, simTime: state.simTime + dt };
    const input = api.input;
    if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    next = { ...next, muted: api.audio.muted() };
    const pointer = input.pointer();
    const pointerPress =
      input.pointerPressed() &&
      pointer.x >= 0 &&
      pointer.y >= 0 &&
      pointer.x <= C.FIELD_W &&
      pointer.y <= C.FIELD_H;
    const confirm = input.pressed("confirm") || pointerPress;
    const pause = input.pressed("pause");
    const e = Sim.events();
    if (state.screen === "title" && confirm) next = Sim.startLevel(next, 1);
    else if (
      (state.screen === "victory" || state.screen === "gameover") &&
      confirm
    )
      next = Sim.fresh(next);
    else if (state.screen === "paused" && pause)
      next = { ...next, screen: "playing" };
    else if (state.screen === "playing") {
      if (pause) next = { ...next, screen: "paused", accumulator: 0 };
      else {
        if (
          input.pointerSamples().some((p) => p.primary) &&
          (pointer.x !== C.INJECTOR_X || pointer.y !== C.INJECTOR_Y)
        )
          next = {
            ...next,
            aim: Sim.angle(
              (Math.atan2(pointer.y - C.INJECTOR_Y, pointer.x - C.INJECTOR_X) *
                180) /
                Math.PI,
            ),
          };
        next = {
          ...next,
          aim: Sim.angle(
            next.aim +
              (input.value("right") - input.value("left")) *
                C.AIM_TURN_RATE *
                dt,
          ),
        };
        if (input.pressed("b")) {
          next = { ...next, loaded: next.queued, queued: next.loaded };
          e.cues.add(C.CUES.swap);
        }
        if (input.pressed("a") || pointerPress) {
          if (next.fireCooldown > 1e-8) e.cues.add(C.CUES.denied);
          else {
            next = Sim.fire(next);
            e.cues.add(C.CUES.fire);
          }
        }
      }
    }
    for (const cue of e.cues) api.audio.play(cue);
    if (
      next.screen === "playing" ||
      next.screen === "cleared" ||
      next.screen === "setback"
    ) {
      let accumulated = next.accumulator + dt;
      while (accumulated + 1e-10 >= C.TICK_DT) {
        const tickEvents = Sim.events();
        next = Sim.tick(next, tickEvents);
        next = {
          ...next,
          visuals: [
            ...(next.visuals ?? [])
              .map((v) => ({ ...v, age: v.age + C.TICK_DT }))
              .filter((v) => v.age < 0.9),
            ...tickEvents.effects.map((v, i) => ({
              ...v,
              age: 0,
              seed:
                Math.floor((next.simTime - accumulated + C.TICK_DT) * 1000000) +
                i,
            })),
          ],
        };
        for (const cue of tickEvents.cues) api.audio.play(cue);
        syncMusic(next, api);
        accumulated -= C.TICK_DT;
        if (
          next.screen !== "playing" &&
          next.screen !== "cleared" &&
          next.screen !== "setback"
        ) {
          accumulated = 0;
          break;
        }
      }
      next = { ...next, accumulator: Math.max(0, accumulated) };
    } else next = { ...next, accumulator: 0 };
    syncMusic(next, api);
    return next;
  },
  render: renderHall,
};
