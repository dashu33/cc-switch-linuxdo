import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { toast } from "sonner";

export interface FetchedModel {
  id: string;
  ownedBy: string | null;
}

export type FetchModelsFailureReason =
  | "config"
  | "api_key"
  | "auth"
  | "rate_limit"
  | "endpoint"
  | "timeout"
  | "response"
  | "network"
  | "server"
  | "unknown";

/**
 * Convert backend/request errors into stable, non-sensitive categories.
 * Probe history persists only this category, never the raw error string.
 */
export function classifyFetchModelsError(
  err: unknown,
  opts?: { hasApiKey: boolean; hasBaseUrl: boolean },
): FetchModelsFailureReason {
  // Prefer a dedicated API key category over generic "config".
  if (opts && !opts.hasApiKey) return "api_key";
  if (opts && !opts.hasBaseUrl) return "config";

  const message = String(err).toLowerCase();
  // Missing/invalid API key phrasing (backend may not always send HTTP status).
  if (
    message.includes("api key") ||
    message.includes("apikey") ||
    message.includes("api_key") ||
    message.includes("invalid_api_key") ||
    message.includes("incorrect_api_key") ||
    message.includes("invalid key") ||
    message.includes("incorrect api") ||
    message.includes("missing api key") ||
    message.includes("unauthorized: api") ||
    (message.includes("authentication_error") && message.includes("key")) ||
    message.includes("密钥无效") ||
    message.includes("密钥错误") ||
    message.includes("api密钥")
  ) {
    return "api_key";
  }
  if (/http\s+(401|403)\b/.test(message)) return "auth";
  if (/http\s+429\b/.test(message) || message.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    message.includes("all candidates failed") ||
    /http\s+(404|405)\b/.test(message)
  ) {
    return "endpoint";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (
    message.includes("failed to parse") ||
    message.includes("invalid json") ||
    message.includes("deserialize")
  ) {
    return "response";
  }
  if (/http\s+5\d\d\b/.test(message)) return "server";
  if (
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("connect error") ||
    message.includes("dns") ||
    message.includes("resolve host") ||
    message.includes("request failed")
  ) {
    return "network";
  }
  return "unknown";
}

/**
 * 从供应商获取可用模型列表
 *
 * 使用 OpenAI 兼容的 GET /v1/models 端点。优先用 `modelsUrl` 精确覆写；
 * 否则后端会对 baseURL 生成候选列表并按序尝试（含"剥离 /anthropic 等兼容子路径"兜底）。
 */
export async function fetchModelsForConfig(
  baseUrl: string,
  apiKey: string,
  isFullUrl?: boolean,
  modelsUrl?: string,
  customUserAgent?: string,
): Promise<FetchedModel[]> {
  return invoke("fetch_models_for_config", {
    baseUrl,
    apiKey,
    isFullUrl,
    modelsUrl,
    customUserAgent,
  });
}

/**
 * 获取 Codex OAuth (ChatGPT Plus/Pro 反代) 可用模型列表
 *
 * Codex OAuth 使用 ChatGPT 的 backend-api/codex 端点，不兼容普通 /v1/models。
 */
export async function fetchCodexOauthModels(
  accountId?: string | null,
): Promise<FetchedModel[]> {
  return invoke("get_codex_oauth_models", {
    accountId: accountId || null,
  });
}

/**
 * 根据错误类型显示对应的 toast 提示
 */
export function showFetchModelsError(
  err: unknown,
  t: TFunction,
  opts?: { hasApiKey: boolean; hasBaseUrl: boolean },
): void {
  // 前端预检：缺少必填字段
  if (opts && !opts.hasBaseUrl && !opts.hasApiKey) {
    toast.error(t("providerForm.fetchModelsNeedConfig"));
    return;
  }
  if (opts && !opts.hasApiKey) {
    toast.error(t("providerForm.fetchModelsNeedApiKey"));
    return;
  }
  if (opts && !opts.hasBaseUrl) {
    toast.error(t("providerForm.fetchModelsNeedEndpoint"));
    return;
  }

  const reason = classifyFetchModelsError(err, opts);

  if (reason === "api_key") {
    toast.error(
      t("providerForm.fetchModelsNeedApiKey", {
        defaultValue: t("providerForm.fetchModelsAuthFailed"),
      }),
    );
    return;
  }
  if (reason === "auth") {
    toast.error(t("providerForm.fetchModelsAuthFailed"));
    return;
  }
  if (reason === "endpoint") {
    toast.error(t("providerForm.fetchModelsEndpointNotFound"));
    return;
  }
  if (reason === "timeout") {
    toast.error(t("providerForm.fetchModelsTimeout"));
    return;
  }
  if (reason === "response") {
    toast.error(t("providerForm.fetchModelsNotSupported"));
    return;
  }

  // 通用兜底
  toast.error(t("providerForm.fetchModelsFailed"));
}
