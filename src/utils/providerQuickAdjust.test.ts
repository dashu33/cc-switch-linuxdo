import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import { applyProviderModel } from "@/utils/applyProviderModel";
import {
  applyProviderApiFormat,
  openclawProtocolFromApiFormat,
  providerNeedsRouting,
  resolveProviderApiFormat,
  resolveProviderKnownModelIds,
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

function makeOpenClawProvider(overrides?: Partial<Provider>): Provider {
  return {
    id: "openclaw-1",
    name: "OpenClaw Gateway",
    settingsConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-openclaw",
      api: "openai-completions",
      models: [
        {
          id: "gpt-5.5",
          name: "GPT 5.5",
          contextWindow: 200000,
          cost: { input: 1, output: 2 },
        },
        {
          id: "claude-sonnet-5",
          name: "Claude Sonnet 5",
          contextWindow: 200000,
        },
      ],
    },
    ...overrides,
  };
}

describe("providerQuickAdjust global framework", () => {
  it("enables quick adjust for all managed apps including hermes", () => {
    expect(supportsProviderQuickAdjust("grokbuild")).toBe(true);
    expect(supportsProviderQuickAdjust("codex")).toBe(true);
    expect(supportsProviderQuickAdjust("openclaw")).toBe(true);
    expect(supportsProviderQuickAdjust("gemini")).toBe(true);
    expect(supportsProviderQuickAdjust("opencode")).toBe(true);
    expect(supportsProviderQuickAdjust("hermes")).toBe(true);
  });

  it("persists grok upstream format in meta while keeping client api_backend=responses", () => {
    const provider = makeGrokProvider();
    expect(resolveProviderApiFormat(provider, "grokbuild")).toBe(
      "openai_responses",
    );
    expect(providerNeedsRouting(provider, "grokbuild")).toBe(false);

    const chat = applyProviderApiFormat(provider, "grokbuild", "openai_chat");
    expect(chat.meta?.apiFormat).toBe("openai_chat");
    // Local proxy only exposes /grokbuild/v1/responses — client must stay Responses.
    expect(String(chat.settingsConfig.config)).toContain(
      'api_backend = "responses"',
    );
    expect(String(chat.settingsConfig.config)).not.toContain(
      'api_backend = "chat_completions"',
    );
    expect(providerNeedsRouting(chat, "grokbuild")).toBe(true);

    const anthropic = applyProviderApiFormat(
      provider,
      "grokbuild",
      "anthropic",
    );
    expect(anthropic.meta?.apiFormat).toBe("anthropic");
    expect(String(anthropic.settingsConfig.config)).toContain(
      'api_backend = "responses"',
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

  it("resolves and persists OpenClaw api protocol without routing badge", () => {
    const provider = makeOpenClawProvider();
    expect(resolveProviderApiFormat(provider, "openclaw")).toBe("openai_chat");
    expect(providerNeedsRouting(provider, "openclaw")).toBe(false);

    const responses = applyProviderApiFormat(
      provider,
      "openclaw",
      "openai_responses",
    );
    expect(responses.meta?.apiFormat).toBe("openai_responses");
    expect(responses.settingsConfig.api).toBe("openai-responses");
    expect(providerNeedsRouting(responses, "openclaw")).toBe(false);

    const anthropic = applyProviderApiFormat(provider, "openclaw", "anthropic");
    expect(anthropic.settingsConfig.api).toBe("anthropic-messages");
    expect(openclawProtocolFromApiFormat("gemini_native")).toBe(
      "google-generative-ai",
    );

    const gemini = applyProviderApiFormat(
      provider,
      "openclaw",
      "gemini_native",
    );
    expect(gemini.settingsConfig.api).toBe("google-generative-ai");
    // native api wins over meta when present
    expect(
      resolveProviderApiFormat(
        {
          ...provider,
          meta: { apiFormat: "openai_chat" },
          settingsConfig: {
            ...provider.settingsConfig,
            api: "anthropic-messages",
          },
        },
        "openclaw",
      ),
    ).toBe("anthropic");
  });

  it("resolves Gemini native format and model env fields", () => {
    const provider: Provider = {
      id: "gemini-1",
      name: "Gemini Gateway",
      settingsConfig: {
        env: {
          GOOGLE_GEMINI_BASE_URL: "https://api.example.com",
          GEMINI_API_KEY: "sk-g",
          GEMINI_MODEL: "gemini-3.5-flash",
        },
      },
    };
    expect(resolveProviderApiFormat(provider, "gemini")).toBe("gemini_native");
    expect(providerNeedsRouting(provider, "gemini")).toBe(false);
    expect(resolveProviderQuickModel(provider, "gemini")).toBe(
      "gemini-3.5-flash",
    );

    const chat = applyProviderApiFormat(provider, "gemini", "openai_chat");
    expect(chat.meta?.apiFormat).toBe("openai_chat");
    expect(providerNeedsRouting(chat, "gemini")).toBe(true);

    const next = applyProviderModel(provider, "gemini", "gemini-3.1-pro");
    expect(next).not.toBeNull();
    expect(next!.settingsConfig.env.GEMINI_MODEL).toBe("gemini-3.1-pro");
    expect(next!.settingsConfig.env.GOOGLE_MODEL).toBe("gemini-3.1-pro");
    expect(resolveProviderQuickModel(next!, "gemini")).toBe("gemini-3.1-pro");
  });

  it("resolves and persists OpenCode npm package and model map primary", () => {
    const provider: Provider = {
      id: "oc-1",
      name: "OpenCode Gateway",
      settingsConfig: {
        npm: "@ai-sdk/openai-compatible",
        name: "OpenCode Gateway",
        options: {
          baseURL: "https://api.example.com/v1",
          apiKey: "sk-oc",
        },
        models: {
          "gpt-5.5": { name: "GPT 5.5", limit: { context: 128000 } },
          "claude-sonnet-5": { name: "Claude Sonnet 5" },
        },
      },
    };
    expect(resolveProviderApiFormat(provider, "opencode")).toBe("openai_chat");
    expect(providerNeedsRouting(provider, "opencode")).toBe(false);
    expect(resolveProviderQuickModel(provider, "opencode")).toBe("gpt-5.5");
    expect(resolveProviderKnownModelIds(provider, "opencode")).toEqual([
      "gpt-5.5",
      "claude-sonnet-5",
    ]);

    const anthropic = applyProviderApiFormat(provider, "opencode", "anthropic");
    expect(anthropic.meta?.apiFormat).toBe("anthropic");
    expect(anthropic.settingsConfig.npm).toBe("@ai-sdk/anthropic");
    expect(providerNeedsRouting(anthropic, "opencode")).toBe(false);

    const responses = applyProviderApiFormat(
      provider,
      "opencode",
      "openai_responses",
    );
    expect(responses.settingsConfig.npm).toBe("@ai-sdk/openai");

    const google = applyProviderApiFormat(
      provider,
      "opencode",
      "gemini_native",
    );
    expect(google.settingsConfig.npm).toBe("@ai-sdk/google");

    const promoted = applyProviderModel(provider, "opencode", "claude-sonnet-5");
    expect(promoted).not.toBeNull();
    expect(Object.keys(promoted!.settingsConfig.models)).toEqual([
      "claude-sonnet-5",
      "gpt-5.5",
    ]);
    expect(promoted!.settingsConfig.models["claude-sonnet-5"].name).toBe(
      "Claude Sonnet 5",
    );
    expect(promoted!.settingsConfig.models["gpt-5.5"].limit).toEqual({
      context: 128000,
    });

    const appended = applyProviderModel(provider, "opencode", "new-m");
    expect(Object.keys(appended!.settingsConfig.models)[0]).toBe("new-m");
    expect(appended!.settingsConfig.models["new-m"]).toEqual({ name: "new-m" });
  });

  it("resolves and persists Hermes api_mode and models[] primary", () => {
    const provider: Provider = {
      id: "hermes-1",
      name: "Hermes Gateway",
      settingsConfig: {
        base_url: "https://api.example.com/v1",
        api_key: "sk-h",
        api_mode: "chat_completions",
        models: [
          { id: "gpt-5.5", name: "GPT 5.5", context_length: 128000 },
          { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
        ],
      },
    };
    expect(resolveProviderApiFormat(provider, "hermes")).toBe("openai_chat");
    expect(providerNeedsRouting(provider, "hermes")).toBe(false);
    expect(resolveProviderQuickModel(provider, "hermes")).toBe("gpt-5.5");

    const responses = applyProviderApiFormat(
      provider,
      "hermes",
      "openai_responses",
    );
    expect(responses.meta?.apiFormat).toBe("openai_responses");
    expect(responses.settingsConfig.api_mode).toBe("codex_responses");

    const anthropic = applyProviderApiFormat(provider, "hermes", "anthropic");
    expect(anthropic.settingsConfig.api_mode).toBe("anthropic_messages");

    // gemini_native not native — falls back to chat_completions
    const gemini = applyProviderApiFormat(provider, "hermes", "gemini_native");
    expect(gemini.settingsConfig.api_mode).toBe("chat_completions");

    const promoted = applyProviderModel(
      provider,
      "hermes",
      "claude-sonnet-5",
    );
    expect(promoted).not.toBeNull();
    expect(promoted!.settingsConfig.models[0].id).toBe("claude-sonnet-5");
    expect(promoted!.settingsConfig.models[1].id).toBe("gpt-5.5");
    expect(promoted!.settingsConfig.models[1].context_length).toBe(128000);
  });

  it("applies OpenClaw primary model by reordering models[]", () => {
    const provider = makeOpenClawProvider();
    expect(resolveProviderQuickModel(provider, "openclaw")).toBe("gpt-5.5");
    expect(resolveProviderKnownModelIds(provider, "openclaw")).toEqual([
      "gpt-5.5",
      "claude-sonnet-5",
    ]);

    const promoted = applyProviderModel(
      provider,
      "openclaw",
      "claude-sonnet-5",
    );
    expect(promoted).not.toBeNull();
    const models = promoted!.settingsConfig.models as Array<{
      id: string;
      name: string;
      contextWindow?: number;
    }>;
    expect(models[0].id).toBe("claude-sonnet-5");
    expect(models[0].name).toBe("Claude Sonnet 5");
    expect(models[0].contextWindow).toBe(200000);
    expect(models[1].id).toBe("gpt-5.5");
    expect(resolveProviderQuickModel(promoted!, "openclaw")).toBe(
      "claude-sonnet-5",
    );

    const appended = applyProviderModel(provider, "openclaw", "new-model-x");
    expect(appended).not.toBeNull();
    const nextModels = appended!.settingsConfig.models as Array<{
      id: string;
      name: string;
    }>;
    expect(nextModels[0]).toEqual({ id: "new-model-x", name: "new-model-x" });
    expect(nextModels.map((m) => m.id)).toEqual([
      "new-model-x",
      "gpt-5.5",
      "claude-sonnet-5",
    ]);
  });
});
