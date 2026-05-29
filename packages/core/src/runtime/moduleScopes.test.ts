/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { startDrtModuleScope, stopModuleScope } from "./moduleScopes";
import { TaskModuleRunner } from "../api/taskModule";

describe("moduleScopes helpers", () => {
  it("startDrtModuleScope should no-op when drt is disabled", () => {
    const runner = new TaskModuleRunner();
    const startSpy = vi.spyOn(runner, "start");

    startDrtModuleScope({
      runner,
      drtConfig: { enabled: false, scope: "block", key: "j", responseWindowMs: 500, displayDurationMs: 120, responseTerminatesStimulus: false, isiSampler: { mode: "uniform", minMs: 800, maxMs: 1200 }, transformPersistence: "scope" },
      scope: "block",
      blockIndex: 0,
      trialIndex: null,
      participantId: "p1",
      sessionId: "s1",
      configPath: "test/v1",
      taskSeedKey: "test_drt",
      context: {},
    });

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("stopModuleScope should delegate to runner.stop with exact address", () => {
    const runner = new TaskModuleRunner();
    const stopSpy = vi.spyOn(runner, "stop");

    stopModuleScope({
      runner,
      scope: "trial",
      blockIndex: 2,
      trialIndex: 7,
    });

    expect(stopSpy).toHaveBeenCalledWith({ scope: "trial", blockIndex: 2, trialIndex: 7 });
  });
});
