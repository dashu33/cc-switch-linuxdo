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
  "openclaw",
  "gemini",
  "opencode",
  "hermes",
];

export function supportsProviderQuickAdjust(appId: AppId): boolean {
  return PROVIDER_QUICK_ADJUST_APP_IDS.includes(appId);
}

export function isClaudeFamilyApp(appId: AppId): boolean {
  return appId === "claude" || appId === "claude-desktop";
}

export function isOpenClawApp(appId: AppId): boolean {
  return appId === "openclaw";
}

export function isGeminiApp(appId: AppId): boolean {
  return appId === "gemini";
}

export function isOpenCodeApp(appId: AppId): boolean {
  return appId === "opencode";
}

export function isHermesApp(appId: AppId): boolean {
  return appId === "hermes";
}

/**
 * Apps that talk to upstream with their own protocol field (no local proxy
 * conversion). Card labels therefore omit "需开启路由".
 */
export function usesDirectUpstreamFormat(appId: AppId): boolean {
  return isOpenClawApp(appId) || isOpenCodeApp(appId) || isHermesApp(appId);
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

/** Map OpenClaw native `api` protocol → card format value. */
export function openclawApiFormatFromProtocol(
  api: string | undefined,
): ProviderQuickApiFormat {
  const normalized = (api || "").trim().toLowerCase();
  if (
    normalized === "openai-completions" ||
    normalized === "openai_chat" ||
    normalized === "openai-chat"
  ) {
    return "openai_chat";
  }
  if (
    normalized === "openai-responses" ||
    normalized === "openai_responses" ||
    normalized === "responses"
  ) {
    return "openai_responses";
  }
  if (
    normalized === "anthropic-messages" ||
    normalized === "anthropic" ||
    normalized === "anthropic_messages"
  ) {
    return "anthropic";
  }
  if (
    normalized === "google-generative-ai" ||
    normalized === "gemini_native" ||
    normalized === "gemini-native" ||
    normalized === "google"
  ) {
    return "gemini_native";
  }
  // bedrock-converse-stream and unknown → treat as chat-compatible default
  return "openai_chat";
}

/** Map card format value → OpenClaw native `api` protocol. */
export function openclawProtocolFromApiFormat(
  format: ProviderQuickApiFormat,
): string {
  if (format === "openai_responses") return "openai-responses";
  if (format === "anthropic") return "anthropic-messages";
  if (format === "gemini_native") return "google-generative-ai";
  return "openai-completions";
}

/** Map OpenCode `npm` package → card format value. */
export function opencodeApiFormatFromNpm(
  npm: string | undefined,
): ProviderQuickApiFormat {
  const normalized = (npm || "").trim().toLowerCase();
  // Order matters: openai-compatible must win over bare "openai" substring.
  if (
    normalized === "@ai-sdk/openai-compatible" ||
    normalized.endsWith("/openai-compatible") ||
    normalized.includes("openai-compatible")
  ) {
    return "openai_chat";
  }
  if (
    normalized === "@ai-sdk/openai" ||
    normalized === "openai" ||
    normalized.endsWith("/openai")
  ) {
    return "openai_responses";
  }
  if (
    normalized === "@ai-sdk/anthropic" ||
    normalized.endsWith("/anthropic") ||
    normalized.includes("anthropic")
  ) {
    return "anthropic";
  }
  if (
    normalized === "@ai-sdk/google" ||
    normalized.endsWith("/google") ||
    normalized.includes("gemini")
  ) {
    return "gemini_native";
  }
  // amazon-bedrock and unknown → chat-compatible default
  return "openai_chat";
}

/** Map card format → OpenCode `npm` package. */
export function opencodeNpmFromApiFormat(
  format: ProviderQuickApiFormat,
): string {
  if (format === "openai_responses") return "@ai-sdk/openai";
  if (format === "anthropic") return "@ai-sdk/anthropic";
  if (format === "gemini_native") return "@ai-sdk/google";
  return "@ai-sdk/openai-compatible";
}

/** Map Hermes `api_mode` → card format value. */
export function hermesApiFormatFromMode(
  mode: string | undefined,
): ProviderQuickApiFormat {
  const normalized = (mode || "").trim().toLowerCase();
  if (
    normalized === "codex_responses" ||
    normalized === "openai_responses" ||
    normalized === "responses"
  ) {
    return "openai_responses";
  }
  if (
    normalized === "anthropic_messages" ||
    normalized === "anthropic" ||
    normalized === "messages"
  ) {
    return "anthropic";
  }
  // chat_completions, bedrock_converse, unknown → chat-compatible
  return "openai_chat";
}

/** Map card format → Hermes `api_mode`. */
export function hermesModeFromApiFormat(
  format: ProviderQuickApiFormat,
): string {
  if (format === "openai_responses") return "codex_responses";
  if (format === "anthropic") return "anthropic_messages";
  // gemini_native not native to Hermes custom_providers — fall back to chat
  return "chat_completions";
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

function listOpenClawModelIds(provider: Provider): string[] {
  const settings = asRecord(provider.settingsConfig);
  const models = Array.isArray(settings.models) ? settings.models : [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of models) {
    const id =
      typeof entry === "string"
        ? entry.trim()
        : typeof asRecord(entry).id === "string"
          ? String(asRecord(entry).id).trim()
          : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function listOpenCodeModelIds(provider: Provider): string[] {
  const settings = asRecord(provider.settingsConfig);
  const models = asRecord(settings.models);
  return Object.keys(models).filter((id) => id.trim().length > 0);
}

/** Hermes custom_providers models is an array like OpenClaw. */
function listHermesModelIds(provider: Provider): string[] {
  return listOpenClawModelIds(provider);
}

/**
 * Resolve the effective upstream format shown on the provider card.
 * Prefer explicit meta.apiFormat; fall back to app-native config hints.
 *
 * OpenClaw prefers native `settingsConfig.api` over meta (client protocol is
 * the source of truth; meta is only kept as a portable mirror).
 */
export function resolveProviderApiFormat(
  provider: Provider,
  appId: AppId,
): ProviderQuickApiFormat {
  if (isOpenClawApp(appId)) {
    const settings = asRecord(provider.settingsConfig);
    const nativeApi =
      typeof settings.api === "string" ? settings.api.trim() : "";
    if (nativeApi) {
      return openclawApiFormatFromProtocol(nativeApi);
    }
    const metaFormat = provider.meta?.apiFormat;
    if (
      metaFormat === "openai_chat" ||
      metaFormat === "openai_responses" ||
      metaFormat === "anthropic" ||
      metaFormat === "gemini_native"
    ) {
      return metaFormat;
    }
    return "openai_chat";
  }

  if (isOpenCodeApp(appId)) {
    const settings = asRecord(provider.settingsConfig);
    const npm = typeof settings.npm === "string" ? settings.npm.trim() : "";
    if (npm) {
      return opencodeApiFormatFromNpm(npm);
    }
    const metaFormat = provider.meta?.apiFormat;
    if (
      metaFormat === "openai_chat" ||
      metaFormat === "openai_responses" ||
      metaFormat === "anthropic" ||
      metaFormat === "gemini_native"
    ) {
      return metaFormat;
    }
    return "openai_chat";
  }

  if (isHermesApp(appId)) {
    const settings = asRecord(provider.settingsConfig);
    const mode =
      typeof settings.api_mode === "string" ? settings.api_mode.trim() : "";
    if (mode) {
      return hermesApiFormatFromMode(mode);
    }
    const metaFormat = provider.meta?.apiFormat;
    if (
      metaFormat === "openai_chat" ||
      metaFormat === "openai_responses" ||
      metaFormat === "anthropic" ||
      metaFormat === "gemini_native"
    ) {
      return metaFormat;
    }
    return "openai_chat";
  }

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

  if (isGeminiApp(appId)) {
    // Gemini CLI native wire format when meta is absent.
    return "gemini_native";
  }

  // Claude family defaults to Anthropic Messages.
  return "anthropic";
}

/**
 * Whether the provider likely needs local-proxy format conversion.
 * Direct Responses/Anthropic-native/Gemini-native paths do not need the badge.
 * OpenClaw has no local proxy takeover — never needs routing badge.
 */
export function providerNeedsRouting(
  provider: Provider,
  appId: AppId,
): boolean {
  if (isOpenClawApp(appId) || isOpenCodeApp(appId) || isHermesApp(appId)) {
    return false;
  }

  if (appId === "codex" || appId === "grokbuild") {
    const format = resolveProviderApiFormat(provider, appId);
    return format === "openai_chat" || format === "anthropic";
  }

  if (isClaudeFamilyApp(appId)) {
    const format = resolveProviderApiFormat(provider, appId);
    return Boolean(format && format !== "anthropic");
  }

  if (isGeminiApp(appId)) {
    const format = resolveProviderApiFormat(provider, appId);
    return Boolean(format && format !== "gemini_native");
  }

  return false;
}

/**
 * Persist upstream format. Always writes meta.apiFormat.
 *
 * Grok Build under CC Switch always talks to the local proxy via the
 * Responses endpoint (`/grokbuild/v1/responses`). Chat/Anthropic selections
 * only describe the *upstream* wire format for proxy conversion — the client
 * side `api_backend` must stay `responses`, otherwise Grok hits a missing
 * `/chat/completions` route on the proxy and conversion never runs.
 *
 * OpenClaw writes native `settingsConfig.api` (client protocol) plus meta
 * mirror; there is no proxy conversion layer.
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
      // Client protocol to local proxy — always Responses.
      apiBackend: "responses",
    });
    next.settingsConfig = settings;
  }

  if (isOpenClawApp(appId)) {
    const settings = asRecord(next.settingsConfig);
    settings.api = openclawProtocolFromApiFormat(format);
    next.settingsConfig = settings;
  }

  if (isOpenCodeApp(appId)) {
    const settings = asRecord(next.settingsConfig);
    settings.npm = opencodeNpmFromApiFormat(format);
    next.settingsConfig = settings;
  }

  if (isHermesApp(appId)) {
    const settings = asRecord(next.settingsConfig);
    settings.api_mode = hermesModeFromApiFormat(format);
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

  if (isGeminiApp(appId)) {
    const env = asRecord(settings.env);
    if (typeof env.GEMINI_MODEL === "string" && env.GEMINI_MODEL.trim()) {
      return env.GEMINI_MODEL.trim();
    }
    if (typeof env.GOOGLE_MODEL === "string" && env.GOOGLE_MODEL.trim()) {
      return env.GOOGLE_MODEL.trim();
    }
    return "";
  }

  if (isOpenClawApp(appId)) {
    return listOpenClawModelIds(provider)[0] || "";
  }

  if (isOpenCodeApp(appId)) {
    return listOpenCodeModelIds(provider)[0] || "";
  }

  if (isHermesApp(appId)) {
    return listHermesModelIds(provider)[0] || "";
  }

  return "";
}

/**
 * Extra model ids already present in provider config (for card dropdown).
 * OpenClaw/OpenCode/Hermes expose the full model list so users can pick without re-fetch.
 */
export function resolveProviderKnownModelIds(
  provider: Provider,
  appId: AppId,
): string[] {
  if (isOpenClawApp(appId) || isHermesApp(appId)) {
    return listOpenClawModelIds(provider);
  }
  if (isOpenCodeApp(appId)) {
    return listOpenCodeModelIds(provider);
  }
  const current = resolveProviderQuickModel(provider, appId);
  return current ? [current] : [];
}
