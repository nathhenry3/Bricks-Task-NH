import type { TaskModule, TaskModuleHandle, TaskModuleAddress, TaskModuleContext } from "../api/taskModule";
import { generateProspectiveMemoryPositions, type ProspectiveMemoryScheduleConfig } from "./prospectiveMemory";
import { coercePoolDrawConfig, createCategoryPoolDrawer, createPoolDrawer, type CategoryDrawMode, type PoolDrawConfig } from "../infrastructure/pools";
import { asObject, asString } from "../utils/coerce";

export interface StimulusInjectionCategorySource {
  type: "category_in";
  categories: string[];
}

export interface StimulusInjectionLiteralSource {
  type: "literal";
  items: string[];
  sourceCategory?: string;
}

export type StimulusInjectionSource = StimulusInjectionCategorySource | StimulusInjectionLiteralSource;

export interface StimulusInjectionSourceDrawConfig {
  mode?: PoolDrawConfig["mode"];
  scope?: "block" | "participant";
  shuffle?: boolean;
  categoryMode?: CategoryDrawMode;
}

export interface StimulusInjectionSetters {
  trialType?: string;
  itemCategory?: string;
  correctResponse?: string;
  responseCategory?: string;
  locked?: boolean;
}

export interface StimulusInjectionSpec {
  id?: string;
  enabled?: boolean;
  schedule: ProspectiveMemoryScheduleConfig;
  eligibleTrialTypes?: string[];
  source: StimulusInjectionSource;
  sourceDraw?: StimulusInjectionSourceDrawConfig;
  set?: StimulusInjectionSetters;
}

export interface StimulusInjectorModuleConfig {
  enabled: boolean;
  injections: StimulusInjectionSpec[];
}

export interface StimulusInjectorModuleResult {
  applied: Array<{ id: string; positions: number[]; blockIndex?: number }>;
}

interface InjectionPick {
  item: string;
  sourceCategory: string;
}

type InjectionDrawer = () => InjectionPick;

export class StimulusInjectorModule implements TaskModule<StimulusInjectorModuleConfig, StimulusInjectorModuleResult> {
  readonly id = "injector";
  private participantScopedDrawers = new Map<string, InjectionDrawer>();

  transformBlockPlan(block: any, config: StimulusInjectorModuleConfig, context: TaskModuleContext): any {
    if (!config.enabled || !context.rng) return block;
    const injections = Array.isArray(config.injections) ? config.injections : [];
    if (injections.length === 0) return block;

    let currentBlock = block;
    for (let i = 0; i < injections.length; i += 1) {
      const injection = injections[i];
      if (!injection || injection.enabled === false) continue;
      currentBlock = this.applyInjection(currentBlock, injection, i, context);
    }
    return currentBlock;
  }

  getModularSemantics(config: StimulusInjectorModuleConfig): Record<string, string | string[]> {
    if (!config.enabled) return {};
    const out: Record<string, string[]> = {};
    for (const injection of Array.isArray(config.injections) ? config.injections : []) {
      if (!injection || injection.enabled === false) continue;
      const category = String(injection.set?.responseCategory ?? "").trim();
      const key = String(injection.set?.correctResponse ?? "").trim();
      if (!category || !key) continue;
      const existing = out[category] ?? [];
      if (!existing.includes(key)) existing.push(key);
      out[category] = existing;
    }
    return out;
  }

  start(_config: StimulusInjectorModuleConfig, _address: TaskModuleAddress, _context: TaskModuleContext): TaskModuleHandle<StimulusInjectorModuleResult> {
    return {
      stop: () => ({ applied: [] }),
    };
  }

  private applyInjection(
    block: any,
    injection: StimulusInjectionSpec,
    injectionIndex: number,
    context: TaskModuleContext,
  ): any {
    const trials = Array.isArray(block?.trials) ? block.trials : [];
    if (trials.length === 0) return block;

    // ⚡ Bolt: Consolidated chained array map/filter/map passes into a single loop to prevent intermediate allocations
    const eligibleIndices: number[] = [];
    const hasEligibleTypes = Array.isArray(injection.eligibleTrialTypes) && injection.eligibleTrialTypes.length > 0;

    for (let idx = 0; idx < trials.length; idx++) {
      const t = trials[idx];
      const locked = Boolean(t?.locked);
      if (locked) continue;

      const trialType = String(t?.trialType ?? "");
      if (!hasEligibleTypes || (injection.eligibleTrialTypes && injection.eligibleTrialTypes.includes(trialType))) {
        eligibleIndices.push(idx);
      }
    }

    if (eligibleIndices.length === 0) {
      const requestedCount = Math.max(0, Math.floor(Number(injection.schedule?.count ?? 0)));
      if (requestedCount > 0) {
        throw new Error(
          `Injection '${String(injection.id ?? `inj_${injectionIndex + 1}`)}' cannot place any trials: no eligible positions.`,
        );
      }
      return block;
    }

    const positions = generateProspectiveMemoryPositions(
      context.rng!,
      trials.length,
      injection.schedule,
      new Set(eligibleIndices),
    );
    if (positions.length === 0) return block;

    const nextTrials = [...trials];
    const injectionId = String(injection.id ?? `inj_${injectionIndex + 1}`);
    const draw = this.createDrawerWithConfig(injection.source, injection.sourceDraw ?? null, context, injectionId);
    for (const pos of positions) {
      const base = nextTrials[pos];
      if (!base) continue;
      const pick = draw();
      const set = injection.set ?? {};
      const setTrialType = String(set.trialType ?? "").trim().toUpperCase();
      const setResponseCategory = String(set.responseCategory ?? "").trim().toLowerCase();
      const inferredPmLock = set.locked === undefined && (setTrialType === "PM" || setResponseCategory === "pm");
      const shouldLock = set.locked === true || inferredPmLock;
      nextTrials[pos] = {
        ...base,
        item: pick.item,
        sourceCategory: pick.sourceCategory,
        ...(set.trialType ? { trialType: set.trialType } : {}),
        ...(set.itemCategory ? { itemCategory: set.itemCategory } : {}),
        ...(set.correctResponse ? { correctResponse: set.correctResponse } : {}),
        ...(set.responseCategory ? { expectedCategory: set.responseCategory } : {}),
        ...(shouldLock ? { locked: true } : {}),
        injectionId,
      };
    }

    return {
      ...block,
      trials: nextTrials,
      injectionLog: [
        ...(Array.isArray(block?.injectionLog) ? block.injectionLog : []),
        { id: injectionId, positions },
      ],
    };
  }

