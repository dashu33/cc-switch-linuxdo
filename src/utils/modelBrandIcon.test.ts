import { describe, expect, it } from "vitest";
import {
  inferModelBrandIcon,
  pickModelBrandIcons,
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
  });

  it("groups by brand without hard cap and keeps first as top model", () => {
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
    expect(pack.icons[0]?.modelId).toBe("gpt-4o");
    expect(pack.icons[0]?.modelIds).toEqual(["gpt-4o", "gpt-4.1"]);
    expect(pack.overflow).toBe(0);
  });

  it("resolves top model for a brand from probe order", () => {
    expect(
      resolveTopModelForBrand(
        ["claude-haiku", "gpt-4o", "claude-sonnet"],
        "claude",
      ),
    ).toBe("claude-haiku");
  });
});
