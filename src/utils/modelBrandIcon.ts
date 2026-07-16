/**
 * Map free-form model ids/names onto existing brand icon keys.
 * Reuses the same icon pack as ProviderIcon / iconInference.
 */

const MODEL_BRAND_RULES: Array<{
  pattern: RegExp;
  icon: string;
  iconColor?: string;
  brand: string;
}> = [
  { brand: "openai", pattern: /\b(gpt|o[1-9]|chatgpt|openai)\b/i, icon: "openai", iconColor: "#10A37F" },
  { brand: "claude", pattern: /\b(claude|anthropic|sonnet|opus|haiku)\b/i, icon: "claude", iconColor: "#D4915D" },
  { brand: "gemini", pattern: /\b(gemini|gemma|google)\b/i, icon: "gemini", iconColor: "#4285F4" },
  { brand: "deepseek", pattern: /\b(deepseek)\b/i, icon: "deepseek", iconColor: "#1E88E5" },
  { brand: "qwen", pattern: /\b(qwen|qwq|tongyi)\b/i, icon: "qwen", iconColor: "#FF6A00" },
  { brand: "kimi", pattern: /\b(kimi|moonshot)\b/i, icon: "kimi", iconColor: "#6366F1" },
  { brand: "zhipu", pattern: /\b(glm|zhipu|chatglm)\b/i, icon: "zhipu", iconColor: "#0F62FE" },
  { brand: "mistral", pattern: /\b(mistral|mixtral|codestral)\b/i, icon: "mistral", iconColor: "#FF7000" },
  { brand: "meta", pattern: /\b(llama|meta-llama|meta)\b/i, icon: "meta", iconColor: "#0081FB" },
  // Grok / xAI: cover grok-*, xai/*, x-ai/*, xai-*, grok4, "Grok 4" etc.
  {
    brand: "grok",
    pattern:
      /(?:^|[^a-z0-9])(?:x[\s\-_./]*ai[\s\-_/]*)?(?:grok|gork)|(?:^|[^a-z0-9])xai(?:$|[^a-z0-9])|(?:^|[^a-z0-9])x-ai(?:$|[^a-z0-9])/i,
    icon: "grok",
    iconColor: "#000000",
  },
  { brand: "minimax", pattern: /\b(minimax|abab)\b/i, icon: "minimax", iconColor: "#FF6B6B" },
  { brand: "doubao", pattern: /\b(doubao|byteplus|volc)\b/i, icon: "doubao", iconColor: "#3B82F6" },
  { brand: "hunyuan", pattern: /\b(hunyuan)\b/i, icon: "hunyuan", iconColor: "#00A4FF" },
  { brand: "cohere", pattern: /\b(cohere|command-r)\b/i, icon: "cohere", iconColor: "#39594D" },
  { brand: "perplexity", pattern: /\b(perplexity|sonar)\b/i, icon: "perplexity", iconColor: "#20808D" },
  { brand: "ollama", pattern: /\b(ollama)\b/i, icon: "ollama", iconColor: "#000000" },
  { brand: "openrouter", pattern: /\b(openrouter)\b/i, icon: "openrouter", iconColor: "#6566F1" },
  { brand: "copilot", pattern: /\b(copilot|github)\b/i, icon: "copilot", iconColor: "#000000" },
  { brand: "azure", pattern: /\b(azure)\b/i, icon: "azure", iconColor: "#0078D4" },
];

export interface ModelBrandIcon {
  brand: string;
  icon: string;
  iconColor?: string;
  /** Preferred / top model id for this brand from the probe list. */
  modelId: string;
  /** All model ids under this brand (probe order preserved). */
  modelIds: string[];
}

function extractVersionScore(modelId: string): number {
  // Prefer higher major.minor.patch-like numbers in the id.
  // Examples: grok-4.20 > grok-4.1 > grok-4 > grok-3
  const matches = [...modelId.matchAll(/(\d+(?:\.\d+){0,3})/g)].map((m) => m[1]);
  if (matches.length === 0) return -1;
  let best = -1;
  for (const raw of matches) {
    const parts = raw.split(".").map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n))) continue;
    // Encode up to 4 segments: major*1e9 + minor*1e6 + patch*1e3 + build
    const score =
      (parts[0] ?? 0) * 1_000_000_000 +
      (parts[1] ?? 0) * 1_000_000 +
      (parts[2] ?? 0) * 1_000 +
      (parts[3] ?? 0);
    if (score > best) best = score;
  }
  return best;
}

function modelTierScore(modelId: string): number {
  const id = modelId.toLowerCase();
  if (/\bopus\b/.test(id)) return 40;
  if (/\bsonnet\b/.test(id)) return 30;
  if (/\bpro\b/.test(id)) return 25;
  if (/\bultra\b/.test(id)) return 25;
  if (/\bmax\b/.test(id)) return 20;
  if (/\bhaiku\b/.test(id)) return 5;
  return 10;
}

function isLikelySecondaryVariant(modelId: string): boolean {
  // Deprioritize lite/mini/fast/preview/search/tts/image when choosing "top" model.
  return /(mini|lite|nano|fast|flash|tiny|small|haiku|preview|exp|beta|search|tts|image|vision|embed|moderation|audio|realtime)/i.test(
    modelId,
  );
}

