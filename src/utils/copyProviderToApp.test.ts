import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import {
  convertProviderToApp,
  extractPortableCredentials,
  generateUniqueProviderKey,
  getCopyTargetApps,
  normalizeCodexBaseUrl,
  normalizeClaudeBaseUrl,
  slugifyProviderKey,
} from "./copyProviderToApp";

function makeClaudeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "claude-1",
    name: "My Claude Proxy",
    category: "third_party",
    websiteUrl: "https://example.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_AUTH_TOKEN: "sk-test-key",
        ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
      },
    },
    meta: {
      authBinding: {
        source: "provider_config",
      },
      providerType: "github_copilot",
    },
    ...overrides,
  };
}

describe("slugifyProviderKey / generateUniqueProviderKey", () => {
  it("slugifies free-form names", () => {
    expect(slugifyProviderKey("My Claude Proxy!")).toBe("my-claude-proxy");
    expect(slugifyProviderKey("  ")).toBe("provider");
  });

  it("avoids collisions with -copy and numbered suffixes", () => {
    expect(generateUniqueProviderKey("alpha", [])).toBe("alpha");
    expect(generateUniqueProviderKey("alpha", ["alpha"])).toBe("alpha-copy");
    expect(
      generateUniqueProviderKey("alpha", ["alpha", "alpha-copy"]),
    ).toBe("alpha-copy-2");
  });
});

describe("normalizeCodexBaseUrl", () => {
  it("appends /v1 for origin-only hosts", () => {
    expect(normalizeCodexBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com/v1",
    );
    expect(normalizeCodexBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com/v1",
    );
  });

  it("keeps existing paths", () => {
    expect(normalizeCodexBaseUrl("https://api.example.com/openai/v1")).toBe(
      "https://api.example.com/openai/v1",
    );
  });
});

describe("normalizeClaudeBaseUrl", () => {
  it("strips trailing /v1", () => {
    expect(normalizeClaudeBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com",
    );
    expect(normalizeClaudeBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com",
    );
  });

  it("keeps non-v1 paths and origins", () => {
    expect(normalizeClaudeBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
    expect(normalizeClaudeBaseUrl("https://api.example.com/openai")).toBe(
      "https://api.example.com/openai",
    );
  });
});

describe("extractPortableCredentials", () => {
  it("reads Claude env fields", () => {
    const provider = makeClaudeProvider();
    expect(extractPortableCredentials(provider, "claude")).toEqual({
      baseUrl: "https://api.example.com",
      apiKey: "sk-test-key",
      model: "claude-sonnet-4-20250514",
    });
  });

  it("reads Codex auth + toml config", () => {
    const provider: Provider = {
      id: "codex-1",
      name: "Codex Proxy",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-codex" },
        config: `model_provider = "custom"
model = "gpt-5.5"

[model_providers.custom]
name = "custom"
base_url = "https://codex.example.com/v1"
wire_api = "responses"
`,
      },
    };
    expect(extractPortableCredentials(provider, "codex")).toEqual({
      baseUrl: "https://codex.example.com/v1",
      apiKey: "sk-codex",
      model: "gpt-5.5",
    });
  });
});

