import { DrtController, type ScopedDrtConfig } from "../engines/drt";
import { OnlineParameterTransformRunner } from "../engines/parameterTransforms";
import { hashSeed } from "../infrastructure/random";
import type { TaskModuleContext, TaskModuleResult, TaskModuleRunner } from "../api/taskModule";

export interface StartDrtModuleScopeArgs {
  runner: TaskModuleRunner;
  drtConfig: ScopedDrtConfig;
  scope: "block" | "trial";
  blockIndex: number;
  trialIndex: number | null;
  participantId: string;
  sessionId: string;
  configPath: string;
  taskSeedKey: string;
  seedSuffix?: string;
  onControllerCreated?: (controller: DrtController) => void;
  context: Pick<TaskModuleContext, "displayElement" | "borderTargetElement" | "borderTargetRect">;
}

const sessionTransformRunners = new Map<string, OnlineParameterTransformRunner>();

export function startDrtModuleScope(args: StartDrtModuleScopeArgs): void {
  if (!args.drtConfig.enabled) return;
  const sessionTransformRunnerKey =
    args.drtConfig.transformPersistence === "session" && Array.isArray(args.drtConfig.parameterTransforms)
      ? [
          args.participantId,
          args.sessionId,
          args.configPath,
          args.taskSeedKey,
          JSON.stringify(args.drtConfig.parameterTransforms),
        ].join("::")
      : null;
  const sessionTransformRunner = sessionTransformRunnerKey
    ? sessionTransformRunners.get(sessionTransformRunnerKey) ??
      (() => {
        const created = new OnlineParameterTransformRunner(args.drtConfig.parameterTransforms ?? []);
        sessionTransformRunners.set(sessionTransformRunnerKey, created);
        return created;
      })()
    : null;
  args.runner.start({
    module: DrtController.asTaskModule({
      ...args.drtConfig,
      ...(args.onControllerCreated ? { onControllerCreated: args.onControllerCreated } : {}),
      ...(sessionTransformRunner ? { transformRunner: sessionTransformRunner } : {}),
      seed: hashSeed(
        args.participantId,
        args.sessionId,
        args.configPath,
        args.taskSeedKey,
        args.seedSuffix ?? `B${args.blockIndex}${args.trialIndex !== null ? `T${args.trialIndex}` : ""}`,
      ),
    }),
    address: { scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex },
    config: args.drtConfig,
    context: args.context,
  });
}

export function stopModuleScope(args: {
  runner: TaskModuleRunner;
  scope: "block" | "trial";
  blockIndex: number;
  trialIndex: number | null;
}): TaskModuleResult | undefined {
  return args.runner.stop({ scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex });
}
