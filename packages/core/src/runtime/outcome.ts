export interface CorrectnessResult {
  correct: 0 | 1;
  expectedCategory?: string | null;
  subtaskCorrect?: Record<string, 0 | 1>;
}

export interface CorrectnessContext {
  responseCategory: string;
  stimulusCategory?: string | null;
  expectedCategory?: string | null;
  rt: number;
  meta?: Record<string, unknown>;
}

export type CorrectnessEvaluator = (
  context: CorrectnessContext,
) => CorrectnessResult | boolean | number;

export interface EvaluateTrialOutcomeArgs {
  responseCategory: string;
  rt: number | null;
  stimulusCategory?: string | null;
  expectedCategory?: string | null;
  meta?: Record<string, unknown>;
  evaluator?: CorrectnessEvaluator;
}

export interface TrialOutcome {
  responseCategory: string;
  rt: number;
  correct: 0 | 1;
  expectedCategory?: string | null;
  subtaskCorrect?: Record<string, 0 | 1>;
}

export function evaluateTrialOutcome(args: EvaluateTrialOutcomeArgs): TrialOutcome {
  const responseCategory = String(args.responseCategory || "");
  const rt = typeof args.rt === "number" && Number.isFinite(args.rt) ? args.rt : -1;
  const expectedCategory = args.expectedCategory ?? args.stimulusCategory ?? null;

  const context: CorrectnessContext = {
    responseCategory,
    stimulusCategory: args.stimulusCategory ?? null,
    expectedCategory,
    rt,
    meta: args.meta,
  };

  const raw = args.evaluator ? args.evaluator(context) : defaultCorrectnessEvaluator(context);
  const normalized = normalizeCorrectnessResult(raw, expectedCategory);

  return {
    responseCategory,
    rt,
    correct: normalized.correct,
    expectedCategory: normalized.expectedCategory ?? expectedCategory,
    subtaskCorrect: normalized.subtaskCorrect,
  };
}

function defaultCorrectnessEvaluator(context: CorrectnessContext): CorrectnessResult {
  if (!context.expectedCategory) return { correct: 0, expectedCategory: null };
  return {
    correct: context.responseCategory === context.expectedCategory ? 1 : 0,
    expectedCategory: context.expectedCategory,
  };
}

function normalizeCorrectnessResult(
  value: CorrectnessResult | boolean | number,
  fallbackExpectedCategory: string | null,
): CorrectnessResult {
  if (typeof value === "boolean") {
    return { correct: value ? 1 : 0, expectedCategory: fallbackExpectedCategory };
  }
  if (typeof value === "number") {
    return { correct: value ? 1 : 0, expectedCategory: fallbackExpectedCategory };
  }
  return {
    correct: value.correct ? 1 : 0,
    expectedCategory: value.expectedCategory ?? fallbackExpectedCategory,
    subtaskCorrect: value.subtaskCorrect,
  };
}
