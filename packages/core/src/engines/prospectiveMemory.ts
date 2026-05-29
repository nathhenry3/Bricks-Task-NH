import { SeededRandom } from "../infrastructure/random";

export interface ProspectiveMemoryScheduleConfig {
  count: number;
  minSeparation: number;
  maxSeparation: number;
}

export interface ProspectiveMemoryCueContext {
  category?: string | null;
  stimulusText?: string | null;
  stimulusColor?: string | null;
  flags?: Record<string, unknown>;
}

export type ProspectiveMemoryCueRule =
  | { type: "category_in"; categories: string[]; responseKey: string; id?: string }
  | { type: "text_starts_with"; prefixes: string[]; responseKey: string; caseSensitive?: boolean; id?: string }
  | { type: "stimulus_color"; colors: string[]; responseKey: string; caseSensitive?: boolean; id?: string }
  | { type: "flag_equals"; flag: string; value: string | number | boolean | null; responseKey: string; id?: string };

export interface ProspectiveMemoryCueMatch {
  matched: boolean;
  responseKey: string | null;
  ruleId: string | null;
}

export function generateProspectiveMemoryPositions(
  rng: SeededRandom,
  nTrials: number,
  schedule: ProspectiveMemoryScheduleConfig,
  eligibleIndices?: Set<number>,
): number[] {
  const nPm = Math.max(0, Math.floor(schedule.count));
  const minSep = Math.max(1, Math.floor(schedule.minSeparation));
  const maxSep = Math.max(minSep, Math.floor(schedule.maxSeparation));
  if (nPm <= 0) return [];

  const failedStates = new Set<string>();

  const search = (step: number, lastPos: number): number[] | null => {
    if (step >= nPm) return [];
    const stateKey = `${step}|${lastPos}`;
    if (failedStates.has(stateKey)) return null;

    const remaining = nPm - step - 1;
    const minPos = lastPos + minSep;
    const latestByMaxGap = lastPos + maxSep;
    const latestByRemaining = nTrials - 1 - remaining * minSep;
    const maxPos = Math.min(latestByMaxGap, latestByRemaining);

    if (minPos > maxPos) {
      failedStates.add(stateKey);
      return null;
    }

    const possiblePos: number[] = [];
    for (let p = minPos; p <= maxPos; p += 1) {
      if (!eligibleIndices || eligibleIndices.has(p)) {
        possiblePos.push(p);
      }
    }
    if (possiblePos.length === 0) {
      failedStates.add(stateKey);
      return null;
    }

    rng.shuffle(possiblePos);
    for (const pos of possiblePos) {
      const remainder = search(step + 1, pos);
      if (remainder) {
        return [pos, ...remainder];
      }
    }

    failedStates.add(stateKey);
    return null;
  };

  // Match legacy PM semantics: first PM is constrained by minSeparation from trial 0.
  const placements = search(0, 0);
  if (!placements) {
    throw new Error(
      `Cannot place PM trials: spacing/eligibility constraints impossible (count=${nPm}, minSep=${minSep}, maxSep=${maxSep}, nTrials=${nTrials}).`,
    );
  }
  return placements;
}

export function resolveProspectiveMemoryCueMatch(
  context: ProspectiveMemoryCueContext,
  rules: ProspectiveMemoryCueRule[],
): ProspectiveMemoryCueMatch {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (matchesRule(context, rule)) {
      return {
        matched: true,
        responseKey: rule.responseKey,
        ruleId: rule.id ?? `rule_${i + 1}`,
      };
    }
  }
  return { matched: false, responseKey: null, ruleId: null };
}

function normalizeToken(value: unknown, caseSensitive: boolean): string {
  const token = String(value ?? "");
  return caseSensitive ? token : token.toLowerCase();
}

function matchesRule(context: ProspectiveMemoryCueContext, rule: ProspectiveMemoryCueRule): boolean {
  if (rule.type === "category_in") {
    const value = normalizeToken(context.category ?? "", false);
    if (!value) return false;
    const allowed = new Set(rule.categories.map((entry) => normalizeToken(entry, false)));
    return allowed.has(value);
  }
  if (rule.type === "text_starts_with") {
    const caseSensitive = rule.caseSensitive === true;
    const text = normalizeToken(context.stimulusText ?? "", caseSensitive);
    if (!text) return false;
    return rule.prefixes.some((prefix) => text.startsWith(normalizeToken(prefix, caseSensitive)));
  }
  if (rule.type === "stimulus_color") {
    const caseSensitive = rule.caseSensitive === true;
    const color = normalizeToken(context.stimulusColor ?? "", caseSensitive);
    if (!color) return false;
    const allowed = new Set(rule.colors.map((entry) => normalizeToken(entry, caseSensitive)));
    return allowed.has(color);
  }
  const actual = context.flags?.[rule.flag];
  return actual === rule.value;
}
