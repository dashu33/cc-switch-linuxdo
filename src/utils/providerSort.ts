import type { Provider } from "@/types";

export const PROVIDER_SORT_MODES = [
  "manual",
  "newest",
  "oldest",
  "name",
] as const;

export type ProviderSortMode = (typeof PROVIDER_SORT_MODES)[number];

/**
 * Provider list order:
 * 1. sortIndex ASC (manual drag order; missing goes last)
 * 2. createdAt ASC (import / create time)
 * 3. name (stable locale tie-break)
 * 4. id (final stable tie-break)
 */
export function compareProviders(
  a: Provider,
  b: Provider,
  locale = "zh-CN",
): number {
  const indexA = a.sortIndex ?? Number.MAX_SAFE_INTEGER;
  const indexB = b.sortIndex ?? Number.MAX_SAFE_INTEGER;
  if (indexA !== indexB) {
    return indexA - indexB;
  }

  const timeA = a.createdAt ?? Number.MAX_SAFE_INTEGER;
  const timeB = b.createdAt ?? Number.MAX_SAFE_INTEGER;
  if (timeA !== timeB) {
    return timeA - timeB;
  }

  const nameCmp = (a.name || "").localeCompare(b.name || "", locale);
  if (nameCmp !== 0) return nameCmp;

  return (a.id || "").localeCompare(b.id || "", locale);
}

export function sortProvidersList(
  providers: Iterable<Provider>,
  locale = "zh-CN",
): Provider[] {
  return [...providers].sort((a, b) => compareProviders(a, b, locale));
}

export function isProviderSortMode(value: unknown): value is ProviderSortMode {
  return PROVIDER_SORT_MODES.includes(value as ProviderSortMode);
}

export function sortProvidersByMode(
  providers: Iterable<Provider>,
  mode: ProviderSortMode,
  locale = "zh-CN",
): Provider[] {
  const list = [...providers];
  if (mode === "manual") {
    return list.sort((a, b) => compareProviders(a, b, locale));
  }

  return list.sort((a, b) => {
    if (mode === "name") {
      const nameCmp = (a.name || "").localeCompare(b.name || "", locale);
      if (nameCmp !== 0) return nameCmp;
    } else {
      const fallback =
        mode === "newest" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const timeA = a.createdAt ?? fallback;
      const timeB = b.createdAt ?? fallback;
      if (timeA !== timeB) {
        return mode === "newest" ? timeB - timeA : timeA - timeB;
      }
    }

    return compareProviders(a, b, locale);
  });
}

/**
 * Next sortIndex when appending a provider to the end of a list.
 * Matches backend seed behavior: MAX(sort_index) + 1 (or 0 when empty).
 */
export function nextProviderSortIndex(providers: Iterable<Provider>): number {
  let max = -1;
  for (const provider of providers) {
    if (
      typeof provider.sortIndex === "number" &&
      Number.isFinite(provider.sortIndex) &&
      provider.sortIndex > max
    ) {
      max = provider.sortIndex;
    }
  }
  return max + 1;
}
