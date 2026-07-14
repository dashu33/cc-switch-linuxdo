import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { extractPortableCredentials } from "@/utils/copyProviderToApp";

export interface ProviderModelsProbeTarget {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  isFullUrl?: boolean;
  customUserAgent?: string;
}

export type ResolveProviderModelsProbeResult =
  | { ok: true; target: ProviderModelsProbeTarget }
  | {
      ok: false;
      reason:
        | "no_current"
        | "official"
        | "oauth_special"
        | "missing_config"
        | "missing_base_url"
        | "missing_api_key";
      providerName?: string;
    };

/**
 * 从当前供应商配置解析出 /models 探测所需的 baseUrl + apiKey。
 * 官方 / OAuth 专用供应商不走通用 /v1/models。
 */
export function resolveProviderModelsProbeTarget(
  provider: Provider | undefined | null,
  appId: AppId,
): ResolveProviderModelsProbeResult {
  if (!provider) {
    return { ok: false, reason: "no_current" };
  }

  if (provider.category === "official") {
    return {
      ok: false,
      reason: "official",
      providerName: provider.name,
    };
  }

  if (
    provider.meta?.providerType === "github_copilot" ||
    provider.meta?.providerType === "codex_oauth"
  ) {
    return {
      ok: false,
      reason: "oauth_special",
      providerName: provider.name,
    };
  }

  const credentials = extractPortableCredentials(provider, appId);
  const baseUrl = (credentials.baseUrl || "").trim();
  const apiKey = (credentials.apiKey || "").trim();

  if (!baseUrl && !apiKey) {
    return {
      ok: false,
      reason: "missing_config",
      providerName: provider.name,
    };
  }
  if (!baseUrl) {
    return {
      ok: false,
      reason: "missing_base_url",
      providerName: provider.name,
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_api_key",
      providerName: provider.name,
    };
  }

  return {
    ok: true,
    target: {
      providerId: provider.id,
      providerName: provider.name,
      baseUrl,
      apiKey,
      isFullUrl: provider.meta?.isFullUrl,
      customUserAgent: provider.meta?.customUserAgent,
    },
  };
}
