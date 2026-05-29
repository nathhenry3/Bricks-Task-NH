import { normalizeKey } from "../infrastructure/keys";
import { runTrialTimeline, type TrialTimelineResult, type TrialStage, type TrialResponseSpec } from "./trial";

export interface RtTiming {
  trialDurationMs: number;
  fixationOnsetMs?: number;
  fixationDurationMs: number;
  stimulusOnsetMs: number;
  stimulusDurationMs?: number | null;
  responseWindowStartMs: number;
  responseWindowEndMs: number;
}

export interface RtPhaseDurations {
  trialDurationMs: number;
  fixationMs: number;
  blankMs: number;
  preResponseStimulusMs: number;
  responsePreStimulusBlankMs: number;
  responseStimulusMs: number;
  responsePostStimulusBlankMs: number;
  responseBlankMs: number;
  responseMs: number;
  postResponseStimulusMs: number;
  postResponseBlankMs: number;
  preFixationBlankMs: number;
  responseStartMs: number;
  responseEndMs: number;
  stimulusStartMs: number;
  stimulusEndMs: number;
  fixationStartMs: number;
  fixationEndMs: number;
}

export interface RtPhaseOptions {
  responseTerminatesTrial?: boolean;
}

export interface ResolvedRtTaskConfig {
  enabled: boolean;
  timing: RtTiming;
  responseTerminatesTrial: boolean;
}

export interface ResolveRtTaskOptions {
  baseTiming: RtTiming;
  override?: unknown;
  defaultEnabled?: boolean;
  defaultResponseTerminatesTrial?: boolean;
}

export interface RunBasicRtTrialArgs {
  container: HTMLElement;
  timing: RtTiming;
  allowedKeys: string[];
  renderFixation?: () => void | string;
  renderBlank?: () => void | string;
  renderStimulus: () => void | string;
  responseTerminatesTrial?: boolean;
}

export interface BasicRtTrialResult {
  key: string | null;
  rtMs: number | null;
  timings: RtPhaseDurations;
  timeline: TrialTimelineResult;
}

const toNonNegative = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, fallback);
  return Math.max(0, numeric);
};

const toPositive = (value: unknown, fallback = 1): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(1, fallback);
  return numeric;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const hasOwn = (obj: Record<string, unknown> | null, key: string): boolean =>
  Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

const RT_FAST_URL_KEYS = ["rt_fast_ms", "rtFastMs"] as const;

function coercePositiveMs(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.round(numeric));
}

function resolveRtFastModeMsFromUrl(): number | null {
  if (typeof window === "undefined") return null;

  const fromParams = (params: URLSearchParams): number | null => {
    for (const key of RT_FAST_URL_KEYS) {
      const raw = params.get(key);
      if (raw == null || raw.trim().length === 0) continue;
      const parsed = coercePositiveMs(raw);
      if (parsed != null) return parsed;
    }
    return null;
  };

  const fromLocation = fromParams(new URLSearchParams(window.location.search));
  if (fromLocation != null) return fromLocation;

  const jatosParamsRaw = (window as unknown as { jatos?: { urlQueryParameters?: unknown } }).jatos?.urlQueryParameters;
  if (!jatosParamsRaw) return null;
  if (jatosParamsRaw instanceof URLSearchParams) return fromParams(jatosParamsRaw);
  if (typeof jatosParamsRaw === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(jatosParamsRaw as Record<string, unknown>)) {
      if (value == null) continue;
      params.set(key, String(value));
    }
    return fromParams(params);
  }
  return null;
}

