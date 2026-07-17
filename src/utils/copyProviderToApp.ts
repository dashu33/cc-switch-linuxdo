/**
 * Cross-app provider copy helpers.
 *
 * Extracts the portable fields (API base URL / key / model / branding)
 * from a provider under one AppId and rebuilds a valid settingsConfig for
 * another AppId so users can right-click "Copy to Codex / Claude / ...".
 */

import type { AppId } from "@/lib/api/types";
import type { Provider, ProviderMeta } from "@/types";
import { generateThirdPartyAuth, generateThirdPartyConfig } from "@/config/codexProviderPresets";
import { APP_IDS } from "@/config/appConfig";
import { deepClone } from "@/utils/deepClone";
import {
  extractCodexBaseUrl,
  extractCodexExperimentalBearerToken,
  extractCodexModelName,
} from "@/utils/providerConfigUtils";
import {
  buildGrokBuildConfig,
  GROK_BUILD_DEFAULT_API_BACKEND,
  GROK_BUILD_DEFAULT_CONTEXT_WINDOW,
  GROK_BUILD_DEFAULT_MODEL,
  parseGrokBuildConfig,
} from "@/utils/grokBuildConfig";

export const COPYABLE_APP_IDS: AppId[] = [...APP_IDS];

export interface PortableProviderCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ConvertedProviderPayload {
  name: string;
  settingsConfig: Record<string, unknown>;
  websiteUrl?: string;
  category?: Provider["category"];
  notes?: string;
  meta?: ProviderMeta;
  icon?: string;
  iconColor?: string;
  /** Required by OpenCode / OpenClaw / Hermes additive-mode apps. */
  providerKey?: string;
  addToLive?: boolean;
}

const DEFAULT_MODELS: Partial<Record<AppId, string>> = {
  claude: "claude-sonnet-4-20250514",
  "claude-desktop": "claude-sonnet-4-20250514",
  codex: "gpt-5.5",
  gemini: "gemini-3.5-flash",
  opencode: "gpt-5.5",
  openclaw: "gpt-5.5",
  hermes: "gpt-5.5",
  grokbuild: GROK_BUILD_DEFAULT_MODEL,
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

/** Sanitize a free-form name into an additive-mode provider key. */
export function slugifyProviderKey(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "provider";
}

export function generateUniqueProviderKey(
  preferred: string,
  existingKeys: string[],
): string {
  const base = slugifyProviderKey(preferred);
  if (!existingKeys.includes(base)) return base;

  const copyBase = `${base}-copy`;
  if (!existingKeys.includes(copyBase)) return copyBase;

  let counter = 2;
  while (existingKeys.includes(`${copyBase}-${counter}`)) {
    counter += 1;
  }
  return `${copyBase}-${counter}`;
}

/**
 * Normalize a base URL for Codex-style OpenAI-compatible endpoints.
 * Origin-only hosts get `/v1`; existing paths (including custom prefixes) are kept.
 */
export function normalizeCodexBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  const withoutScheme = trimmed.includes("://")
    ? trimmed.split("://", 2)[1]
    : trimmed;
  const originOnly = !withoutScheme.includes("/");
  if (originOnly) return `${trimmed}/v1`;
  return trimmed;
}

/**
 * Normalize a base URL for Claude / Anthropic-compatible endpoints.
 * Claude expects the origin (or custom prefix) without a trailing `/v1`,
 * because the client appends `/v1/messages` itself.
 */
export function normalizeClaudeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.replace(/\/v1$/i, "");
}

/** Drop app-specific meta that would mislead the destination agent. */
function sanitizeMetaForTarget(
  meta: ProviderMeta | undefined,
  targetApp: AppId,
): ProviderMeta | undefined {
  if (!meta) return undefined;

  const next: ProviderMeta = deepClone(meta);

  // Auth bindings are account-specific and rarely portable across apps.
  delete next.authBinding;
  delete next.githubAccountId;

  // Claude Desktop route tables only make sense on Claude Desktop.
  if (targetApp !== "claude-desktop") {
    delete next.claudeDesktopMode;
    delete next.claudeDesktopModelRoutes;
  } else if (!next.claudeDesktopMode) {
    next.claudeDesktopMode = "proxy";
  }

  // Provider-type OAuth markers usually don't transfer cleanly.
  if (
    next.providerType === "github_copilot" ||
    next.providerType === "codex_oauth"
  ) {
    delete next.providerType;
  }

  return next;
}

