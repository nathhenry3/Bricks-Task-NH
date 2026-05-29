import { nextSecureFloat } from "../infrastructure/random";
import type { RNG } from "../infrastructure/scheduler";

export interface ConditionFactor {
  name: string;
  levels: Array<string | number>;
}

export interface ConditionCell {
  id: string;
  levels: Record<string, string>;
}

export interface ConditionAdjacencyRules {
  maxRunLengthByFactor?: Record<string, number>;
  maxRunLengthByCell?: number;
  noImmediateRepeatFactors?: string[];
}

export interface BuildConditionSequenceArgs {
  factors: ConditionFactor[];
  trialCount: number;
  rng?: RNG;
  cellWeights?: Record<string, number>;
  adjacency?: ConditionAdjacencyRules;
  maxAttempts?: number;
}

const defaultRng: RNG = {
  next: nextSecureFloat,
};

const asFinitePositive = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
};

function normalizeLevel(value: string | number): string {
  return String(value).trim();
}

function shuffleInPlace<T>(items: T[], rng: RNG): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function computeQuotaCounts(weights: number[], totalCount: number): number[] {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += weights[i];
  }
  if (!(sum > 0) || totalCount <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (weight / sum) * totalCount);
  const base = raw.map((value) => Math.floor(value));
  let assigned = 0;
  for (let i = 0; i < base.length; i += 1) {
    assigned += base[i];
  }

  if (assigned < totalCount) {
    const ranked = raw
      .map((value, index) => ({ index, remainder: value - base[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    let cursor = 0;
    while (assigned < totalCount) {
      const next = ranked[cursor % ranked.length];
      base[next.index] += 1;
      assigned += 1;
      cursor += 1;
    }
  }
  return base;
}

export function createConditionCellId(levels: Record<string, string>): string {
  const pairs = Object.entries(levels).sort(([a], [b]) => a.localeCompare(b));
  return pairs.map(([key, value]) => `${key}=${value}`).join("|");
}

export function enumerateConditionCells(factors: ConditionFactor[]): ConditionCell[] {
  const normalized = factors.map((factor) => ({
    name: String(factor.name || "").trim(),
    levels: (factor.levels ?? []).map(normalizeLevel).filter(Boolean),
  }));

  for (const factor of normalized) {
    if (!factor.name) throw new Error("Condition factor name cannot be empty.");
    if (factor.levels.length === 0) {
      throw new Error(`Condition factor '${factor.name}' has no levels.`);
    }
  }

  const cells: ConditionCell[] = [];

  const walk = (index: number, current: Record<string, string>) => {
    if (index >= normalized.length) {
      const levels = { ...current };
      cells.push({ id: createConditionCellId(levels), levels });
      return;
    }
    const factor = normalized[index];
    for (const level of factor.levels) {
      current[factor.name] = level;
      walk(index + 1, current);
    }
  };

  walk(0, {});
  return cells;
}

function violatesAdjacency(sequence: ConditionCell[], candidate: ConditionCell, rules?: ConditionAdjacencyRules): boolean {
  if (!rules || sequence.length === 0) return false;
  const prev = sequence[sequence.length - 1];

  if (Array.isArray(rules.noImmediateRepeatFactors)) {
    for (const factorName of rules.noImmediateRepeatFactors) {
      const prevValue = prev.levels[factorName];
      const nextValue = candidate.levels[factorName];
      if (prevValue && nextValue && prevValue === nextValue) return true;
    }
  }

  if (rules.maxRunLengthByCell && rules.maxRunLengthByCell > 0) {
    let runLength = 1;
    for (let i = sequence.length - 1; i >= 0; i -= 1) {
      if (sequence[i].id !== candidate.id) break;
      runLength += 1;
      if (runLength > rules.maxRunLengthByCell) return true;
    }
  }

  if (rules.maxRunLengthByFactor) {
    for (const [factorName, maxRun] of Object.entries(rules.maxRunLengthByFactor)) {
      const limit = asFinitePositive(maxRun, 0);
      if (limit <= 0) continue;
      const nextValue = candidate.levels[factorName];
      if (!nextValue) continue;
      let runLength = 1;
      for (let i = sequence.length - 1; i >= 0; i -= 1) {
        if (sequence[i].levels[factorName] !== nextValue) break;
        runLength += 1;
        if (runLength > limit) return true;
      }
    }
  }

  return false;
}

function buildCandidatePool(cells: ConditionCell[], counts: number[]): ConditionCell[] {
  const output: ConditionCell[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const n = Math.max(0, Math.floor(counts[i] ?? 0));
    for (let j = 0; j < n; j += 1) output.push(cells[i]);
  }
  return output;
}

export function buildConditionSequence(args: BuildConditionSequenceArgs): ConditionCell[] {
  const rng = args.rng ?? defaultRng;
  const trialCount = asFinitePositive(args.trialCount, 1);
  const maxAttempts = asFinitePositive(args.maxAttempts, 300);
  const cells = enumerateConditionCells(args.factors);
  if (cells.length === 0) return [];

  const weights = cells.map((cell) => {
    const raw = args.cellWeights?.[cell.id];
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  });
  const counts = computeQuotaCounts(weights, trialCount);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pool = shuffleInPlace(buildCandidatePool(cells, counts), rng);
    const sequence: ConditionCell[] = [];
    while (pool.length > 0) {
      const idx = pool.findIndex((cell) => !violatesAdjacency(sequence, cell, args.adjacency));
      if (idx < 0) break;

      // ⚡ Bolt: O(1) swap-and-pop technique instead of O(N) Array.prototype.splice
      // Since `pool` is a shuffled bag of items, order doesn't matter.
      // We can safely move the last item to the current index and pop the array,
      // avoiding the expensive memory shift of all subsequent elements.
      const picked = pool[idx];
      pool[idx] = pool[pool.length - 1];
      pool.pop();

      if (picked) sequence.push(picked);
    }
    if (sequence.length === trialCount) return sequence;
  }

  throw new Error("Failed to build condition sequence that satisfies adjacency constraints.");
}
