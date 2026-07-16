import type { Provider } from "@/types";

/** Sort dimensions shown in the provider list submenu. */
export const PROVIDER_SORT_KEYS = [
  "manual",
  "created",
  "availability",
  "recent",
  "name",
] as const;

export type ProviderSortKey = (typeof PROVIDER_SORT_KEYS)[number];

/** Asc/desc only applies to non-manual dimensions. */
export type ProviderSortDirection = "asc" | "desc";

/**
 * Legacy persisted values from older builds.
 * Kept for one-time migration when reading localStorage.
 */
export const LEGACY_PROVIDER_SORT_MODES = [
  "manual",
  "newest",
  "oldest",
  "name",
  "availability",
] as const;

export type LegacyProviderSortMode =
  (typeof LEGACY_PROVIDER_SORT_MODES)[number];

/** @deprecated use ProviderSortKey + ProviderSortDirection */
export type ProviderSortMode = LegacyProviderSortMode;

/** @deprecated use PROVIDER_SORT_KEYS */
export const PROVIDER_SORT_MODES = LEGACY_PROVIDER_SORT_MODES;

export type ProviderAvailabilitySortStatus =
  | "success"
  | "empty"
  | "failed"
  | "skipped"
  | "probing"
  | "unchecked";

export interface ProviderAvailabilitySortEntry {
  status?: string | null;
  modelCount?: number;
  at?: number | null;
}

export interface ProviderRecentSortEntry {
  /** unix seconds or ms; comparator normalizes */
  lastUsedAt?: number | null;
}

export interface ProviderSortOptions {
  direction?: ProviderSortDirection;
  availability?: {
    liveById?: Record<string, ProviderAvailabilitySortEntry | undefined>;
    historyById?: Record<string, ProviderAvailabilitySortEntry | undefined>;
  };
  recentById?: Record<string, ProviderRecentSortEntry | undefined>;
}

export function isProviderSortKey(value: unknown): value is ProviderSortKey {
  return PROVIDER_SORT_KEYS.includes(value as ProviderSortKey);
}

export function isProviderSortDirection(
  value: unknown,
): value is ProviderSortDirection {
  return value === "asc" || value === "desc";
}

/** @deprecated use isProviderSortKey / migrateLegacyProviderSortMode */
export function isProviderSortMode(
  value: unknown,
): value is LegacyProviderSortMode {
  return LEGACY_PROVIDER_SORT_MODES.includes(value as LegacyProviderSortMode);
}

/**
 * Convert older single-token sort modes into key + direction.
 * newest/oldest both map to created, with opposite directions.
 */
export function migrateLegacyProviderSortMode(value: unknown): {
  key: ProviderSortKey;
  direction: ProviderSortDirection;
} {
  if (value === "newest") return { key: "created", direction: "desc" };
  if (value === "oldest") return { key: "created", direction: "asc" };
  if (value === "availability") {
    return { key: "availability", direction: "desc" };
  }
  if (value === "name") return { key: "name", direction: "asc" };
  if (value === "recent") return { key: "recent", direction: "desc" };
  if (value === "created") return { key: "created", direction: "desc" };
  if (value === "manual") return { key: "manual", direction: "asc" };
  return { key: "manual", direction: "asc" };
}

export function getProviderAvailabilityRank(
  status: ProviderAvailabilitySortStatus | string | null | undefined,
): number {
  switch (status) {
    case "success":
      return 0;
    case "empty":
      return 1;
    case "failed":
      return 2;
    case "skipped":
      return 3;
    case "probing":
      return 4;
    default:
      return 5;
  }
}

export function resolveProviderAvailabilityStatus(
  liveStatus?: string | null,
  historyStatus?: string | null,
): ProviderAvailabilitySortStatus {
  if (
    liveStatus === "success" ||
    liveStatus === "empty" ||
    liveStatus === "failed" ||
    liveStatus === "skipped" ||
    liveStatus === "probing"
  ) {
    return liveStatus;
  }
  if (
    historyStatus === "success" ||
    historyStatus === "empty" ||
    historyStatus === "failed" ||
    historyStatus === "skipped"
  ) {
    return historyStatus;
  }
  return "unchecked";
}

