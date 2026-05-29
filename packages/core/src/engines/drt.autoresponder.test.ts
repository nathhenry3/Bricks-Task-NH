/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAutoResponder } from "../runtime/autoresponder";
import { DrtController, DrtModule } from "./drt";

describe("DrtController autoresponder integration", () => {
  let nowMs = 0;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      return window.setTimeout(() => {
        nowMs += 10;
        cb(nowMs);
      }, 10) as unknown as number;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      clearTimeout(id);
    }) as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    configureAutoResponder({ enabled: false } as any);
    vi.clearAllTimers();
    vi.useRealTimers();
    if (originalRaf) {
      globalThis.requestAnimationFrame = originalRaf;
    } else {
      delete (globalThis as any).requestAnimationFrame;
    }
    if (originalCancelRaf) {
      globalThis.cancelAnimationFrame = originalCancelRaf;
    } else {
      delete (globalThis as any).cancelAnimationFrame;
    }
  });

  it("records DRT hits when autoresponder is enabled", () => {
    configureAutoResponder({
      enabled: true,
      seed: "drt-auto-test",
      continueDelayMs: { minMs: 0, maxMs: 0 },
      responseRtMs: { meanMs: 60, sdMs: 1, minMs: 40, maxMs: 90 },
      timeoutRate: 0,
      errorRate: 0,
      interActionDelayMs: { minMs: 0, maxMs: 0 },
      holdDurationMs: { minMs: 0, maxMs: 0 },
      maxTrialDurationMs: 10_000,
    } as any);

    const controller = new DrtController({
      enabled: true,
      key: "space",
      responseWindowMs: 3000,
      displayDurationMs: 120,
      nextIsiMs: () => 1,
    }, {}, { now: () => nowMs });
    controller.start(0);
    vi.advanceTimersByTime(2000);
    const data = controller.stop();

    expect(data.stats.presented).toBeGreaterThan(0);
    expect(data.stats.hits).toBeGreaterThan(0);
  });

  it("does not auto-hit when autoresponder is disabled", () => {
    configureAutoResponder({ enabled: false } as any);

    const controller = new DrtController({
      enabled: true,
      key: "space",
      responseWindowMs: 220,
      displayDurationMs: 120,
      nextIsiMs: () => 1,
    }, {}, { now: () => nowMs });
    controller.start(0);
    vi.advanceTimersByTime(1200);
    const data = controller.stop();

    expect(data.stats.presented).toBeGreaterThan(0);
    expect(data.stats.hits).toBe(0);
  });

  it("ignores repeated held-key keydown events until keyup", () => {
    configureAutoResponder({ enabled: false } as any);

    const controller = new DrtController({
      enabled: true,
      key: "space",
      responseWindowMs: 1000,
      displayDurationMs: 120,
      nextIsiMs: () => 1,
    }, {}, { now: () => nowMs });
    controller.start(0);
    vi.advanceTimersByTime(25);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    const data = controller.stop();
    const responseEvents = data.events.filter((event) => event.type === "drt_response");
    expect(data.stats.hits).toBe(1);
    expect(data.stats.falseAlarms).toBe(0);
    expect(responseEvents).toHaveLength(1);
  });

  it("generates DRT module data in data-only auto mode without wall-clock run time", () => {
    configureAutoResponder({
      enabled: true,
      jsPsychSimulationMode: "data-only",
      seed: "drt-data-only-module-test",
      continueDelayMs: { minMs: 0, maxMs: 0 },
      responseRtMs: { meanMs: 70, sdMs: 1, minMs: 50, maxMs: 90 },
      timeoutRate: 0,
      errorRate: 0,
      interActionDelayMs: { minMs: 0, maxMs: 0 },
      holdDurationMs: { minMs: 0, maxMs: 0 },
      maxTrialDurationMs: 10_000,
    } as any);

    const module = new DrtModule();
    const handle = module.start(
      {
        enabled: true,
        scope: "trial",
        key: "space",
        responseWindowMs: 3000,
        displayDurationMs: 120,
        responseTerminatesStimulus: true,
        isiSampler: { type: "uniform", min: 80, max: 120 },
        dataOnlySimulationDurationMs: 5000,
      } as any,
      { scope: "trial", blockIndex: 0, trialIndex: 0 },
      {},
    );

    const result = handle.stop();
    expect(result.engine.stats.presented).toBeGreaterThan(0);
    expect(result.engine.stats.hits).toBeGreaterThan(0);
    expect(result.engine.events.some((event) => event.type === "drt_response")).toBe(true);
  });

  it("persists session transform state across block-scoped DRT modules when configured", () => {
    configureAutoResponder({
      enabled: true,
      jsPsychSimulationMode: "data-only",
      seed: "drt-session-transform-test",
      continueDelayMs: { minMs: 0, maxMs: 0 },
      responseRtMs: { meanMs: 70, sdMs: 1, minMs: 50, maxMs: 90 },
      timeoutRate: 0,
      errorRate: 0,
      interActionDelayMs: { minMs: 0, maxMs: 0 },
      holdDurationMs: { minMs: 0, maxMs: 0 },
      maxTrialDurationMs: 10_000,
    } as any);

    const module = new DrtModule();
    const config = {
      enabled: true,
      scope: "block",
      key: "space",
      responseWindowMs: 3000,
      displayDurationMs: 120,
      responseTerminatesStimulus: true,
      isiSampler: { type: "uniform", min: 80, max: 120 },
      transformPersistence: "session",
      parameterTransforms: [{ type: "wald_conjugate", id: "rt_wald", minWindowSize: 2, maxWindowSize: 25 }],
      dataOnlySimulationDurationMs: 2500,
    } as any;

    const first = module.start(
      config,
      { scope: "block", blockIndex: 0, trialIndex: null },
      { participantId: "p1", sessionId: "s1", configPath: "configs/bricks/evanderHons.json", taskId: "bricks" },
    ).stop();
    // Forced-end boundary events produce null estimates; find the last row with a real estimate.
    const firstSize = Number(
      first.responseRows.findLast(r => typeof r.transformColumns?.transform_sample_size === "number")
        ?.transformColumns?.transform_sample_size ?? 0
    );

    const second = module.start(
      config,
      { scope: "block", blockIndex: 1, trialIndex: null },
      { participantId: "p1", sessionId: "s1", configPath: "configs/bricks/evanderHons.json", taskId: "bricks" },
    ).stop();
    const secondSize = Number(
      second.responseRows.findLast(r => typeof r.transformColumns?.transform_sample_size === "number")
        ?.transformColumns?.transform_sample_size ?? 0
    );

    expect(firstSize).toBeGreaterThan(0);
    expect(secondSize).toBeGreaterThan(firstSize);
  });
});
