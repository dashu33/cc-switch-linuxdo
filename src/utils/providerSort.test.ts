import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import {
  compareProviders,
  getProviderAvailabilityRank,
  isProviderSortKey,
  migrateLegacyProviderSortMode,
  nextProviderSortIndex,
  normalizeLastUsedAtMs,
  resolveProviderAvailabilityStatus,
  sortProvidersByKey,
  sortProvidersByMode,
  sortProvidersList,
} from "./providerSort";

function p(
  partial: Partial<Provider> & Pick<Provider, "id" | "name">,
): Provider {
  return {
    settingsConfig: {},
    ...partial,
  };
}

describe("providerSort", () => {
  it("orders by sortIndex first", () => {
    const list = sortProvidersList([
      p({ id: "a", name: "A", sortIndex: 2, createdAt: 1 }),
      p({ id: "b", name: "B", sortIndex: 0, createdAt: 9 }),
      p({ id: "c", name: "C", sortIndex: 1, createdAt: 5 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("uses createdAt when sortIndex ties or is missing", () => {
    const list = sortProvidersList([
      p({ id: "new", name: "New", createdAt: 300 }),
      p({ id: "old", name: "Old", createdAt: 100 }),
      p({ id: "mid", name: "Mid", createdAt: 200 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["old", "mid", "new"]);
  });

  it("puts missing sortIndex after explicit sortIndex", () => {
    const list = sortProvidersList([
      p({ id: "no-index", name: "Z", createdAt: 1 }),
      p({ id: "indexed", name: "A", sortIndex: 5, createdAt: 999 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["indexed", "no-index"]);
  });

  it("puts missing createdAt after known times when sortIndex ties", () => {
    expect(
      compareProviders(
        p({ id: "known", name: "A", sortIndex: 1, createdAt: 10 }),
        p({ id: "unknown", name: "B", sortIndex: 1 }),
      ),
    ).toBeLessThan(0);
  });

  it("computes next sortIndex as max + 1", () => {
    expect(nextProviderSortIndex([])).toBe(0);
    expect(
      nextProviderSortIndex([
        p({ id: "a", name: "A", sortIndex: 0 }),
        p({ id: "b", name: "B", sortIndex: 3 }),
        p({ id: "c", name: "C" }),
      ]),
    ).toBe(4);
  });

  it("supports created/name via key+direction and legacy modes", () => {
    const list = [
      p({ id: "b", name: "Beta", sortIndex: 0, createdAt: 200 }),
      p({ id: "a", name: "Alpha", sortIndex: 2, createdAt: 300 }),
      p({ id: "c", name: "Charlie", sortIndex: 1, createdAt: 100 }),
    ];

    expect(
      sortProvidersByKey(list, "created", "zh-CN", { direction: "desc" }).map(
        (x) => x.id,
      ),
    ).toEqual(["a", "b", "c"]);
    expect(
      sortProvidersByKey(list, "created", "zh-CN", { direction: "asc" }).map(
        (x) => x.id,
      ),
    ).toEqual(["c", "b", "a"]);
    expect(sortProvidersByMode(list, "newest").map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortProvidersByMode(list, "oldest").map((x) => x.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(
      sortProvidersByKey(list, "name", "zh-CN", { direction: "asc" }).map(
        (x) => x.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("supports availability sort by model probe results", () => {
    const list = [
      p({ id: "failed", name: "F", sortIndex: 0, createdAt: 10 }),
      p({ id: "success-few", name: "S1", sortIndex: 1, createdAt: 20 }),
      p({ id: "unchecked", name: "U", sortIndex: 2, createdAt: 30 }),
      p({ id: "success-many", name: "S2", sortIndex: 3, createdAt: 40 }),
      p({ id: "empty", name: "E", sortIndex: 4, createdAt: 50 }),
      p({ id: "skipped", name: "K", sortIndex: 5, createdAt: 60 }),
    ];

    const sorted = sortProvidersByKey(list, "availability", "zh-CN", {
      direction: "desc",
      availability: {
        historyById: {
          "success-few": { status: "success", modelCount: 2, at: 100 },
          "success-many": { status: "success", modelCount: 12, at: 200 },
          empty: { status: "empty", at: 50 },
          failed: { status: "failed", at: 30 },
          skipped: { status: "skipped", at: 10 },
        },
      },
    });

    expect(sorted.map((x) => x.id)).toEqual([
      "success-many",
      "success-few",
      "empty",
      "failed",
      "skipped",
      "unchecked",
    ]);
  });

  it("supports recent usage sort by lastUsedAt", () => {
    const list = [
      p({ id: "a", name: "A", sortIndex: 0 }),
      p({ id: "b", name: "B", sortIndex: 1 }),
      p({ id: "c", name: "C", sortIndex: 2 }),
      p({ id: "d", name: "D", sortIndex: 3 }),
    ];
    const sorted = sortProvidersByKey(list, "recent", "zh-CN", {
      direction: "desc",
      recentById: {
        a: { lastUsedAt: 1000 }, // seconds
        b: { lastUsedAt: 3_000_000 }, // ms == 3000s
        c: { lastUsedAt: 2000 }, // seconds
      },
    });
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("prefers live probe status over history for availability sort", () => {
    const list = [
      p({ id: "a", name: "A", sortIndex: 0 }),
      p({ id: "b", name: "B", sortIndex: 1 }),
    ];
    const sorted = sortProvidersByKey(list, "availability", "zh-CN", {
      direction: "desc",
      availability: {
        liveById: {
          a: { status: "failed" },
          b: { status: "success", modelCount: 3 },
        },
        historyById: {
          a: { status: "success", modelCount: 9 },
          b: { status: "failed" },
        },
      },
    });
    expect(sorted.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("ranks availability statuses deterministically", () => {
    expect(getProviderAvailabilityRank("success")).toBe(0);
    expect(getProviderAvailabilityRank("empty")).toBe(1);
    expect(getProviderAvailabilityRank("failed")).toBe(2);
    expect(getProviderAvailabilityRank("skipped")).toBe(3);
    expect(getProviderAvailabilityRank("probing")).toBe(4);
    expect(getProviderAvailabilityRank("unchecked")).toBe(5);
    expect(resolveProviderAvailabilityStatus("probing", "success")).toBe(
      "probing",
    );
    expect(resolveProviderAvailabilityStatus(undefined, "empty")).toBe("empty");
    expect(normalizeLastUsedAtMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeLastUsedAtMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("migrates legacy sort modes and validates keys", () => {
    expect(migrateLegacyProviderSortMode("newest")).toEqual({
      key: "created",
      direction: "desc",
    });
    expect(migrateLegacyProviderSortMode("oldest")).toEqual({
      key: "created",
      direction: "asc",
    });
    expect(isProviderSortKey("manual")).toBe(true);
    expect(isProviderSortKey("recent")).toBe(true);
    expect(isProviderSortKey("newest")).toBe(false);
  });
});