function resolveRtTiming(
  raw: Record<string, unknown> | null,
  fallback: RtTiming,
): RtTiming {
  const trialDurationMs = toPositive(raw?.trialDurationMs, fallback.trialDurationMs);
  const stimulusOnsetMs = toNonNegative(raw?.stimulusOnsetMs, fallback.stimulusOnsetMs);
  return {
    trialDurationMs,
    fixationOnsetMs: toNonNegative(raw?.fixationOnsetMs, fallback.fixationOnsetMs ?? 0),
    fixationDurationMs: toNonNegative(raw?.fixationDurationMs, fallback.fixationDurationMs),
    stimulusOnsetMs,
    stimulusDurationMs: toNonNegative(
      raw?.stimulusDurationMs,
      (fallback.stimulusDurationMs ?? Math.max(0, trialDurationMs - stimulusOnsetMs)),
    ),
    responseWindowStartMs: toNonNegative(raw?.responseWindowStartMs, fallback.responseWindowStartMs),
    responseWindowEndMs: toNonNegative(raw?.responseWindowEndMs, fallback.responseWindowEndMs),
  };
}

export function resolveRtTaskConfig(options: ResolveRtTaskOptions): ResolvedRtTaskConfig {
  const { baseTiming, override, defaultEnabled = false, defaultResponseTerminatesTrial = false } = options;
  const raw = asObject(override);
  const fastModeMs = resolveRtFastModeMsFromUrl();
  const resolvedTiming = resolveRtTiming(asObject(raw?.timing), baseTiming);
  const timing = fastModeMs == null
    ? resolvedTiming
    : {
      // Use a compressed but valid schedule (non-zero response window).
      trialDurationMs: fastModeMs * 5,
      fixationOnsetMs: 0,
      fixationDurationMs: fastModeMs,
      stimulusOnsetMs: fastModeMs * 2,
      stimulusDurationMs: fastModeMs * 2,
      responseWindowStartMs: fastModeMs * 2,
      responseWindowEndMs: fastModeMs * 4,
    };
  return {
    enabled: hasOwn(raw, "enabled") ? raw!.enabled !== false : defaultEnabled,
    timing,
    responseTerminatesTrial: hasOwn(raw, "responseTerminatesTrial")
      ? raw!.responseTerminatesTrial === true
      : defaultResponseTerminatesTrial,
  };
}

export function mergeRtTaskConfig(
  base: ResolvedRtTaskConfig,
  override?: unknown,
): ResolvedRtTaskConfig {
  return resolveRtTaskConfig({
    baseTiming: base.timing,
    override,
    defaultEnabled: base.enabled,
    defaultResponseTerminatesTrial: base.responseTerminatesTrial,
  });
}

