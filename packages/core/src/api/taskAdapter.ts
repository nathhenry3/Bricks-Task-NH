import { ConfigurationManager } from "../infrastructure/config";
import { createEventLogger } from "../infrastructure/events";
import { createVariableResolver } from "../infrastructure/variables";
import { TaskModuleRunner } from "./taskModule";
import { DrtModule } from "../engines/drt";
import type { TaskManifest, TaskAdapterContext, JSONObject } from "./types";

/**
 * A standardized interface for a task adapter.
 */
export interface TaskAdapter {
  /**
   * Returns metadata about the task and its variants.
   */
  readonly manifest: TaskManifest;

  /**
   * Called to set up the task before execution (e.g., parse configuration, initialize resources).
   */
  initialize?(context: TaskAdapterContext): Promise<void>;

  /**
   * Called to execute the main task logic.
   * Returns the final data or results from the task run.
   */
  execute?(): Promise<unknown>;

  /**
   * Called after execution, even if it failed, to clean up resources (e.g., stop timers, clear global listeners).
   */
  terminate?(): Promise<void>;

  /**
   * LEGACY: The old launch method. Will be removed once all tasks are migrated.
   */
  launch?(context: TaskAdapterContext): Promise<void>;
}

export interface CreateTaskAdapterOptions {
  manifest: TaskManifest;
  run: (context: TaskAdapterContext) => Promise<unknown> | unknown;
  initialize?: (context: TaskAdapterContext) => Promise<void> | void;
  terminate?: (context: TaskAdapterContext) => Promise<void> | void;
}

/**
 * Builds a standard TaskAdapter without requiring per-task wrapper classes.
 * The returned adapter stores lifecycle context internally and executes `run(context)`.
 */
export function createTaskAdapter(options: CreateTaskAdapterOptions): TaskAdapter {
  let context: TaskAdapterContext | null = null;

  return {
    manifest: options.manifest,
    async initialize(nextContext: TaskAdapterContext): Promise<void> {
      context = nextContext;
      if (options.initialize) await options.initialize(nextContext);
    },
    async execute(): Promise<unknown> {
      if (!context) {
        throw new Error(`Task adapter for ${options.manifest.taskId} was not initialized.`);
      }
      return options.run(context);
    },
    async terminate(): Promise<void> {
      if (!context) return;
      try {
        if (options.terminate) await options.terminate(context);
      } finally {
        context = null;
      }
    },
  };
}

/**
 * Manages the full lifecycle of a task adapter.
 */
export class LifecycleManager {
  constructor(private adapter: TaskAdapter) {}

  /**
   * Executes the full task lifecycle: initialize, execute, terminate.
   * If the adapter only has the legacy 'launch' method, it will use that.
   */
  async run(context: Omit<TaskAdapterContext, "resolver" | "rawTaskConfig" | "moduleRunner" | "eventLogger">): Promise<unknown> {
    // Standardize VariableResolver instantiation using SelectionContext
    const taskConfig = context.taskConfig ?? {};
    const taskVariables = (taskConfig.task as JSONObject)?.variables as JSONObject;
    const topVariables = taskConfig.variables as JSONObject;
    const variables = {
      ...(taskVariables ?? {}),
      ...(topVariables ?? {}),
    };

    const namespaces: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(taskConfig)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        namespaces[key] = value as Record<string, unknown>;
      }
    }

    const commonResolverArgs = {
      variables,
      namespaces,
      seedParts: [
        context.selection.participant.participantId,
        context.selection.participant.sessionId,
        context.selection.configPath ?? "",
        "high_level_resolution",
      ],
    };

    // 1. High-level resolver: used for initial configuration resolution (e.g., basePaths, titles).
    // Specifically restricted to participant scope.
    const highLevelResolver = createVariableResolver({
      ...commonResolverArgs,
      allowedScopes: ["participant"],
    });

    // 2. Full resolver: for the task adapter to handle block and trial scopes
    const taskResolver = createVariableResolver(commonResolverArgs);

    // Resolve configuration metadata (static parts only)
    const configManager = new ConfigurationManager();
    configManager.validateLegacyKeys(taskConfig);

    const resolvedConfig = { ...taskConfig };
    for (const field of Object.keys(resolvedConfig)) {
      if (field === "variables" || field === "task") continue;
      resolvedConfig[field] = highLevelResolver.resolveInValue(resolvedConfig[field]);
    }

    // Initialize module runner with standard core modules
    const moduleRunner = new TaskModuleRunner([
      new DrtModule(),
    ]);

    const eventLogger = createEventLogger(context.selection);

    const resolvedContext: TaskAdapterContext = {
      ...context,
      taskConfig: resolvedConfig,
      rawTaskConfig: taskConfig,
      resolver: taskResolver,
      moduleRunner,
      eventLogger,
    };

    moduleRunner.initialize();

    try {
      if (this.adapter.initialize) {
        await this.adapter.initialize(resolvedContext);
      }
      
      let result: unknown;
      if (this.adapter.execute) {
        result = await this.adapter.execute();
      } else if (this.adapter.launch) {
        // Fallback for legacy adapters
        result = await this.adapter.launch(resolvedContext);
      } else {
        throw new Error(`Task adapter for ${this.adapter.manifest.taskId} does not have an execute or launch method.`);
      }
      
      return result;
    } finally {
      moduleRunner.terminate();
      if (this.adapter.terminate) {
        await this.adapter.terminate();
      }

      // Centralized cursor restoration for all tasks
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("exp-cursor-hidden");
      }
    }
  }
}
