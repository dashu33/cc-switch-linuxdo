import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import { applyProviderModel } from "@/utils/applyProviderModel";
import {
  applyProviderApiFormat,
  providerNeedsRouting,
  resolveProviderApiFormat,
  resolveProviderQuickModel,
  supportsProviderQuickAdjust,
} from "@/utils/providerQuickAdjust";

function makeGrokProvider(overrides?: Partial<Provider>): Provider {
  return {
    id: "grok-1",
    name: "Grok Gateway",
    settingsConfig: {
      config: `[models]
default = "proxy-main"

[model.proxy-main]
model = "grok-4.5"
base_url = "https://grok.example.com/v1"
name = "Grok Gateway"
api_key = "sk-grok"
api_backend = "responses"
context_window = 500000
`,
    },
    meta: {
      apiFormat: "openai_responses",
    },
    ...overrides,
  };
}

describe("providerQuickAdjust global framework", () => {
  it("enables quick adjust for grokbuild", () => {
    expect(supportsProviderQuickAdjust("grokbuild")).toBe(true);
    expect(supportsProviderQuickAdjust("codex")).toBe(true);
    expect(supportsProviderQuickAdjust("gemini")).toBe(false);
  });

  it("resolves and persists grok api format into api_backend", () => {
    const provider = makeGrokProvider();
    expect(resolveProviderApiFormat(provider, "grokbuild")).toBe(
      "openai_responses",
    );
    expect(providerNeedsRouting(provider, "grokbuild")).toBe(false);

    const chat = applyProviderApiFormat(provider, "grokbuild", "openai_chat");
    expect(chat.meta?.apiFormat).toBe("openai_chat");
    expect(String(chat.settingsConfig.config)).toContain(
      'api_backend = "chat_completions"',
    );
    expect(providerNeedsRouting(chat, "grokbuild")).toBe(true);

    const anthropic = applyProviderApiFormat(
      provider,
      "grokbuild",
      "anthropic",
    );
    expect(String(anthropic.settingsConfig.config)).toContain(
      'api_backend = "messages"',
    );
    expect(providerNeedsRouting(anthropic, "grokbuild")).toBe(true);
  });

  it("applies grok model into upstream model field", () => {
    const provider = makeGrokProvider();
    expect(resolveProviderQuickModel(provider, "grokbuild")).toBe("grok-4.5");
    const next = applyProviderModel(provider, "grokbuild", "gpt-5.5");
    expect(next).not.toBeNull();
    expect(String(next!.settingsConfig.config)).toContain('model = "gpt-5.5"');
    expect(resolveProviderQuickModel(next!, "grokbuild")).toBe("gpt-5.5");
  });
});