/**
 * Manual / fallback order:
 * 1. sortIndex ASC
 * 2. createdAt ASC
 * 3. name
 * 4. id
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

function pickAvailabilityEntry(
  providerId: string,
  availability?: ProviderSortOptions["availability"],
): ProviderAvailabilitySortEntry | undefined {
  const live = availability?.liveById?.[providerId];
  if (
    live?.status === "success" ||
    live?.status === "empty" ||
    live?.status === "failed" ||
    live?.status === "skipped" ||
    live?.status === "probing"
  ) {
    return live;
  }
  return availability?.historyById?.[providerId];
}

/** Normalize lastUsedAt that may be seconds or milliseconds. */
export function normalizeLastUsedAtMs(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  // Heuristic: < 10^12 is almost certainly unix seconds.
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

/**
 * Primary sorter for the provider list.
 * direction is ignored for manual mode.
 */
export function sortProvidersByKey(
  providers: Iterable<Provider>,
  key: ProviderSortKey,
  locale = "zh-CN",
  options: ProviderSortOptions = {},
): Provider[] {
  const list = [...providers];
  if (key === "manual") {
    return list.sort((a, b) => compareProviders(a, b, locale));
  }

  const direction: ProviderSortDirection = options.direction ?? "desc";
  const dir = direction === "asc" ? 1 : -1;

  return list.sort((a, b) => {
    let primary = 0;

    if (key === "name") {
      primary = (a.name || "").localeCompare(b.name || "", locale);
    } else if (key === "created") {
      const fallback =
        direction === "desc" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const timeA = a.createdAt ?? fallback;
      const timeB = b.createdAt ?? fallback;
      primary = timeA - timeB;
    } else if (key === "recent") {
      const fallback =
        direction === "desc" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const atA =
        normalizeLastUsedAtMs(options.recentById?.[a.id]?.lastUsedAt) ??
        fallback;
      const atB =
        normalizeLastUsedAtMs(options.recentById?.[b.id]?.lastUsedAt) ??
        fallback;
      primary = atA - atB;
    } else if (key === "availability") {
      // Rank is "goodness": success first. desc = available first, asc = reverse.
      const statusA = resolveProviderAvailabilityStatus(
        options.availability?.liveById?.[a.id]?.status,
        options.availability?.historyById?.[a.id]?.status,
      );
      const statusB = resolveProviderAvailabilityStatus(
        options.availability?.liveById?.[b.id]?.status,
        options.availability?.historyById?.[b.id]?.status,
      );
      const rankA = getProviderAvailabilityRank(statusA);
      const rankB = getProviderAvailabilityRank(statusB);
      // rank is already "better first" with smaller numbers; invert for dir math.
      primary = rankB - rankA;

      if (primary === 0 && statusA === "success" && statusB === "success") {
        const entryA = pickAvailabilityEntry(a.id, options.availability);
        const entryB = pickAvailabilityEntry(b.id, options.availability);
        const modelsA =
          typeof entryA?.modelCount === "number"
            ? entryA.modelCount
            : Number.MIN_SAFE_INTEGER;
        const modelsB =
          typeof entryB?.modelCount === "number"
            ? entryB.modelCount
            : Number.MIN_SAFE_INTEGER;
        primary = modelsA - modelsB;
        if (primary === 0) {
          const probeA =
            typeof entryA?.at === "number"
              ? entryA.at
              : Number.MIN_SAFE_INTEGER;
          const probeB =
            typeof entryB?.at === "number"
              ? entryB.at
              : Number.MIN_SAFE_INTEGER;
          primary = probeA - probeB;
        }
      }
    }

    if (primary !== 0) return primary * dir;
    return compareProviders(a, b, locale);
  });
}

/**
 * Back-compat wrapper for older call sites / tests.
 * newest = created+desc, oldest = created+asc.
 */
export function sortProvidersByMode(
  providers: Iterable<Provider>,
  mode: LegacyProviderSortMode | ProviderSortKey,
  locale = "zh-CN",
  availability?: ProviderSortOptions["availability"],
): Provider[] {
  if (mode === "newest") {
    return sortProvidersByKey(providers, "created", locale, {
      direction: "desc",
    });
  }
  if (mode === "oldest") {
    return sortProvidersByKey(providers, "created", locale, {
      direction: "asc",
    });
  }
  if (mode === "availability") {
    return sortProvidersByKey(providers, "availability", locale, {
      direction: "desc",
      availability,
    });
  }
  if (mode === "name") {
    return sortProvidersByKey(providers, "name", locale, {
      direction: "asc",
    });
  }
  if (mode === "created" || mode === "recent") {
    return sortProvidersByKey(providers, mode, locale, {
      direction: "desc",
      availability,
    });
  }
  return sortProvidersByKey(providers, "manual", locale);
}

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
