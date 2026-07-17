/**
 * Apply a selected model id onto a provider config for the given app.
 * Best-effort: Codex TOML model=; Claude/Claude Desktop env ANTHROPIC_MODEL;
 * Gemini env GEMINI_MODEL; OpenCode/OpenClaw leave as no-op when shape unknown.
 */
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { deepClone } from "@/utils/deepClone";
import { setCodexModelName } from "@/utils/providerConfigUtils";
import {
  parseGrokBuildConfig,
  updateGrokBuildConfig,
} from "@/utils/grokBuildConfig";

export function applyProviderModel(
  provider: Provider,
  appId: AppId,
  modelId: string,
): Provider | null {
  const trimmed = modelId.trim();
  if (!trimmed) return null;

  const next = deepClone(provider) as Provider;
  const settings = (next.settingsConfig ?? {}) as Record<string, any>;

  if (appId === "codex") {
    const prevConfig =
      typeof settings.config === "string" ? settings.config : "";
    settings.config = setCodexModelName(prevConfig, trimmed);
    next.settingsConfig = settings;
    return next;
  }

  if (appId === "claude" || appId === "claude-desktop") {
    const env =
      settings.env && typeof settings.env === "object" ? { ...settings.env } : {};
    env.ANTHROPIC_MODEL = trimmed;
    // common optional defaults used by some setups
    if (typeof env.ANTHROPIC_DEFAULT_SONNET_MODEL === "string") {
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = trimmed;
    }
    settings.env = env;
    next.settingsConfig = settings;
    return next;
  }

  if (appId === "gemini") {
    const env =
      settings.env && typeof settings.env === "object" ? { ...settings.env } : {};
    env.GEMINI_MODEL = trimmed;
    if (typeof env.GOOGLE_MODEL === "string" || !env.GOOGLE_MODEL) {
      env.GOOGLE_MODEL = trimmed;
    }
    settings.env = env;
    next.settingsConfig = settings;
    return next;
  }

  if (appId === "grokbuild") {
    const prevConfig =
      typeof settings.config === "string" ? settings.config : "";
    const parsed = parseGrokBuildConfig(prevConfig, next.name || "");
    // Keep selected profile when possible; always update the upstream model id.
    settings.config = updateGrokBuildConfig(prevConfig, {
      ...parsed,
      upstreamModel: trimmed,
      model: parsed.model || trimmed,
      name: parsed.name || next.name || trimmed,
    });
    next.settingsConfig = settings;
    return next;
  }

  // Generic fallback: write common model fields when present
  if (settings.env && typeof settings.env === "object") {
    const env = { ...settings.env };
    if ("ANTHROPIC_MODEL" in env) env.ANTHROPIC_MODEL = trimmed;
    if ("OPENAI_MODEL" in env) env.OPENAI_MODEL = trimmed;
    if ("MODEL" in env) env.MODEL = trimmed;
    settings.env = env;
    next.settingsConfig = settings;
    return next;
  }

  if (typeof settings.model === "string") {
    settings.model = trimmed;
    next.settingsConfig = settings;
    return next;
  }

  // Codex-like nested config string without app being codex
  if (typeof settings.config === "string" && /model\s*=/.test(settings.config)) {
    settings.config = setCodexModelName(settings.config, trimmed);
    next.settingsConfig = settings;
    return next;
  }

  return null;
}