  private createDrawerWithConfig(
    source: StimulusInjectionSource,
    sourceDrawRaw: StimulusInjectionSourceDrawConfig | null,
    context: TaskModuleContext,
    injectionId?: string,
  ): InjectionDrawer {
    const sourceDraw = this.coerceSourceDrawConfig(sourceDrawRaw);

    const buildDrawer = (): InjectionDrawer => {
      if (sourceDraw.categoryMode !== undefined && source.type === "category_in") {
        const categories = Array.isArray(source.categories) ? source.categories : [];
        const draw = createCategoryPoolDrawer(
          context.stimuliByCategory ?? {},
          categories,
          context.rng!,
          {
            itemDraw: { mode: sourceDraw.mode, shuffle: sourceDraw.shuffle },
            categoryDraw: { mode: sourceDraw.categoryMode, shuffle: sourceDraw.shuffle },
          },
        );
        return () => {
          const picked = draw();
          return { item: picked.item, sourceCategory: picked.category };
        };
      }

      const candidates = this.collectCandidates(source, context);
      if (candidates.length === 0) {
        const fallbackCategory = source.type === "literal"
          ? String(source.sourceCategory ?? "literal")
          : "unknown";
        return () => ({ item: "injected_item", sourceCategory: fallbackCategory });
      }
      const draw = createPoolDrawer(
        candidates.map((pick) => ({ item: pick.item, category: pick.sourceCategory })),
        context.rng!,
        { mode: sourceDraw.mode, shuffle: sourceDraw.shuffle },
      );
      return () => {
        const picked = draw();
        return { item: picked.item, sourceCategory: picked.category };
      };
    };

    if (sourceDraw.scope !== "participant") return buildDrawer();

    const scopedId = this.makeParticipantScopedDrawerId(source, sourceDraw, injectionId);
    const existing = this.participantScopedDrawers.get(scopedId);
    if (existing) return existing;
    const created = buildDrawer();
    this.participantScopedDrawers.set(scopedId, created);
    return created;
  }

  private coerceSourceDrawConfig(value: StimulusInjectionSourceDrawConfig | null): {
    mode: PoolDrawConfig["mode"];
    shuffle: boolean;
    scope: "block" | "participant";
    categoryMode: CategoryDrawMode | undefined;
  } {
    const raw = asObject(value);
    const draw = coercePoolDrawConfig(raw, { mode: "without_replacement", shuffle: true });
    const scopeRaw = asString(raw?.scope)?.toLowerCase();
    const scope = scopeRaw === "participant" ? "participant" : "block";
    const categoryModeRaw = asString(raw?.categoryMode)?.toLowerCase();
    const validCategoryModes: CategoryDrawMode[] = ["ordered", "with_replacement", "without_replacement", "round_robin"];
    const categoryMode = validCategoryModes.includes(categoryModeRaw as CategoryDrawMode)
      ? (categoryModeRaw as CategoryDrawMode)
      : undefined;
    return { mode: draw.mode, shuffle: draw.shuffle, scope, categoryMode };
  }

  private makeParticipantScopedDrawerId(
    source: StimulusInjectionSource,
    sourceDraw: { mode: PoolDrawConfig["mode"]; shuffle: boolean; scope: string; categoryMode: CategoryDrawMode | undefined },
    injectionId?: string,
  ): string {
    const sourceKey = source.type === "literal"
      ? JSON.stringify({
        type: source.type,
        sourceCategory: source.sourceCategory ?? "literal",
        items: source.items ?? [],
      })
      : JSON.stringify({
        type: source.type,
        categories: source.categories ?? [],
      });
    return JSON.stringify({
      injectionId: injectionId ?? "injector",
      draw: sourceDraw,
      source: sourceKey,
    });
  }

  private collectCandidates(source: StimulusInjectionSource, context: TaskModuleContext): InjectionPick[] {
    if (source.type === "literal") {
      const items = Array.isArray(source.items) ? source.items.map((item) => String(item)).filter(Boolean) : [];
      const sourceCategory = String(source.sourceCategory ?? "literal");
      return items.map((item) => ({ item, sourceCategory }));
    }

    const categories = Array.isArray(source.categories)
      ? source.categories.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    const categoryPools = context.stimuliByCategory ?? {};
    const validCategories = categories.filter((category) => Array.isArray(categoryPools[category]) && categoryPools[category].length > 0);
    const out: InjectionPick[] = [];
    for (const category of validCategories) {
      for (const item of categoryPools[category]) {
        out.push({ item, sourceCategory: category });
      }
    }
    return out;
  }

}