/**
 * Choose the "top" model among a brand group.
 * Prefer higher version numbers; among same version, prefer non-lite variants;
 * finally preserve earlier probe order as weak tie-break.
 */
export function pickTopModelId(modelIds: string[]): string {
  if (modelIds.length === 0) return "";
  let best = modelIds[0]!;
  let bestScore = extractVersionScore(best);
  let bestTier = modelTierScore(best);
  let bestSecondary = isLikelySecondaryVariant(best);
  for (let i = 1; i < modelIds.length; i += 1) {
    const id = modelIds[i]!;
    const score = extractVersionScore(id);
    const tier = modelTierScore(id);
    const secondary = isLikelySecondaryVariant(id);
    if (score > bestScore) {
      best = id;
      bestScore = score;
      bestTier = tier;
      bestSecondary = secondary;
      continue;
    }
    if (score < bestScore) continue;
    if (tier > bestTier) {
      best = id;
      bestTier = tier;
      bestSecondary = secondary;
      continue;
    }
    if (tier < bestTier) continue;
    if (bestSecondary && !secondary) {
      best = id;
      bestSecondary = secondary;
    }
  }
  return best;
}

export function inferModelBrand(modelId: string): {
  brand: string;
  icon: string;
  iconColor?: string;
} | null {
  const id = modelId?.trim();
  if (!id) return null;
  // Normalize "vendor/model" paths and glued versions (grok4.5 → grok 4.5).
  const normalized = id
    .replace(/[\/_.]+/g, " ")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2");
  for (const rule of MODEL_BRAND_RULES) {
    if (rule.pattern.test(id) || rule.pattern.test(normalized)) {
      return {
        brand: rule.brand,
        icon: rule.icon,
        iconColor: rule.iconColor,
      };
    }
  }
  return null;
}

export function inferModelBrandIcon(modelId: string): ModelBrandIcon | null {
  const brand = inferModelBrand(modelId);
  if (!brand) return null;
  return {
    brand: brand.brand,
    icon: brand.icon,
    iconColor: brand.iconColor,
    modelId,
    modelIds: [modelId],
  };
}

/**
 * Group probed model ids by brand.
 * - One chip per brand; modelId is the preferred top model for that brand
 * - Multi-row friendly; no hard cap unless `limit` provided
 */
export function pickModelBrandIcons(
  modelIds: string[] | undefined,
  limit?: number,
): { icons: ModelBrandIcon[]; overflow: number } {
  if (!modelIds || modelIds.length === 0) {
    return { icons: [], overflow: 0 };
  }

  const byBrand = new Map<string, ModelBrandIcon>();
  const unmatched: string[] = [];

  for (const raw of modelIds) {
    const id = raw?.trim();
    if (!id) continue;
    const brand = inferModelBrand(id);
    if (!brand) {
      unmatched.push(id);
      continue;
    }
    const existing = byBrand.get(brand.brand);
    if (existing) {
      existing.modelIds.push(id);
    } else {
      byBrand.set(brand.brand, {
        brand: brand.brand,
        icon: brand.icon,
        iconColor: brand.iconColor,
        modelId: id,
        modelIds: [id],
      });
    }
  }

  // Finalize preferred top model for each brand after full grouping.
  for (const icon of byBrand.values()) {
    icon.modelId = pickTopModelId(icon.modelIds);
  }

  let icons = Array.from(byBrand.values());

  // Unmatched models: only surface when nothing brand-matched
  if (icons.length === 0 && unmatched.length > 0) {
    icons = unmatched.map((id) => ({
      brand: id,
      icon: "",
      modelId: id,
      modelIds: [id],
    }));
  }

  if (typeof limit === "number" && limit > 0 && icons.length > limit) {
    return {
      icons: icons.slice(0, limit),
      overflow: icons.length - limit,
    };
  }

  return { icons, overflow: 0 };
}

/** Resolve the preferred model id for a brand from a probe list. */
export function resolveTopModelForBrand(
  modelIds: string[] | undefined,
  brand: string,
): string | null {
  if (!modelIds || !brand) return null;
  const matched: string[] = [];
  for (const raw of modelIds) {
    const id = raw?.trim();
    if (!id) continue;
    const inferred = inferModelBrand(id);
    if (inferred?.brand === brand) matched.push(id);
  }
  if (matched.length === 0) return null;
  return pickTopModelId(matched);
}

/**
 * Persist a brand-diverse sample of model ids for logo chips / quick switch.
 * Keeps first occurrence of each brand, then fills remaining slots in original order.
 */
export function pickBrandDiverseModelIds(
  modelIds: string[] | undefined,
  limit = 80,
): string[] {
  const cleaned = (modelIds ?? [])
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
  if (cleaned.length <= limit) return cleaned;

  const selected: string[] = [];
  const seen = new Set<string>();
  const seenBrand = new Set<string>();

  for (const id of cleaned) {
    if (selected.length >= limit) break;
    const brandKey = inferModelBrand(id)?.brand ?? `raw:${id}`;
    if (seenBrand.has(brandKey) || seen.has(id)) continue;
    seenBrand.add(brandKey);
    seen.add(id);
    selected.push(id);
  }

  for (const id of cleaned) {
    if (selected.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    selected.push(id);
  }

  return selected;
}

