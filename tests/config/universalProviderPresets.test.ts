import { describe, expect, it } from "vitest";
import {
  createUniversalProviderFromPreset,
  findPresetByType,
} from "@/config/universalProviderPresets";
import type { UniversalProviderApps } from "@/types";

/** 与后端/编辑表单一致：扩展端缺字段按 true，显式 false 保留 */
function normalizeLegacyApps(
  apps: Partial<UniversalProviderApps> &
    Pick<UniversalProviderApps, "claude" | "codex" | "gemini">,
): UniversalProviderApps {
  return {
    claude: apps.claude,
    codex: apps.codex,
    gemini: apps.gemini,
    grokbuild: apps.grokbuild ?? true,
    claudeDesktop: apps.claudeDesktop ?? true,
    opencode: apps.opencode ?? true,
    openclaw: apps.openclaw ?? true,
    hermes: apps.hermes ?? true,
  };
}

describe("universal provider presets", () => {
  it("enables every model app for NewAPI quick import", () => {
    const preset = findPresetByType("newapi");
    expect(preset).toBeDefined();
    expect(preset?.defaultApps).toMatchObject({
      claude: true,
      codex: true,
      gemini: true,
      grokbuild: true,
      claudeDesktop: true,
      opencode: true,
      openclaw: true,
      hermes: true,
    });

    const provider = createUniversalProviderFromPreset(
      preset!,
      "test-newapi",
      "https://gateway.example/v1",
      "sk-test",
    );
    expect(provider.apps.grokbuild).toBe(true);
    expect(provider.apps.openclaw).toBe(true);
    expect(provider.models.grokbuild?.model).toBe("grok-4.5");
  });

  it("treats missing extended app flags as enabled for legacy records", () => {
    const legacy = normalizeLegacyApps({
      claude: true,
      codex: true,
      gemini: true,
    });
    expect(legacy.grokbuild).toBe(true);
    expect(legacy.claudeDesktop).toBe(true);
    expect(legacy.opencode).toBe(true);
    expect(legacy.openclaw).toBe(true);
    expect(legacy.hermes).toBe(true);
  });

  it("preserves explicit false for extended app flags", () => {
    const apps = normalizeLegacyApps({
      claude: true,
      codex: true,
      gemini: true,
      grokbuild: false,
      claudeDesktop: false,
      opencode: false,
      openclaw: false,
      hermes: false,
    });
    expect(apps.grokbuild).toBe(false);
    expect(apps.openclaw).toBe(false);
  });
});
