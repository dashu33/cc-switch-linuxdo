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
  { brand: "grok", pattern: /(?:^|[^a-z0-9])(?:x[\s\-_]*ai[\s\-_/]*)?grok|\bxai\b|\bx-ai\b/i, icon: "grok", iconColor: "#000000" },
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
  /** Preferred / first (top) model id for this brand from the probe list. */
  modelId: string;
  /** All model ids under this brand (probe order preserved). */
  modelIds: string[];
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
 * - One chip per brand (first match in list = "最新/最顶")
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
        modelId: id, // first seen = top/newest preference
        modelIds: [id],
      });
    }
  }

  let icons = Array.from(byBrand.values());

  // Unmatched models: treat each distinct prefix-ish id as its own chip only when no brands at all
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
  for (const raw of modelIds) {
    const id = raw?.trim();
    if (!id) continue;
    const inferred = inferModelBrand(id);
    if (inferred?.brand === brand) return id;
  }
  return null;
}