export function extractPortableCredentials(
  provider: Provider,
  sourceApp: AppId,
): PortableProviderCredentials {
  const config = asRecord(provider.settingsConfig);
  const env = asRecord(config.env);

  if (sourceApp === "claude" || sourceApp === "claude-desktop") {
    return {
      baseUrl: firstString(env.ANTHROPIC_BASE_URL),
      apiKey: firstString(
        env.ANTHROPIC_AUTH_TOKEN,
        env.ANTHROPIC_API_KEY,
        config.apiKey,
      ),
      model: firstString(
        env.ANTHROPIC_MODEL,
        env.ANTHROPIC_DEFAULT_SONNET_MODEL,
        env.ANTHROPIC_DEFAULT_OPUS_MODEL,
        env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      ),
    };
  }

  if (sourceApp === "codex") {
    const configText =
      typeof config.config === "string" ? config.config : undefined;
    const auth = asRecord(config.auth);
    return {
      baseUrl: firstString(extractCodexBaseUrl(configText)),
      apiKey: firstString(
        auth.OPENAI_API_KEY,
        extractCodexExperimentalBearerToken(configText),
      ),
      model: firstString(extractCodexModelName(configText)),
    };
  }

  if (sourceApp === "gemini") {
    return {
      baseUrl: firstString(env.GOOGLE_GEMINI_BASE_URL),
      apiKey: firstString(env.GEMINI_API_KEY, config.apiKey),
      model: firstString(env.GEMINI_MODEL),
    };
  }

  if (sourceApp === "opencode") {
    const options = asRecord(config.options);
    const models = asRecord(config.models);
    const firstModelId = Object.keys(models)[0] ?? "";
    return {
      baseUrl: firstString(options.baseURL, options.baseUrl),
      apiKey: firstString(options.apiKey, options.api_key),
      model: firstString(firstModelId, asRecord(models[firstModelId]).name),
    };
  }

  if (sourceApp === "openclaw") {
    const models = Array.isArray(config.models) ? config.models : [];
    const firstModel = asRecord(models[0]);
    return {
      baseUrl: firstString(config.baseUrl, config.baseURL),
      apiKey: firstString(config.apiKey, config.api_key),
      model: firstString(firstModel.id, firstModel.name),
    };
  }

  if (sourceApp === "hermes") {
    const models = Array.isArray(config.models) ? config.models : [];
    const firstModel = asRecord(models[0]);
    return {
      baseUrl: firstString(config.base_url, config.baseUrl),
      apiKey: firstString(config.api_key, config.apiKey),
      model: firstString(firstModel.id, firstModel.name),
    };
  }

  if (sourceApp === "grokbuild") {
    const parsed = parseGrokBuildConfig(
      typeof config.config === "string" ? config.config : undefined,
      firstString(provider.name),
    );
    return {
      baseUrl: firstString(parsed.baseUrl),
      apiKey: firstString(parsed.apiKey),
      model: firstString(parsed.upstreamModel, parsed.model),
    };
  }

  return { baseUrl: "", apiKey: "", model: "" };
}

