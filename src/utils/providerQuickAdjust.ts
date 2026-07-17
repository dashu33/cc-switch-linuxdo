/**
 * Global provider quick-adjust helpers.
 *
 * App-specific config formats stay different, but card-level UX shares:
 * - which apps support inline format/model/fetch
 * - how to resolve current upstream format
 * - whether the provider "needs routing" (local proxy conversion)
 * - how to persist format changes (meta + app-native side fields)
 */
import type { ClaudeApiFormat, CodexApiFormat, Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { deepClone } from "@/utils/deepClone";
import {
  codexApiFormatFromWireApi,
  extractCodexModelName,
  extractCodexWireApi,
} from "@/utils/providerConfigUtils";
import {
  parseGrokBuildConfig,
  updateGrokBuildConfig,
} from "@/utils/grokBuildConfig";

export type ProviderQuickApiFormat = ClaudeApiFormat | CodexApiFormat;

/** Apps that show the card-level format/model/fetch controls. */
export const PROVIDER_QUICK_ADJUST_APP_IDS: AppId[] = [
  "codex",
  "claude",
  "claude-desktop",
  "grokbuild",
];

export function supportsProviderQuickAdjust(appId: AppId): boolean {
  return PROVIDER_QUICK_ADJUST_APP_IDS.includes(appId);
}

export function isClaudeFamilyApp(appId: AppId): boolean {
  return appId === "claude" || appId === "claude-desktop";
}

export function grokApiBackendFromApiFormat(
  format: ProviderQuickApiFormat,
): string {
  if (format === "openai_chat") return "chat_completions";
  if (format === "anthropic") return "messages";
  return "responses";
}

export function grokApiFormatFromBackend(
  apiBackend: string | undefined,
): ProviderQuickApiFormat {
  const normalized = (apiBackend || "").trim().toLowerCase();
  if (
    normalized === "chat_completions" ||
    normalized === "chat" ||
    normalized === "openai_chat"
  ) {
    return "openai_chat";
  }
  if (
    normalized === "messages" ||
    normalized === "anthropic" ||
    normalized === "anthropic_messages"
  ) {
    return "anthropic";
  }
  return "openai_responses";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function getConfigText(provider: Provider): string {
  const config = asRecord(provider.settingsConfig).config;
  return typeof config === "string" ? config : "";
}

/**
 * Resolve the effective upstream format shown on the provider card.
 * Prefer explicit meta.apiFormat; fall back to app-native config hints.
 */
export function resolveProviderApiFormat(
  provider: Provider,
  appId: AppId,
): ProviderQuickApiFormat {
  const metaFormat = provider.meta?.apiFormat;
  if (
    metaFormat === "openai_chat" ||
    metaFormat === "openai_responses" ||
    metaFormat === "anthropic" ||
    metaFormat === "gemini_native"
  ) {
    // Codex/Grok quick UI does not expose gemini_native; collapse safely.
    if (
      (appId === "codex" || appId === "grokbuild") &&
      metaFormat === "gemini_native"
    ) {
      return "openai_responses";
    }
    return metaFormat;
  }

  if (appId === "codex") {
    return (
      codexApiFormatFromWireApi(extractCodexWireApi(getConfigText(provider))) ??
      "openai_responses"
    );
  }

  if (appId === "grokbuild") {
    const parsed = parseGrokBuildConfig(getConfigText(provider), provider.name);
    return grokApiFormatFromBackend(parsed.apiBackend);
  }

  // Claude family defaults to Anthropic Messages.
  return "anthropic";
}

/**
 * Whether the provider likely needs local-proxy format conversion.
 * Direct Responses/Anthropic-native paths do not need the badge.
 */
export function providerNeedsRouting(
  provider: Provider,
  appId: AppId,
): boolean {
  if (appId === "codex" || appId === "grokbuild") {
    const format = resolveProviderApiFormat(provider, appId);
    return format === "openai_chat" || format === "anthropic";
  }

  if (isClaudeFamilyApp(appId)) {
    const format = resolveProviderApiFormat(provider, appId);
    return Boolean(format && format !== "anthropic");
  }

  return false;
}

/**
 * Persist upstream format. Always writes meta.apiFormat.
 * Grok Build also mirrors the choice into native api_backend.
 */
export function applyProviderApiFormat(
  provider: Provider,
  appId: AppId,
  format: ProviderQuickApiFormat,
): Provider {
  const next = deepClone(provider) as Provider;
  next.meta = {
    ...(next.meta ?? {}),
    apiFormat: format,
  };

  if (appId === "grokbuild") {
    const settings = asRecord(next.settingsConfig);
    const configText =
      typeof settings.config === "string" ? settings.config : "";
    const parsed = parseGrokBuildConfig(configText, next.name || "");
    settings.config = updateGrokBuildConfig(configText, {
      ...parsed,
      apiBackend: grokApiBackendFromApiFormat(format),
    });
    next.settingsConfig = settings;
  }

  return next;
}

export function resolveProviderQuickModel(
  provider: Provider,
  appId: AppId,
): string {
  const settings = asRecord(provider.settingsConfig);

  if (appId === "codex") {
    const configText =
      typeof settings.config === "string" ? settings.config : "";
    return extractCodexModelName(configText) || "";
  }

  if (isClaudeFamilyApp(appId)) {
    const env = asRecord(settings.env);
    return typeof env.ANTHROPIC_MODEL === "string"
      ? env.ANTHROPIC_MODEL.trim()
      : "";
  }

  if (appId === "grokbuild") {
    const configText =
      typeof settings.config === "string" ? settings.config : "";
    const parsed = parseGrokBuildConfig(configText, provider.name || "");
    return (parsed.upstreamModel || parsed.model || "").trim();
  }

  return "";
}
