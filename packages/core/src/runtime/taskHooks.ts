import {
  evaluateTrialOutcome,
  type EvaluateTrialOutcomeArgs,
  type TrialOutcome,
} from "./outcome";

type MaybePromise<T> = T | Promise<T>;

export type HookPhase =
  | "task_start"
  | "task_end"
  | "block_start"
  | "block_end"
  | "trial_start"
  | "trial_end"
  | "custom";

export interface TaskHookEvent<TPayload = unknown> {
  name: string;
  phase?: HookPhase;
  payload?: TPayload;
  trialIndex?: number;
  blockIndex?: number;
  timestampMs?: number;
}

export interface HookErrorContext {
  hookId: string;
  phase: HookPhase;
  eventName?: string;
}

export interface HookExecutionOptions {
  continueOnError?: boolean;
  onError?: (error: unknown, context: HookErrorContext) => void;
}

export interface HookStateStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  update<T = unknown>(key: string, updater: (current: T | undefined) => T): T;
  delete(key: string): void;
  clear(): void;
  entries(): Array<[string, unknown]>;
}

export interface TaskHookContext {
  hookId: string;
  state: HookStateStore;
}

export interface TaskHookLifecycleContext<TBlock = unknown, TTrial = unknown> extends TaskHookContext {
  block?: TBlock;
  blockIndex?: number;
  trial?: TTrial;
  trialIndex?: number;
}

export interface TaskHookEventContext<TBlock = unknown, TTrial = unknown> extends TaskHookLifecycleContext<TBlock, TTrial> {
  event: TaskHookEvent;
}

export interface TrialPlanHookContext<TTrial, TBlock = unknown> {
  trial: TTrial;
  trialIndex: number;
  block: TBlock;
  blockIndex: number;
  state: HookStateStore;
  hookId: string;
}

export interface TrialPlanHook<TTrial, TBlock = unknown> {
  id?: string;
  priority?: number;
  enabled?: boolean;
  onTrialPlanned?(context: TrialPlanHookContext<TTrial, TBlock>): MaybePromise<TTrial | void>;
}

export interface TrialOutcomeHook {
  id?: string;
  priority?: number;
  enabled?: boolean;
  beforeEvaluate?(args: EvaluateTrialOutcomeArgs, context: TaskHookContext): MaybePromise<Partial<EvaluateTrialOutcomeArgs> | void>;
  afterEvaluate?(
    args: { input: EvaluateTrialOutcomeArgs; outcome: TrialOutcome },
    context: TaskHookContext,
  ): MaybePromise<Partial<TrialOutcome> | void>;
}

export interface TaskHook<TTrial = unknown, TBlock = unknown> extends TrialPlanHook<TTrial, TBlock>, TrialOutcomeHook {
  onTaskStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onTaskEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onBlockStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onBlockEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onTrialStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onTrialEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
  onEvent?(context: TaskHookEventContext<TBlock, TTrial>): MaybePromise<void>;
}

export interface PreparedTaskHook<TTrial = unknown, TBlock = unknown> extends TaskHook<TTrial, TBlock> {
  id: string;
  order: number;
}

export interface PrepareTaskHooksOptions {
  defaultPrefix?: string;
}

interface HookStateStoreInternal extends HookStateStore {
  readonly _source: Map<string, unknown>;
}

export function createHookStateStore(initial?: Record<string, unknown> | null): HookStateStore {
  const source = new Map<string, unknown>();
  if (initial && typeof initial === "object") {
    for (const [key, value] of Object.entries(initial)) {
      source.set(key, value);
    }
  }
  const state: HookStateStoreInternal = {
    _source: source,
    get<T = unknown>(key: string): T | undefined {
      return source.get(String(key)) as T | undefined;
    },
    set<T = unknown>(key: string, value: T): void {
      source.set(String(key), value);
    },
    update<T = unknown>(key: string, updater: (current: T | undefined) => T): T {
      const normalizedKey = String(key);
      const next = updater(source.get(normalizedKey) as T | undefined);
      source.set(normalizedKey, next);
      return next;
    },
    delete(key: string): void {
      source.delete(String(key));
    },
    clear(): void {
      source.clear();
    },
    entries(): Array<[string, unknown]> {
      return Array.from(source.entries());
    },
  };
  return state;
}

