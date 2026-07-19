import { describe, expect, it } from "vitest";
import {
  inferModelBrandIcon,
  pickBrandDiverseModelIds,
  pickModelBrandIcons,
  pickTopModelId,
  resolveTopModelForBrand,
} from "./modelBrandIcon";

describe("modelBrandIcon", () => {
  it("maps common model ids to brand icons", () => {
    expect(inferModelBrandIcon("gpt-4o-mini")?.icon).toBe("openai");
    expect(inferModelBrandIcon("claude-sonnet-4")?.icon).toBe("claude");
    expect(inferModelBrandIcon("gemini-2.0-flash")?.icon).toBe("gemini");
    expect(inferModelBrandIcon("deepseek-chat")?.icon).toBe("deepseek");
    expect(inferModelBrandIcon("grok-4.5")?.icon).toBe("grok");
    expect(inferModelBrandIcon("grok4.5")?.icon).toBe("grok");
    expect(inferModelBrandIcon("x-ai/grok-4.5-beta")?.icon).toBe("grok");
    expect(inferModelBrandIcon("xai/grok-4")?.icon).toBe("grok");
    expect(inferModelBrandIcon("xai-grok-3")?.icon).toBe("grok");
    expect(inferModelBrandIcon("Grok-4")?.icon).toBe("grok");
  });

  it("groups by brand without hard cap and keeps top model by version", () => {
    const pack = pickModelBrandIcons([
      "gpt-4o",
      "gpt-4.1",
      "claude-3-5",
      "qwen-max",
      "unknown-model",
    ]);
    expect(pack.icons.map((item) => item.icon)).toEqual([
      "openai",
      "claude",
      "qwen",
    ]);
    // Prefer higher version among openai ids
    expect(pack.icons[0]?.modelId).toBe("gpt-4.1");
    expect(pack.icons[0]?.modelIds).toEqual(["gpt-4o", "gpt-4.1"]);
    expect(pack.overflow).toBe(0);
  });

  it("prefers non-lite top models when versions are close", () => {
    expect(pickTopModelId(["grok-4-mini", "grok-4", "grok-3"])).toBe("grok-4");
    expect(
      resolveTopModelForBrand(
        ["claude-haiku-4", "claude-sonnet-4", "claude-opus-4"],
        "claude",
      ),
    ).toBe("claude-opus-4");
  });

  it("selects the latest flagship model without treating dates as versions", () => {
    expect(
      pickTopModelId([
        "claude-haiku-4-5-20251001",
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-8",
        "claude-opus-4-6-20260205",
      ]),
    ).toBe("claude-opus-4-8");

    expect(
      pickTopModelId(["gpt-4o-2024-11-20", "gpt-5.5-mini", "gpt-5.6-sol"]),
    ).toBe("gpt-5.6-sol");

    expect(
      pickTopModelId([
        "gemini-2.5-pro",
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
      ]),
    ).toBe("gemini-3-pro-preview");

    expect(pickTopModelId(["grok-4.1-fast", "grok-4.5", "grok-4-202507"])).toBe(
      "grok-4.5",
    );
  });

  it("keeps brand diversity when sampling model ids", () => {
    const many = [
      ...Array.from({ length: 30 }, (_, i) => `gpt-extra-${i}`),
      "claude-sonnet-4",
      "grok-4",
      "qwen-max",
    ];
    const sampled = pickBrandDiverseModelIds(many, 10);
    expect(sampled).toContain("gpt-extra-0");
    expect(sampled).toContain("claude-sonnet-4");
    expect(sampled).toContain("grok-4");
    expect(sampled).toContain("qwen-max");
    expect(sampled.length).toBe(10);
  });
});
