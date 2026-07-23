/**
 * Apply a selected model id onto a provider config for the given app.
 * Best-effort: Codex TOML model=; Claude/Claude Desktop env ANTHROPIC_MODEL;
 * Gemini env GEMINI_MODEL; OpenClaw models[] primary (index 0);
 * OpenCode models map primary (first key).
 */
import type { OpenClawModel, OpenCodeModel, Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { deepClone } from "@/utils/deepClone";
import { setCodexModelName } from "@/utils/providerConfigUtils";
import {
  parseGrokBuildConfig,
  updateGrokBuildConfig,
} from "@/utils/grokBuildConfig";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

/**
 * OpenClaw: index 0 is the primary/default model for "设为默认".
 * - Existing id → move that entry to front (preserve cost/context fields)
 * - New id → prepend `{ id, name: id }`
 */
export function applyOpenClawPrimaryModel(
  settings: Record<string, any>,
  modelId: string,
): void {
  const rawModels = Array.isArray(settings.models) ? settings.models : [];
  const models: OpenClawModel[] = rawModels.map((entry) => {
    if (typeof entry === "string") {
      const id = entry.trim();
      return { id, name: id };
    }
    const rec = asRecord(entry);
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    return {
      ...(rec as OpenClawModel),
      id,
      name:
        typeof rec.name === "string" && rec.name.trim()
          ? rec.name.trim()
          : id,
    };
  });

  const existingIndex = models.findIndex((m) => m.id === modelId);
  if (existingIndex === 0) {
    settings.models = models;
    return;
  }
  if (existingIndex > 0) {
    const [picked] = models.splice(existingIndex, 1);
    models.unshift(picked);
    settings.models = models;
    return;
  }

  models.unshift({ id: modelId, name: modelId });
  settings.models = models;
}

/**
 * OpenCode: models is a Record keyed by model id; first key is treated as primary.
 * Rebuilds the object with the selected id first (preserves other entries).
 */
export function applyOpenCodePrimaryModel(
  settings: Record<string, any>,
  modelId: string,
): void {
  const prev = asRecord(settings.models);
  const next: Record<string, OpenCodeModel> = {};
  const existing = prev[modelId];
  if (existing && typeof existing === "object") {
    next[modelId] = existing as OpenCodeModel;
  } else {
    next[modelId] = { name: modelId };
  }
  for (const [id, entry] of Object.entries(prev)) {
    if (id === modelId) continue;
    if (entry && typeof entry === "object") {
      next[id] = entry as OpenCodeModel;
    }
  }
  settings.models = next;
}

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

  if (appId === "openclaw") {
    applyOpenClawPrimaryModel(settings, trimmed);
    next.settingsConfig = settings;
    return next;
  }

  if (appId === "opencode") {
    applyOpenCodePrimaryModel(settings, trimmed);
    next.settingsConfig = settings;
    return next;
  }

  if (appId === "hermes") {
    // Same array-primary shape as OpenClaw custom providers.
    applyOpenClawPrimaryModel(settings, trimmed);
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