describe("convertProviderToApp", () => {
  it("converts Claude provider into Codex settings", () => {
    const source = makeClaudeProvider();
    const result = convertProviderToApp(source, "claude", "codex");

    expect(result.name).toBe("My Claude Proxy");
    expect(result.category).toBe("third_party");
    expect(result.websiteUrl).toBe("https://example.com");
    expect(result.providerKey).toBeUndefined();
    expect(result.addToLive).toBeUndefined();

    const auth = result.settingsConfig.auth as Record<string, string>;
    expect(auth.OPENAI_API_KEY).toBe("sk-test-key");

    const configText = String(result.settingsConfig.config);
    expect(configText).toContain('base_url = "https://api.example.com/v1"');
    expect(configText).toContain('model = "claude-sonnet-4-20250514"');

    // Non-portable meta should be stripped.
    expect(result.meta?.authBinding).toBeUndefined();
    expect(result.meta?.providerType).toBeUndefined();
  });

  it("converts Claude provider into additive OpenCode payload", () => {
    const source = makeClaudeProvider({ name: "OpenRouter CN" });
    const result = convertProviderToApp(source, "claude", "opencode", {
      existingTargetKeys: ["openrouter-cn"],
    });

    expect(result.providerKey).toBe("openrouter-cn-copy");
    expect(result.addToLive).toBe(false);
    expect(result.settingsConfig).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      name: "OpenRouter CN",
      options: {
        baseURL: "https://api.example.com",
        apiKey: "sk-test-key",
      },
    });
  });

  it("maps official category to third_party on the destination", () => {
    const source = makeClaudeProvider({ category: "official" });
    const result = convertProviderToApp(source, "claude", "gemini");
    expect(result.category).toBe("third_party");
    expect(result.settingsConfig).toEqual({
      env: {
        GOOGLE_GEMINI_BASE_URL: "https://api.example.com",
        GEMINI_API_KEY: "sk-test-key",
        GEMINI_MODEL: "claude-sonnet-4-20250514",
      },
    });
  });

  it("converts Codex provider into Claude with stripped /v1 and anthropic format", () => {
    const source: Provider = {
      id: "codex-1",
      name: "My Codex Proxy",
      category: "third_party",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-codex" },
        config: `model_provider = "custom"
model = "gpt-5.5"

[model_providers.custom]
name = "custom"
base_url = "https://proxy.example.com/v1"
wire_api = "responses"
`,
      },
      meta: {
        apiFormat: "openai_responses",
      },
    };

    const result = convertProviderToApp(source, "codex", "claude");

    expect(result.settingsConfig).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://proxy.example.com",
        ANTHROPIC_AUTH_TOKEN: "sk-codex",
        ANTHROPIC_MODEL: "gpt-5.5",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "gpt-5.5",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "gpt-5.5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "gpt-5.5",
      },
    });
    expect(result.meta?.apiFormat).toBe("anthropic");
  });

  it("converts Claude provider into Grok Build toml settings", () => {
    const source = makeClaudeProvider({ name: "Grok Gateway" });
    const result = convertProviderToApp(source, "claude", "grokbuild");

    expect(result.providerKey).toBeUndefined();
    expect(result.addToLive).toBeUndefined();
    expect(result.meta?.apiFormat).toBe("openai_responses");

    const configText = String(result.settingsConfig.config);
    expect(configText).toContain('[models]');
    expect(configText).toContain('default = "claude-sonnet-4-20250514"');
    expect(configText).toContain('base_url = "https://api.example.com/v1"');
    expect(configText).toContain('api_key = "sk-test-key"');
    expect(configText).toContain('name = "Grok Gateway"');
    expect(configText).toContain('api_backend = "responses"');
    expect(configText).toContain("context_window = 500000");
  });

  it("reads Grok Build credentials from provider-owned toml", () => {
    const provider: Provider = {
      id: "grok-1",
      name: "My Grok Provider",
      settingsConfig: {
        config: `[models]
default = "proxy-main"

[model.proxy-main]
model = "grok-4.5"
base_url = "https://grok.example.com/v1"
name = "My Grok Provider"
api_key = "sk-grok"
api_backend = "responses"
context_window = 500000
`,
      },
    };

    expect(extractPortableCredentials(provider, "grokbuild")).toEqual({
      baseUrl: "https://grok.example.com/v1",
      apiKey: "sk-grok",
      model: "grok-4.5",
    });
  });

  it("converts Codex provider into Grok Build with /v1 base_url", () => {
    const source: Provider = {
      id: "codex-1",
      name: "Codex Proxy",
      settingsConfig: {
        auth: { OPENAI_API_KEY: "sk-codex" },
        config: `model_provider = "custom"
model = "gpt-5.5"

[model_providers.custom]
name = "custom"
base_url = "https://codex.example.com/v1"
wire_api = "responses"
`,
      },
      meta: {
        apiFormat: "openai_responses",
      },
    };

    const result = convertProviderToApp(source, "codex", "grokbuild");
    const configText = String(result.settingsConfig.config);

    expect(configText).toContain('base_url = "https://codex.example.com/v1"');
    expect(configText).toContain('api_backend = "responses"');
    expect(configText).toContain('api_key = "sk-codex"');
    expect(result.meta?.apiFormat).toBe("openai_responses");
  });

  it("pads origin-only base_url with /v1 when copying into Grok Build", () => {
    const source = makeClaudeProvider({
      name: "Origin Only Gateway",
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: "https://gateway.example.com",
          ANTHROPIC_AUTH_TOKEN: "sk-origin",
          ANTHROPIC_MODEL: "gpt-5.5",
        },
      },
    });

    const result = convertProviderToApp(source, "claude", "grokbuild");
    const configText = String(result.settingsConfig.config);

    expect(configText).toContain('base_url = "https://gateway.example.com/v1"');
    expect(configText).toContain('api_backend = "responses"');
  });

  it("rejects same-app conversion", () => {
    expect(() =>
      convertProviderToApp(makeClaudeProvider(), "claude", "claude"),
    ).toThrow(/must differ/i);
  });
});

describe("getCopyTargetApps", () => {
  it("excludes the current app and hidden apps", () => {
    const targets = getCopyTargetApps("claude", {
      claude: true,
      codex: true,
      gemini: false,
      opencode: true,
    });

    expect(targets).not.toContain("claude");
    expect(targets).toContain("codex");
    expect(targets).toContain("opencode");
    expect(targets).not.toContain("gemini");
  });
});

