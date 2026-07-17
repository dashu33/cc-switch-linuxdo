import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PROVIDER_CARD_TSX = path.resolve(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "providers",
  "ProviderCard.tsx",
);

const CODEX_QUICK_ADJUST_TSX = path.resolve(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "providers",
  "CodexProviderQuickAdjust.tsx",
);

const PROVIDER_ACTIONS_TSX = path.resolve(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "providers",
  "ProviderActions.tsx",
);

describe("ProviderCard layout", () => {
  const source = fs.readFileSync(PROVIDER_CARD_TSX, "utf8");
  const quickAdjust = fs.readFileSync(CODEX_QUICK_ADJUST_TSX, "utf8");
  const actions = fs.readFileSync(PROVIDER_ACTIONS_TSX, "utf8");

  it("lets website links use available card width before truncating", () => {
    expect(source).not.toContain("max-w-[280px]");
    expect(source).toContain("flex min-w-0 flex-1 items-center gap-2");
    expect(source).toContain("min-w-0 flex-1 space-y-1");
    expect(source).toContain(
      "inline-flex max-w-full items-center overflow-hidden text-left text-sm",
    );
  });

  it("compresses left rail for sequence and move controls", () => {
    expect(source).toContain("flex w-7 shrink-0 flex-col items-center");
    expect(source).toContain("text-sm font-extrabold leading-none tabular-nums");
    expect(source).toContain("canReorder");
    expect(source).toContain("pickModelBrandIcons");
    expect(source).toContain("pinToTop");
    expect(source).toContain("ProviderProxyUsageSummary");
    expect(source).toContain("UsageFooter");
    expect(source).toContain("inset-y-0");
    expect(source).toContain("items-center justify-end");
  });

  it("slots local usage summary under upstream format beside model logos", () => {
    expect(source).toContain("belowUpstream={");
    expect(quickAdjust).toContain("belowUpstream");
    expect(quickAdjust).toContain("图标只撑高右列");
    // summary is passed into quick-adjust for codex rows
    const codexIdx = source.indexOf("<CodexProviderQuickAdjust");
    const nestedSummaryIdx = source.indexOf(
      "belowUpstream={",
      codexIdx,
    );
    expect(nestedSummaryIdx).toBeGreaterThan(codexIdx);
  });

  it("keeps inline model fetching visible for Codex and the Claude family", () => {
    expect(source).toContain("const hasInlineQuickAdjust =");
    expect(source).toContain('appId === "codex"');
    expect(source).toContain('appId === "claude"');
    expect(source).toContain('appId === "claude-desktop"');
    expect(source).toContain("hasInlineQuickAdjust && onUpdate");
    expect(source).toContain("appId={appId}");
  });

  it("widens the recent-calls column and contains hover actions inside it", () => {
    expect(source.match(/sm:w-\[360px\] xl:w-\[400px\]/g)).toHaveLength(2);
    expect(source).toContain("w-[calc(100%-1rem)]");
    expect(actions).toContain(
      "flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5",
    );
  });

  it("wires modelsProbeReason into CodexProviderQuickAdjust", () => {
    expect(source).toContain("modelsProbeReason={modelsProbeReason}");
    expect(quickAdjust).toContain("modelsProbeReason");
    expect(quickAdjust).toContain("fetchFailureReasonLabel");
  });
});
