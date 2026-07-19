import type { AppId } from "@/lib/api";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const providerFavoritesStorageKey = (appId: AppId) =>
  `cc-switch-provider-favorites:v1:${appId}`;

export function readProviderFavorites(
  appId: AppId,
  storage: StorageLike | undefined = globalThis.localStorage,
): Set<string> {
  try {
    const raw = storage?.getItem(providerFavoritesStorageKey(appId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (providerId): providerId is string =>
          typeof providerId === "string" && providerId.trim().length > 0,
      ),
    );
  } catch {
    return new Set();
  }
}

export function writeProviderFavorites(
  appId: AppId,
  providerIds: Iterable<string>,
  storage: StorageLike | undefined = globalThis.localStorage,
): void {
  try {
    const uniqueIds = Array.from(new Set(providerIds)).filter(Boolean);
    storage?.setItem(
      providerFavoritesStorageKey(appId),
      JSON.stringify(uniqueIds),
    );
  } catch {
    // Favorites still work for this session when storage is unavailable.
  }
}