export function computeRtPhaseDurations(timing: RtTiming, options: RtPhaseOptions = {}): RtPhaseDurations {
  const trialDurationMs = toPositive(timing.trialDurationMs, 5000);
  const fixationStart = Math.min(trialDurationMs, toNonNegative(timing.fixationOnsetMs, 0));
  const fixationEnd = Math.min(trialDurationMs, fixationStart + toNonNegative(timing.fixationDurationMs, 500));
  const stimulusStartMs = Math.min(trialDurationMs, toNonNegative(timing.stimulusOnsetMs, 1000));
  const stimulusDurationRaw = timing.stimulusDurationMs;
  const stimulusDurationMs =
    stimulusDurationRaw == null ? null : toNonNegative(stimulusDurationRaw, trialDurationMs - stimulusStartMs);
  const stimulusEndMs = stimulusDurationMs == null
    ? trialDurationMs
    : Math.min(trialDurationMs, stimulusStartMs + stimulusDurationMs);
  const responseStartMs = Math.min(trialDurationMs, toNonNegative(timing.responseWindowStartMs, stimulusStartMs));
  const responseEndMs = Math.max(
    responseStartMs,
    Math.min(trialDurationMs, toNonNegative(timing.responseWindowEndMs, trialDurationMs)),
  );

  const fixationMs = Math.max(0, fixationEnd - fixationStart);
  const preFixationBlankMs = Math.max(0, fixationStart);
  const blankMs = Math.max(0, stimulusStartMs - fixationEnd);
  const preResponseStimulusMs = Math.max(
    0,
    Math.min(responseStartMs, stimulusEndMs) - stimulusStartMs,
  );
  const responseMs = Math.max(0, responseEndMs - responseStartMs);
  const responsePreStimulusBlankMs = Math.max(
    0,
    Math.min(responseEndMs, stimulusStartMs) - responseStartMs,
  );
  const responseStimulusMs = Math.max(
    0,
    Math.min(responseEndMs, stimulusEndMs) - Math.max(responseStartMs, stimulusStartMs),
  );
  const responsePostStimulusBlankMs = Math.max(
    0,
    responseEndMs - Math.max(responseStartMs, stimulusEndMs),
  );
  const responseBlankMs = responsePreStimulusBlankMs + responsePostStimulusBlankMs;

  const rawPostResponseStimulusMs = Math.max(0, Math.min(trialDurationMs, stimulusEndMs) - responseEndMs);
  const rawPostResponseBlankMs = Math.max(0, trialDurationMs - responseEndMs - rawPostResponseStimulusMs);
  const postResponseStimulusMs = options.responseTerminatesTrial ? 0 : rawPostResponseStimulusMs;
  const postResponseBlankMs = options.responseTerminatesTrial ? 0 : rawPostResponseBlankMs;

  return {
    trialDurationMs,
    fixationMs,
    blankMs,
    preResponseStimulusMs,
    responsePreStimulusBlankMs,
    responseStimulusMs,
    responsePostStimulusBlankMs,
    responseBlankMs,
    responseMs,
    postResponseStimulusMs,
    postResponseBlankMs,
    preFixationBlankMs,
    responseStartMs,
    responseEndMs,
    stimulusStartMs,
    stimulusEndMs,
    fixationStartMs: fixationStart,
    fixationEndMs: fixationEnd,
  };
}

export interface MultiPhaseTrialResult {
  key: string | null;
  rtMs: number | null;
  timeline: TrialTimelineResult;
}

export interface RunCustomRtTrialArgs {
  container: HTMLElement;
  stages: TrialStage[];
  response: TrialResponseSpec;
}

export async function runCustomRtTrial(args: RunCustomRtTrialArgs): Promise<MultiPhaseTrialResult> {
  const timeline = await runTrialTimeline({
    container: args.container,
    stages: args.stages,
    response: {
      allowedKeys: (args.response.allowedKeys ?? []).map((entry) => normalizeKey(entry)).filter(Boolean),
      startMs: args.response.startMs,
      endMs: args.response.endMs,
    },
  });

  return {
    key: timeline.key ? normalizeKey(timeline.key) : null,
    rtMs: timeline.rtMs,
    timeline,
  };
}

export async function runBasicRtTrial(args: RunBasicRtTrialArgs): Promise<BasicRtTrialResult> {
  const timings = computeRtPhaseDurations(args.timing, {
    responseTerminatesTrial: args.responseTerminatesTrial,
  });
  
  const result = await runCustomRtTrial({
    container: args.container,
    stages: [
      {
        id: "pre_fixation_blank",
        durationMs: timings.preFixationBlankMs,
        render: args.renderBlank,
      },
      {
        id: "fixation",
        durationMs: timings.fixationMs,
        render: args.renderFixation,
      },
      {
        id: "blank",
        durationMs: timings.blankMs,
        render: args.renderBlank,
      },
      {
        id: "stimulus",
        durationMs:
          timings.preResponseStimulusMs + timings.responseStimulusMs + timings.postResponseStimulusMs,
        render: args.renderStimulus,
      },
      {
        id: "post_stimulus_blank",
        durationMs: timings.responseBlankMs + timings.postResponseBlankMs,
        render: args.renderBlank,
      },
    ],
    response: {
      allowedKeys: args.allowedKeys,
      startMs: timings.responseStartMs,
      endMs: timings.responseEndMs,
    },
  });

  return {
    key: result.key,
    rtMs: result.rtMs,
    timings,
    timeline: result.timeline,
  };
}
