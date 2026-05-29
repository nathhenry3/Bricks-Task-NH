/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mergeRtTaskConfig, resolveRtTaskConfig, runCustomRtTrial } from "./rtTask";

describe("runCustomRtTrial", () => {
  it("should execute a sequence of stages and capture response", async () => {
    const container = document.createElement("div");
    const render1 = vi.fn().mockReturnValue("P1");
    const render2 = vi.fn().mockReturnValue("P2");

    const resultPromise = runCustomRtTrial({
      container,
      stages: [
        { id: "p1", durationMs: 100, render: render1 },
        { id: "p2", durationMs: 100, render: render2 },
      ],
      response: {
        allowedKeys: ["a"],
        startMs: 50,
        endMs: 200,
      },
    });

    // Simulate key press at 150ms
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    }, 150);

    const result = await resultPromise;

    expect(result.key).toBe("a");
    expect(result.rtMs).toBeGreaterThanOrEqual(150);
    expect(render1).toHaveBeenCalled();
    expect(render2).toHaveBeenCalled();
  });
});

describe("resolveRtTaskConfig", () => {
  const baseTiming = {
    trialDurationMs: 3000,
    fixationDurationMs: 500,
    stimulusOnsetMs: 750,
    responseWindowStartMs: 750,
    responseWindowEndMs: 3000,
  };

  it("should resolve task-level rtTask with defaults", () => {
    const resolved = resolveRtTaskConfig({
      baseTiming,
      override: {
        timing: {
          trialDurationMs: 4500,
          responseWindowEndMs: 4200,
        },
      },
      defaultEnabled: false,
      defaultResponseTerminatesTrial: false,
    });

    expect(resolved.enabled).toBe(false);
    expect(resolved.responseTerminatesTrial).toBe(false);
    expect(resolved.timing.trialDurationMs).toBe(4500);
    expect(resolved.timing.responseWindowEndMs).toBe(4200);
    expect(resolved.timing.fixationDurationMs).toBe(500);
    expect(resolved.timing.fixationOnsetMs).toBe(0);
  });

  it("should merge block-level rtTask overrides over base config", () => {
    const base = resolveRtTaskConfig({
      baseTiming,
      override: {
        enabled: true,
        responseTerminatesTrial: false,
        timing: {
          trialDurationMs: 3000,
          fixationDurationMs: 500,
          stimulusOnsetMs: 750,
          responseWindowStartMs: 750,
          responseWindowEndMs: 3000,
        },
      },
      defaultEnabled: false,
      defaultResponseTerminatesTrial: false,
    });

    const merged = mergeRtTaskConfig(base, {
      timing: {
        trialDurationMs: 5000,
        responseWindowEndMs: 5000,
      },
    });

    expect(merged.enabled).toBe(true);
    expect(merged.responseTerminatesTrial).toBe(false);
    expect(merged.timing.trialDurationMs).toBe(5000);
    expect(merged.timing.responseWindowEndMs).toBe(5000);
    expect(merged.timing.stimulusOnsetMs).toBe(750);
    expect(merged.timing.fixationDurationMs).toBe(500);
  });

  it("should force all RT timing fields via URL rt_fast_ms", () => {
    window.history.replaceState({}, "", "?rt_fast_ms=10");
    const resolved = resolveRtTaskConfig({
      baseTiming,
      override: {
        timing: {
          trialDurationMs: 4500,
          fixationOnsetMs: 250,
          fixationDurationMs: 500,
          stimulusOnsetMs: 700,
          stimulusDurationMs: 3800,
          responseWindowStartMs: 700,
          responseWindowEndMs: 4200,
        },
      },
      defaultEnabled: false,
      defaultResponseTerminatesTrial: false,
    });

    expect(resolved.timing.trialDurationMs).toBe(50);
    expect(resolved.timing.fixationOnsetMs).toBe(0);
    expect(resolved.timing.fixationDurationMs).toBe(10);
    expect(resolved.timing.stimulusOnsetMs).toBe(20);
    expect(resolved.timing.stimulusDurationMs).toBe(20);
    expect(resolved.timing.responseWindowStartMs).toBe(20);
    expect(resolved.timing.responseWindowEndMs).toBe(40);
    window.history.replaceState({}, "", "/");
  });
});
