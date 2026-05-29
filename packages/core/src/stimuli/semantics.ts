import {
  fetchTextNoStore,
  parseCsvColumn,
  resolveAssetPath,
  resolveTemplatedString,
  splitCsvLine,
  type TemplateResolveArgs,
} from "./stimulus";

export interface CsvDictionarySpec {
  path: string;
  keyColumn: string;
  valueColumn: string;
  basePath?: string;
  resolverArgs?: Omit<TemplateResolveArgs, "template">;
}

export interface SemanticIndexOptions {
  normalize?: (value: string) => string;
  onConflict?: "first_wins" | "last_wins" | "error";
}

export interface SemanticResolver {
  resolve(term: string): string | null;
  has(term: string): boolean;
}

const defaultNormalize = (value: string): string => String(value || "").trim().toLowerCase();

function ensureUniqueOrResolve(
  map: Map<string, string>,
  key: string,
  value: string,
  mode: "first_wins" | "last_wins" | "error",
): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, value);
    return;
  }
  if (existing === value) return;
  if (mode === "first_wins") return;
  if (mode === "last_wins") {
    map.set(key, value);
    return;
  }
  throw new Error(`Semantic index conflict for key '${key}': '${existing}' vs '${value}'.`);
}

export function parseCsvDictionary(
  csvText: string,
  keyColumn: string,
  valueColumn: string,
  options: SemanticIndexOptions = {},
): Map<string, string> {
  const normalize = options.normalize ?? defaultNormalize;
  const onConflict = options.onConflict ?? "error";
  const lines = csvText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return new Map();

  const header = splitCsvLine(lines[0]).map((entry) => entry.trim());
  const keyIdx = header.findIndex((entry) => normalize(entry) === normalize(keyColumn));
  const valueIdx = header.findIndex((entry) => normalize(entry) === normalize(valueColumn));
  if (keyIdx < 0 || valueIdx < 0) {
    throw new Error(`CSV dictionary missing required columns '${keyColumn}' and/or '${valueColumn}'.`);
  }

  const out = new Map<string, string>();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const rawKey = cols[keyIdx] ?? "";
    const rawValue = cols[valueIdx] ?? "";
    const key = normalize(rawKey);
    const value = String(rawValue || "").trim();
    if (!key || !value) continue;
    ensureUniqueOrResolve(out, key, value, onConflict);
  }
  return out;
}

export async function loadCsvDictionary(spec: CsvDictionarySpec): Promise<Map<string, string>> {
  const resolverArgs = spec.resolverArgs ?? {};
  const path = resolveTemplatedString({
    ...resolverArgs,
    template: spec.path,
  });
  const keyColumn = resolveTemplatedString({
    ...resolverArgs,
    template: spec.keyColumn,
  });
  const valueColumn = resolveTemplatedString({
    ...resolverArgs,
    template: spec.valueColumn,
  });
  const url = resolveAssetPath({
    basePath: spec.basePath,
    template: path,
    ...(resolverArgs.vars ? { vars: resolverArgs.vars } : {}),
    ...(resolverArgs.resolver ? { resolver: resolverArgs.resolver } : {}),
    ...(resolverArgs.context ? { context: resolverArgs.context } : {}),
  });
  const text = await fetchTextNoStore(url);
  return parseCsvDictionary(text, keyColumn, valueColumn);
}

export function buildSemanticIndex(
  labelsToTerms: Record<string, string[]>,
  options: SemanticIndexOptions = {},
): Map<string, string> {
  const normalize = options.normalize ?? defaultNormalize;
  const onConflict = options.onConflict ?? "error";
  const out = new Map<string, string>();

  for (const [label, terms] of Object.entries(labelsToTerms ?? {})) {
    const normalizedLabel = String(label || "").trim();
    if (!normalizedLabel) continue;
    for (const termLike of terms ?? []) {
      const key = normalize(String(termLike || ""));
      if (!key) continue;
      ensureUniqueOrResolve(out, key, normalizedLabel, onConflict);
    }
  }
  return out;
}

export function createSemanticResolver(
  indexLike: Map<string, string> | Record<string, string>,
  options: Pick<SemanticIndexOptions, "normalize"> = {},
): SemanticResolver {
  const normalize = options.normalize ?? defaultNormalize;
  const index =
    indexLike instanceof Map
      ? new Map(indexLike)
      : new Map(
          Object.entries(indexLike ?? {}).map(([key, value]) => [
            normalize(key),
            String(value || "").trim(),
          ]),
        );

  return {
    resolve(term: string): string | null {
      const key = normalize(term);
      if (!key) return null;
      return index.get(key) ?? null;
    },
    has(term: string): boolean {
      const key = normalize(term);
      if (!key) return false;
      return index.has(key);
    },
  };
}

export async function loadSemanticIndexFromCsvColumns(
  csvPath: string,
  keyColumn: string,
  labelColumns: Record<string, string>,
  args: Omit<CsvDictionarySpec, "path" | "keyColumn" | "valueColumn"> = {},
): Promise<Map<string, string>> {
  const merged = new Map<string, string>();
  for (const [label, valueColumn] of Object.entries(labelColumns)) {
    const dictionary = await loadCsvDictionary({
      ...args,
      path: csvPath,
      keyColumn,
      valueColumn,
    });
    for (const [key, rawValue] of dictionary.entries()) {
      const truthy = String(rawValue || "").trim();
      if (!truthy) continue;
      if (truthy === "0" || truthy.toLowerCase() === "false") continue;
      if (!merged.has(key)) {
        merged.set(key, label);
      }
    }
  }
  return merged;
}

export async function loadTokenListFromCsvColumn(
  path: string,
  column: string,
  args: Omit<CsvDictionarySpec, "path" | "keyColumn" | "valueColumn"> = {},
): Promise<string[]> {
  const resolverArgs = args.resolverArgs ?? {};
  const resolvedPath = resolveTemplatedString({ ...resolverArgs, template: path });
  const resolvedColumn = resolveTemplatedString({ ...resolverArgs, template: column });
  const url = resolveAssetPath({
    basePath: args.basePath,
    template: resolvedPath,
    ...(resolverArgs.vars ? { vars: resolverArgs.vars } : {}),
    ...(resolverArgs.resolver ? { resolver: resolverArgs.resolver } : {}),
    ...(resolverArgs.context ? { context: resolverArgs.context } : {}),
  });
  const text = await fetchTextNoStore(url);
  return parseCsvColumn(text, resolvedColumn);
}