export function prepareTaskHooks<TTrial = unknown, TBlock = unknown>(
  hooks?: Array<TaskHook<TTrial, TBlock> | null | undefined> | null,
  options: PrepareTaskHooksOptions = {},
): PreparedTaskHook<TTrial, TBlock>[] {
  if (!Array.isArray(hooks) || hooks.length === 0) return [];
  const prefix = options.defaultPrefix?.trim() || "hook";
  const normalized: PreparedTaskHook<TTrial, TBlock>[] = [];
  for (let index = 0; index < hooks.length; index += 1) {
    const hook = hooks[index];
    if (!hook || hook.enabled === false) continue;
    const id = (hook.id ?? `${prefix}_${index + 1}`).trim();
    const priority = Number.isFinite(hook.priority) ? Number(hook.priority) : 0;
    normalized.push({
      ...hook,
      id,
      order: normalized.length,
      priority,
    });
  }
  normalized.sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? Number(a.priority) : 0;
    const pb = Number.isFinite(b.priority) ? Number(b.priority) : 0;
    if (pa !== pb) return pa - pb;
    return a.order - b.order;
  });
  return normalized;
}

function handleHookError(error: unknown, context: HookErrorContext, options?: HookExecutionOptions): void {
  options?.onError?.(error, context);
  if (!options?.continueOnError) {
    throw error;
  }
}

export interface RunTaskHookLifecycleArgs<TTrial = unknown, TBlock = unknown> {
  phase: HookPhase;
  hooks?: Array<TaskHook<TTrial, TBlock> | PreparedTaskHook<TTrial, TBlock> | null | undefined> | null;
  context?: Omit<TaskHookLifecycleContext<TBlock, TTrial>, "hookId" | "state">;
  state?: HookStateStore;
  options?: HookExecutionOptions;
}

export async function runTaskHookLifecycle<TTrial = unknown, TBlock = unknown>(
  args: RunTaskHookLifecycleArgs<TTrial, TBlock>,
): Promise<void> {
  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "task_hook" });
  if (hooks.length === 0) return;
  const state = args.state ?? createHookStateStore();
  for (const hook of hooks) {
    const context: TaskHookLifecycleContext<TBlock, TTrial> = {
      ...(args.context ?? {}),
      hookId: hook.id,
      state,
    };
    try {
      if (args.phase === "task_start") await hook.onTaskStart?.(context);
      if (args.phase === "task_end") await hook.onTaskEnd?.(context);
      if (args.phase === "block_start") await hook.onBlockStart?.(context);
      if (args.phase === "block_end") await hook.onBlockEnd?.(context);
      if (args.phase === "trial_start") await hook.onTrialStart?.(context);
      if (args.phase === "trial_end") await hook.onTrialEnd?.(context);
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: args.phase }, args.options);
    }
  }
}

export interface EmitTaskHookEventArgs<TTrial = unknown, TBlock = unknown> {
  event: TaskHookEvent;
  hooks?: Array<TaskHook<TTrial, TBlock> | PreparedTaskHook<TTrial, TBlock> | null | undefined> | null;
  context?: Omit<TaskHookEventContext<TBlock, TTrial>, "hookId" | "state" | "event">;
  state?: HookStateStore;
  options?: HookExecutionOptions;
}

export async function emitTaskHookEvent<TTrial = unknown, TBlock = unknown>(
  args: EmitTaskHookEventArgs<TTrial, TBlock>,
): Promise<void> {
  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "task_hook" });
  if (hooks.length === 0) return;
  const state = args.state ?? createHookStateStore();
  const eventPhase = args.event.phase ?? "custom";
  for (const hook of hooks) {
    const context: TaskHookEventContext<TBlock, TTrial> = {
      ...(args.context ?? {}),
      event: args.event,
      hookId: hook.id,
      state,
    };
    try {
      await hook.onEvent?.(context);
    } catch (error) {
      handleHookError(
        error,
        { hookId: hook.id, phase: eventPhase, eventName: args.event.name },
        args.options,
      );
    }
  }
}

export interface EvaluateTrialOutcomeWithHooksArgs extends EvaluateTrialOutcomeArgs {
  hooks?: Array<TrialOutcomeHook | TaskHook | null | undefined> | null;
  state?: HookStateStore;
  options?: HookExecutionOptions;
}

export function evaluateTrialOutcomeWithHooks(args: EvaluateTrialOutcomeWithHooksArgs): TrialOutcome {
  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "outcome_hook" });
  const state = args.state ?? createHookStateStore();
  let input: EvaluateTrialOutcomeArgs = {
    responseCategory: args.responseCategory,
    rt: args.rt,
    stimulusCategory: args.stimulusCategory,
    expectedCategory: args.expectedCategory,
    meta: args.meta,
    evaluator: args.evaluator,
  };

  for (const hook of hooks) {
    try {
      const patch = hook.beforeEvaluate?.(input, { hookId: hook.id, state });
      if (!patch || typeof (patch as Promise<unknown>)?.then === "function") {
        if (patch && typeof (patch as Promise<unknown>)?.then === "function") {
          throw new Error(
            `Hook '${hook.id}' returned a Promise in sync outcome evaluation. Use evaluateTrialOutcomeWithHooksAsync.`,
          );
        }
        continue;
      }
      input = { ...input, ...patch };
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "beforeEvaluate" }, args.options);
    }
  }

  let outcome = evaluateTrialOutcome(input);
  for (const hook of hooks) {
    try {
      const patch = hook.afterEvaluate?.({ input, outcome }, { hookId: hook.id, state });
      if (!patch || typeof (patch as Promise<unknown>)?.then === "function") {
        if (patch && typeof (patch as Promise<unknown>)?.then === "function") {
          throw new Error(
            `Hook '${hook.id}' returned a Promise in sync outcome evaluation. Use evaluateTrialOutcomeWithHooksAsync.`,
          );
        }
        continue;
      }
      outcome = { ...outcome, ...patch };
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "afterEvaluate" }, args.options);
    }
  }

  return outcome;
}