function buildSettingsConfig(
  targetApp: AppId,
  credentials: PortableProviderCredentials,
  displayName: string,
  providerKey?: string,
): Record<string, unknown> {
  const model =
    credentials.model || DEFAULT_MODELS[targetApp] || "gpt-5.5";
  const baseUrl = credentials.baseUrl;
  const apiKey = credentials.apiKey;

  if (targetApp === "claude" || targetApp === "claude-desktop") {
    const claudeBase = normalizeClaudeBaseUrl(baseUrl);
    return {
      env: {
        ANTHROPIC_BASE_URL: claudeBase || baseUrl,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_MODEL: model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: model,
        ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      },
    };
  }

  if (targetApp === "codex") {
    const codexBase = normalizeCodexBaseUrl(baseUrl);
    const providerLabel = slugifyProviderKey(displayName) || "custom";
    return {
      auth: generateThirdPartyAuth(apiKey),
      config: generateThirdPartyConfig(providerLabel, codexBase || baseUrl, model),
    };
  }

  if (targetApp === "gemini") {
    return {
      env: {
        GOOGLE_GEMINI_BASE_URL: baseUrl,
        GEMINI_API_KEY: apiKey,
        GEMINI_MODEL: model,
      },
    };
  }

  if (targetApp === "opencode") {
    return {
      npm: "@ai-sdk/openai-compatible",
      name: displayName,
      options: {
        baseURL: baseUrl,
        apiKey,
      },
      models: {
        [model]: {
          name: model,
        },
      },
    };
  }

  if (targetApp === "openclaw") {
    return {
      baseUrl,
      apiKey,
      api: "openai-completions",
      models: [
        {
          id: model,
          name: model,
        },
      ],
    };
  }

  if (targetApp === "hermes") {
    return {
      name: providerKey || slugifyProviderKey(displayName),
      base_url: baseUrl,
      api_key: apiKey,
      api_mode: "chat_completions",
      models: [
        {
          id: model,
          name: model,
        },
      ],
    };
  }

  if (targetApp === "grokbuild") {
    // Grok Build stores a provider-owned TOML document under settingsConfig.config.
    // Required fields: [models].default, [model.<profile>].{model,base_url,name,api_key|env_key,api_backend,context_window}
    // Same OpenAI-compatible base_url semantics as Codex: origin-only hosts need /v1
    // because the client appends /responses (or /chat/completions) itself.
    const profile = model || GROK_BUILD_DEFAULT_MODEL;
    const grokBase = normalizeCodexBaseUrl(baseUrl);
    return {
      config: buildGrokBuildConfig({
        model: profile,
        upstreamModel: profile,
        baseUrl: grokBase || baseUrl,
        name: displayName || profile,
        apiKey,
        apiBackend: GROK_BUILD_DEFAULT_API_BACKEND,
        contextWindow: GROK_BUILD_DEFAULT_CONTEXT_WINDOW,
      }),
    };
  }

  return {};
}

/**
 * Convert a provider from sourceApp into a payload ready for add_provider
 * under targetApp. Does not call the backend.
 */
export function convertProviderToApp(
  provider: Provider,
  sourceApp: AppId,
  targetApp: AppId,
  options?: {
    existingTargetKeys?: string[];
  },
): ConvertedProviderPayload {
  if (sourceApp === targetApp) {
    throw new Error("Source and target app must differ");
  }

  const credentials = extractPortableCredentials(provider, sourceApp);
  const existingKeys = options?.existingTargetKeys ?? [];
  const isAdditive =
    targetApp === "opencode" ||
    targetApp === "openclaw" ||
    targetApp === "hermes";

  const providerKey = isAdditive
    ? generateUniqueProviderKey(
        provider.name || provider.id || "provider",
        existingKeys,
      )
    : undefined;

  // Prefer a non-official category when copying: official configs rarely
  // have portable credentials, and the destination should be editable.
  const category =
    provider.category && provider.category !== "official"
      ? provider.category
      : "third_party";

  const meta = sanitizeMetaForTarget(provider.meta, targetApp) ?? {};

  // Codex/OpenAI-compatible sources usually carry Responses/Chat formats.
  // When copying into Claude, force Anthropic Messages so the proxy/client
  // does not keep treating the destination as OpenAI-compatible.
  if (targetApp === "claude" || targetApp === "claude-desktop") {
    meta.apiFormat = "anthropic";
  }

  // Grok Build proxies OpenAI-compatible gateways by default. If the source
  // was Anthropic-only, fall back to Responses so the destination is usable.
  if (targetApp === "grokbuild") {
    if (meta.apiFormat !== "openai_chat" && meta.apiFormat !== "openai_responses") {
      meta.apiFormat = "openai_responses";
    }
  }

  return {
    name: provider.name,
    settingsConfig: buildSettingsConfig(
      targetApp,
      credentials,
      provider.name,
      providerKey,
    ),
    websiteUrl: provider.websiteUrl,
    category,
    notes: provider.notes,
    meta,
    icon: provider.icon,
    iconColor: provider.iconColor,
    providerKey,
    // Keep additive apps as list-only until the user explicitly enables them.
    addToLive: isAdditive ? false : undefined,
  };
}

export function getCopyTargetApps(
  currentApp: AppId,
  visibleApps?: Partial<Record<AppId, boolean>>,
): AppId[] {
  return COPYABLE_APP_IDS.filter((app) => {
    if (app === currentApp) return false;
    if (!visibleApps) return true;
    // Undefined means visible (same default as App.tsx).
    return visibleApps[app] !== false;
  });
}

