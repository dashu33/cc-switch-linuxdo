import { describe, expect, it } from "vitest";
import {
  parseModelsProbeHistory,
  readModelsProbeHistory,
  saveModelsProbeHistory,
} from "./useFetchCurrentProviderModels";

describe("parseModelsProbeHistory", () => {
  it("keeps only completed provider probe results", () => {
    expect(
      parseModelsProbeHistory(
        JSON.stringify({
          ok: { status: "success", at: 10, modelCount: 3 },
          bad: { status: "failed", at: 20 },
          empty: { status: "empty", at: 30 },
          skipped: { status: "skipped", at: 40, reason: "official" },
          running: { status: "probing", at: 50 },
          idle: { status: "idle", at: null },
        }),
      ),
    ).toEqual({
      ok: { status: "success", at: 10, modelCount: 3 },
      bad: { status: "failed", at: 20 },
      empty: { status: "empty", at: 30 },
      skipped: { status: "skipped", at: 40, reason: "official" },
    });
  });

  it("fails closed for malformed storage values", () => {
    expect(parseModelsProbeHistory(null)).toEqual({});
    expect(parseModelsProbeHistory("not-json")).toEqual({});
    expect(parseModelsProbeHistory("[]")).toEqual({});
  });

  it("persists independent completed histories per app", () => {
    localStorage.clear();
    const claude = { a: { status: "success" as const, at: 10 } };
    const codex = { b: { status: "failed" as const, at: 20 } };

    saveModelsProbeHistory("claude", claude, localStorage);
    saveModelsProbeHistory("codex", codex, localStorage);

    expect(readModelsProbeHistory("claude", localStorage)).toEqual(claude);
    expect(readModelsProbeHistory("codex", localStorage)).toEqual(codex);
  });


  it("keeps optional modelIds from storage while remaining backward compatible", () => {
    expect(
      parseModelsProbeHistory(
        JSON.stringify({
          legacy: { status: "success", at: 10, modelCount: 2 },
          rich: {
            status: "success",
            at: 11,
            modelCount: 3,
            modelIds: ["gpt-4o", "claude-sonnet-4", 123, ""],
          },
        }),
      ),
    ).toEqual({
      legacy: { status: "success", at: 10, modelCount: 2 },
      rich: {
        status: "success",
        at: 11,
        modelCount: 3,
        modelIds: ["gpt-4o", "claude-sonnet-4"],
      },
    });
  });

});
