import { describe, expect, it } from "vitest";
import {
  readProviderFavorites,
  writeProviderFavorites,
} from "./providerFavorites";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("providerFavorites", () => {
  it("persists favorites separately for each app", () => {
    const storage = createStorage();
    writeProviderFavorites("codex", ["provider-a", "provider-b"], storage);

    expect([...readProviderFavorites("codex", storage)]).toEqual([
      "provider-a",
      "provider-b",
    ]);
    expect([...readProviderFavorites("claude", storage)]).toEqual([]);
  });

  it("deduplicates ids and ignores invalid storage values", () => {
    const storage = createStorage({
      "cc-switch-provider-favorites:v1:codex": '{"bad":true}',
    });
    expect([...readProviderFavorites("codex", storage)]).toEqual([]);

    writeProviderFavorites("codex", ["provider-a", "provider-a"], storage);
    expect([...readProviderFavorites("codex", storage)]).toEqual([
      "provider-a",
    ]);
  });
});