export async function evaluateTrialOutcomeWithHooksAsync(args: EvaluateTrialOutcomeWithHooksArgs): Promise<TrialOutcome> {
  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "outcome_hook" });
  const state = args.state ?? createHookStateStore();
  let input: EvaluateTrialOutcomeArgs = {
    responseCategory: args.responseCategory,
    rt: args.rt,
    stimulusCategory: args.stimulusCategory,
    expectedCategory: args.expectedCategory,
    meta: args.meta,
    evaluator: args.evaluator,
  };

  for (const hook of hooks) {
    try {
      const patch = await hook.beforeEvaluate?.(input, { hookId: hook.id, state });
      if (!patch) continue;
      input = { ...input, ...patch };
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "beforeEvaluate" }, args.options);
    }
  }

  let outcome = evaluateTrialOutcome(input);
  for (const hook of hooks) {
    try {
      const patch = await hook.afterEvaluate?.({ input, outcome }, { hookId: hook.id, state });
      if (!patch) continue;
      outcome = { ...outcome, ...patch };
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "afterEvaluate" }, args.options);
    }
  }

  return outcome;
}

export interface ApplyTrialPlanHooksArgs<TTrial, TBlock = unknown> {
  trial: TTrial;
  context: Omit<TrialPlanHookContext<TTrial, TBlock>, "trial" | "state" | "hookId">;
  hooks?: Array<TrialPlanHook<TTrial, TBlock> | TaskHook<TTrial, TBlock> | null | undefined> | null;
  state?: HookStateStore;
  options?: HookExecutionOptions;
}

export function applyTrialPlanHooks<TTrial, TBlock = unknown>(
  trialOrArgs: TTrial | ApplyTrialPlanHooksArgs<TTrial, TBlock>,
  legacyContext?: Omit<TrialPlanHookContext<TTrial, TBlock>, "trial" | "state" | "hookId">,
  legacyHooks?: Array<TrialPlanHook<TTrial, TBlock> | TaskHook<TTrial, TBlock> | null | undefined> | null,
): TTrial {
  const args = isApplyTrialPlanHooksArgs(trialOrArgs)
    ? trialOrArgs
    : {
        trial: trialOrArgs,
        context: legacyContext as Omit<TrialPlanHookContext<TTrial, TBlock>, "trial" | "state" | "hookId">,
        hooks: legacyHooks,
      };

  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "plan_hook" });
  if (hooks.length === 0) return args.trial;
  const state = args.state ?? createHookStateStore();
  let current = args.trial;
  for (const hook of hooks) {
    try {
      const next = hook.onTrialPlanned?.({
        ...args.context,
        trial: current,
        hookId: hook.id,
        state,
      });
      if (next === undefined) continue;
      if (typeof (next as Promise<unknown>)?.then === "function") {
        throw new Error(`Hook '${hook.id}' returned a Promise in sync planning. Use applyTrialPlanHooksAsync.`);
      }
      current = next as TTrial;
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "onTrialPlanned" }, args.options);
    }
  }
  return current;
}

export async function applyTrialPlanHooksAsync<TTrial, TBlock = unknown>(
  args: ApplyTrialPlanHooksArgs<TTrial, TBlock>,
): Promise<TTrial> {
  const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "plan_hook" });
  if (hooks.length === 0) return args.trial;
  const state = args.state ?? createHookStateStore();
  let current = args.trial;
  for (const hook of hooks) {
    try {
      const next = await hook.onTrialPlanned?.({
        ...args.context,
        trial: current,
        hookId: hook.id,
        state,
      });
      if (next !== undefined) current = next;
    } catch (error) {
      handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "onTrialPlanned" }, args.options);
    }
  }
  return current;
}

function isApplyTrialPlanHooksArgs<TTrial, TBlock = unknown>(
  value: TTrial | ApplyTrialPlanHooksArgs<TTrial, TBlock>,
): value is ApplyTrialPlanHooksArgs<TTrial, TBlock> {
  if (!value || typeof value !== "object") return false;
  return "trial" in (value as Record<string, unknown>) && "context" in (value as Record<string, unknown>);
}
