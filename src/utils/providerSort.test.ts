import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import {
  compareProviders,
  isProviderSortMode,
  nextProviderSortIndex,
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

  it("uses createdAt (import/create time) when sortIndex ties or is missing", () => {
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

  it("supports newest, oldest, and name sort modes", () => {
    const list = [
      p({ id: "b", name: "Beta", sortIndex: 0, createdAt: 200 }),
      p({ id: "a", name: "Alpha", sortIndex: 2, createdAt: 300 }),
      p({ id: "c", name: "Charlie", sortIndex: 1, createdAt: 100 }),
    ];

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
    expect(sortProvidersByMode(list, "name").map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("validates persisted sort modes", () => {
    expect(isProviderSortMode("manual")).toBe(true);
    expect(isProviderSortMode("newest")).toBe(true);
    expect(isProviderSortMode("unknown")).toBe(false);
    expect(isProviderSortMode(null)).toBe(false);
  });
});
