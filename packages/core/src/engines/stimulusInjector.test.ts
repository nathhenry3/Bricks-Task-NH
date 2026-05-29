import { describe, it, expect } from "vitest";
import { StimulusInjectorModule } from "./stimulusInjector";

describe("StimulusInjectorModule", () => {
  it("injects configured trials at eligible positions", () => {
    const module = new StimulusInjectorModule();
    const block = {
      blockIndex: 0,
      trials: Array.from({ length: 20 }, (_, idx) => ({
        trialIndex: idx,
        trialType: "F",
        item: `base_${idx + 1}`,
        sourceCategory: "other",
        itemCategory: "other",
        correctResponse: "z",
      })),
    };

    const transformed = module.transformBlockPlan(
      block,
      {
        enabled: true,
        injections: [
          {
            id: "pm_like",
            schedule: { count: 2, minSeparation: 5, maxSeparation: 8 },
            eligibleTrialTypes: ["F"],
            source: { type: "category_in", categories: ["animals"] },
            set: { trialType: "PM", itemCategory: "PM", correctResponse: "space" },
          },
        ],
      },
      {
        rng: {
          int: (min: number, _max: number) => min,
          shuffle: (values: any[]) => values,
        } as any,
        stimuliByCategory: { animals: ["cat", "dog"] },
      } as any,
    );

    const pmTrials = transformed.trials.filter((trial: any) => trial.trialType === "PM");
    expect(pmTrials.length).toBe(2);
    expect(pmTrials[0].correctResponse).toBe("space");
    expect(["cat", "dog"]).toContain(pmTrials[0].item);
  });

  it("exposes modular semantics from responseCategory mappings", () => {
    const module = new StimulusInjectorModule();
    const semantics = module.getModularSemantics({
      enabled: true,
      injections: [
        {
          schedule: { count: 1, minSeparation: 2, maxSeparation: 3 },
          source: { type: "literal", items: ["x"] },
          set: { correctResponse: "space", responseCategory: "pm" },
        },
        {
          schedule: { count: 1, minSeparation: 2, maxSeparation: 3 },
          source: { type: "literal", items: ["y"] },
          set: { correctResponse: "k", responseCategory: "probe" },
        },
      ],
    });

    expect(semantics).toEqual({
      pm: ["space"],
      probe: ["k"],
    });
  });

  it("defaults to without-replacement PM item draws within a block", () => {
    const module = new StimulusInjectorModule();
    const block = {
      blockIndex: 0,
      trials: Array.from({ length: 24 }, (_, idx) => ({
        trialIndex: idx,
        trialType: "F",
        item: `base_${idx + 1}`,
        sourceCategory: "other",
        itemCategory: "other",
        correctResponse: "z",
      })),
    };

    const transformed = module.transformBlockPlan(
      block,
      {
        enabled: true,
        injections: [
          {
            id: "pm_unique",
            schedule: { count: 4, minSeparation: 2, maxSeparation: 5 },
            eligibleTrialTypes: ["F"],
            source: { type: "literal", items: ["a", "b", "c", "d"], sourceCategory: "pm" },
            set: { trialType: "PM", itemCategory: "PM", correctResponse: "space" },
          },
        ],
      },
      {
        rng: {
          int: (min: number, _max: number) => min,
          shuffle: (values: any[]) => values,
        } as any,
      } as any,
    );

    const pmItems = transformed.trials
      .filter((trial: any) => trial.trialType === "PM")
      .map((trial: any) => trial.item);

    expect(pmItems.length).toBe(4);
    expect(new Set(pmItems).size).toBe(4);
  });

  it("supports participant-scoped without-replacement draws across blocks with recycling", () => {
    const module = new StimulusInjectorModule();
    const makeBlock = (blockIndex: number) => ({
      blockIndex,
      trials: Array.from({ length: 14 }, (_, idx) => ({
        trialIndex: idx,
        trialType: "F",
        item: `base_${blockIndex}_${idx + 1}`,
        sourceCategory: "other",
        itemCategory: "other",
        correctResponse: "z",
      })),
    });
    const config = {
      enabled: true,
      injections: [
        {
          id: "pm_shared",
          schedule: { count: 4, minSeparation: 2, maxSeparation: 3 },
          eligibleTrialTypes: ["F"],
          source: { type: "literal", items: ["a", "b", "c"], sourceCategory: "pm" },
          sourceDraw: { mode: "without_replacement", scope: "participant", shuffle: false },
          set: { trialType: "PM", itemCategory: "PM", correctResponse: "space" },
        },
      ],
    };
    const ctx = {
      rng: {
        int: (min: number, _max: number) => min,
        shuffle: (values: any[]) => values,
      } as any,
    } as any;

    const first = module.transformBlockPlan(makeBlock(0), config, ctx);
    const second = module.transformBlockPlan(makeBlock(1), config, ctx);

    const firstItems = first.trials.filter((trial: any) => trial.trialType === "PM").map((trial: any) => trial.item);
    const secondItems = second.trials.filter((trial: any) => trial.trialType === "PM").map((trial: any) => trial.item);

    expect(firstItems).toEqual(["a", "b", "c", "a"]);
    expect(secondItems).toEqual(["b", "c", "a", "b"]);
  });
});
