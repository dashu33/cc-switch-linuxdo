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
        | "official" // 兼容历史 history；现网不再产生
        | "oauth_special"
        | "missing_config"
        | "missing_base_url"
        | "missing_api_key";
      providerName?: string;
    };

/**
 * 从当前供应商配置解析出 /models 探测所需的 baseUrl + apiKey。
 *
 * 不再因 category === "official" 硬跳过：自用/第三方转发常见「官方分类 + 自定义 baseUrl/key」。
 * 真·官方（无 baseUrl/key）会落到 missing_*；OAuth 专用类型仍跳过。
 */
export function resolveProviderModelsProbeTarget(
  provider: Provider | undefined | null,
  appId: AppId,
): ResolveProviderModelsProbeResult {
  if (!provider) {
    return { ok: false, reason: "no_current" };
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
