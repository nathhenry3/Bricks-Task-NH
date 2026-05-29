import { normalizeKey } from "../infrastructure/keys";

export interface ResponseSemanticsOptions {
  timeoutCategory?: string;
  invalidCategory?: string;
  duplicateKeyPolicy?: "error" | "first_wins" | "last_wins";
}

export interface ResponseSemantics {
  categories(): string[];
  categoriesWithMeta(): string[];
  allowedKeys(categories?: string[]): string[];
  responseCategoryFromKey(key: string | null | undefined): string;
  expectedCategoryFromKey(key: string | null | undefined, fallbackCategory?: string): string;
  expectedCategoryFromSpec(spec: string | null | undefined, fallbackCategory?: string): string;
  keyForCategory(category: string): string | null;
  hasCategory(category: string): boolean;
  hasResponseCategory(category: string): boolean;
}

type CategoryKeyMap = Record<string, string | string[]>;

const DEFAULT_TIMEOUT_CATEGORY = "timeout";
const DEFAULT_INVALID_CATEGORY = "invalid";

function normalizeCategory(value: string): string {
  return String(value || "").trim();
}

function normalizeKeys(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of values) {
    const normalized = normalizeKey(String(entry || ""));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function createResponseSemantics(
  categoryToKeys: CategoryKeyMap,
  options: ResponseSemanticsOptions = {},
): ResponseSemantics {
  const timeoutCategory = normalizeCategory(options.timeoutCategory ?? DEFAULT_TIMEOUT_CATEGORY);
  const invalidCategory = normalizeCategory(options.invalidCategory ?? DEFAULT_INVALID_CATEGORY);
  const duplicateKeyPolicy = options.duplicateKeyPolicy ?? "error";

  const orderedCategories: string[] = [];
  const categoryKeys = new Map<string, string[]>();
  const keyToCategory = new Map<string, string>();
  const categoryByLookup = new Map<string, string>();

  for (const [rawCategory, rawKeys] of Object.entries(categoryToKeys ?? {})) {
    const category = normalizeCategory(rawCategory);
    if (!category) continue;
    const keys = normalizeKeys(rawKeys);
    if (keys.length === 0) continue;
    orderedCategories.push(category);
    categoryKeys.set(category, keys);
    categoryByLookup.set(category.toLowerCase(), category);

    for (const key of keys) {
      const existing = keyToCategory.get(key);
      if (!existing) {
        keyToCategory.set(key, category);
        continue;
      }
      if (existing === category) continue;
      if (duplicateKeyPolicy === "first_wins") continue;
      if (duplicateKeyPolicy === "last_wins") {
        keyToCategory.set(key, category);
        continue;
      }
      throw new Error(
        `Response semantics conflict: key '${key}' is mapped to both '${existing}' and '${category}'.`,
      );
    }
  }

  if (orderedCategories.length === 0) {
    throw new Error("Response semantics invalid: no categories with keys were provided.");
  }

  const categorySet = new Set(orderedCategories);
  categoryByLookup.set(timeoutCategory.toLowerCase(), timeoutCategory);
  categoryByLookup.set(invalidCategory.toLowerCase(), invalidCategory);

  return {
    categories(): string[] {
      return [...orderedCategories];
    },
    categoriesWithMeta(): string[] {
      const out = [...orderedCategories];
      if (!out.includes(timeoutCategory)) out.push(timeoutCategory);
      if (!out.includes(invalidCategory)) out.push(invalidCategory);
      return out;
    },
    allowedKeys(categories?: string[]): string[] {
      const requested = Array.isArray(categories) && categories.length > 0
        ? categories.map(normalizeCategory).filter(Boolean)
        : orderedCategories;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const category of requested) {
        const keys = categoryKeys.get(category) ?? [];
        for (const key of keys) {
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(key);
        }
      }
      return out;
    },
    responseCategoryFromKey(key: string | null | undefined): string {
      const normalized = normalizeKey(String(key || ""));
      if (!normalized) return timeoutCategory;
      return keyToCategory.get(normalized) ?? invalidCategory;
    },
    expectedCategoryFromKey(key: string | null | undefined, fallbackCategory?: string): string {
      const normalized = normalizeKey(String(key || ""));
      const fallback = normalizeCategory(fallbackCategory || invalidCategory) || invalidCategory;
      if (!normalized) return fallback;
      return keyToCategory.get(normalized) ?? fallback;
    },
    expectedCategoryFromSpec(spec: string | null | undefined, fallbackCategory?: string): string {
      const raw = normalizeCategory(String(spec || ""));
      const fallback = normalizeCategory(fallbackCategory || invalidCategory) || invalidCategory;
      if (!raw) return fallback;
      const byCategory = categoryByLookup.get(raw.toLowerCase());
      if (byCategory) return byCategory;
      return keyToCategory.get(normalizeKey(raw)) ?? fallback;
    },
    keyForCategory(category: string): string | null {
      const keys = categoryKeys.get(normalizeCategory(category)) ?? [];
      return keys[0] ?? null;
    },
    hasCategory(category: string): boolean {
      return categorySet.has(normalizeCategory(category));
    },
    hasResponseCategory(category: string): boolean {
      const normalized = normalizeCategory(category);
      if (!normalized) return false;
      return Boolean(categoryByLookup.get(normalized.toLowerCase()));
    },
  };
}
