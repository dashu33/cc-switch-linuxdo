import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CodexApiFormat, Provider } from "@/types";
import type { ModelsProbeStatus } from "@/hooks/useFetchCurrentProviderModels";
import {
  fetchModelsForConfig,
  showFetchModelsError,
  type FetchedModel,
} from "@/lib/api/model-fetch";
import {
  codexApiFormatFromWireApi,
  extractCodexBaseUrl,
  extractCodexExperimentalBearerToken,
  extractCodexModelName,
  extractCodexWireApi,
  setCodexModelName,
} from "@/utils/providerConfigUtils";
import { deepClone } from "@/utils/deepClone";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CodexProviderQuickAdjustProps {
  provider: Provider;
  onUpdate: (provider: Provider) => void | Promise<void>;
  /** 顶部一键拉取批量探测结果，驱动本卡「获取」按钮着色 */
  modelsProbeStatus?: ModelsProbeStatus;
}

function pickCodexApiKey(provider: Provider): string {
  const config = provider.settingsConfig as Record<string, any> | undefined;
  const authKey = config?.auth?.OPENAI_API_KEY;
  if (typeof authKey === "string" && authKey.trim()) return authKey.trim();
  const configText = typeof config?.config === "string" ? config.config : "";
  return extractCodexExperimentalBearerToken(configText) || "";
}

function resolveApiFormat(provider: Provider): CodexApiFormat {
  const metaFormat = provider.meta?.apiFormat;
  if (
    metaFormat === "openai_chat" ||
    metaFormat === "openai_responses" ||
    metaFormat === "anthropic"
  ) {
    return metaFormat;
  }
  const configText =
    typeof (provider.settingsConfig as Record<string, any>)?.config === "string"
      ? ((provider.settingsConfig as Record<string, any>).config as string)
      : "";
  return codexApiFormatFromWireApi(extractCodexWireApi(configText)) ?? "openai_responses";
}

export function CodexProviderQuickAdjust({
  provider,
  onUpdate,
  modelsProbeStatus = "idle",
}: CodexProviderQuickAdjustProps) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [fetchStatus, setFetchStatus] = useState<
    "idle" | "fetching" | "success" | "empty" | "failed"
  >("idle");

  useEffect(() => {
    setFetchedModels([]);
    setFetchStatus("idle");
    setIsFetchingModels(false);
  }, [provider.id]);


  // 同步顶部批量探测结果到本卡「获取」按钮色（本地手动获取优先）
  useEffect(() => {
    if (isFetchingModels) return;
    if (modelsProbeStatus === "idle" || modelsProbeStatus === "skipped") return;
    if (modelsProbeStatus === "probing") {
      setFetchStatus("fetching");
      return;
    }
    if (modelsProbeStatus === "success") {
      setFetchStatus("success");
      return;
    }
    if (modelsProbeStatus === "empty") {
      setFetchStatus("empty");
      return;
    }
    if (modelsProbeStatus === "failed") {
      setFetchStatus("failed");
    }
  }, [isFetchingModels, modelsProbeStatus]);

  const fetchButtonClassName = useMemo(() => {
    const base =
      "h-7 gap-1 px-2 text-xs transition-colors disabled:opacity-100";
    switch (fetchStatus) {
      case "fetching":
        return `${base} border-amber-500/70 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200`;
      case "success":
        return `${base} border-emerald-500/70 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200`;
      case "empty":
        return `${base} border-orange-500/70 bg-orange-500/15 text-orange-800 hover:bg-orange-500/20 dark:text-orange-200`;
      case "failed":
        return `${base} border-red-500/70 bg-red-500/15 text-red-800 hover:bg-red-500/20 dark:text-red-200`;
      default:
        return base;
    }
  }, [fetchStatus]);

  const fetchStatusLabel = useMemo(() => {
    switch (fetchStatus) {
      case "fetching":
        return t("providerForm.fetchingModels", { defaultValue: "获取中…" });
      case "success":
        return t("codexConfig.quickFetchModelsOk", {
          defaultValue: "可用",
        });
      case "empty":
        return t("codexConfig.quickFetchModelsEmpty", {
          defaultValue: "无模型",
        });
      case "failed":
        return t("codexConfig.quickFetchModelsFailed", {
          defaultValue: "失败",
        });
      default:
        return t("codexConfig.quickFetchModels", { defaultValue: "获取" });
    }
  }, [fetchStatus, t]);

  const configText = useMemo(() => {
    const config = provider.settingsConfig as Record<string, any> | undefined;
    return typeof config?.config === "string" ? config.config : "";
  }, [provider.settingsConfig]);

  const currentFormat = useMemo(() => resolveApiFormat(provider), [provider]);
  const currentModel = useMemo(
    () => extractCodexModelName(configText) || "",
    [configText],
  );
  const baseUrl = useMemo(() => extractCodexBaseUrl(configText) || "", [configText]);
  const apiKey = useMemo(() => pickCodexApiKey(provider), [provider]);

  const persistProvider = useCallback(
    async (next: Provider) => {
      setIsSaving(true);
      try {
        await onUpdate(next);
      } finally {
        setIsSaving(false);
      }
    },
    [onUpdate],
  );

  const handleFormatChange = useCallback(
    async (value: string) => {
      const format = value as CodexApiFormat;
      if (format === currentFormat) return;
      const next = deepClone(provider) as Provider;
      next.meta = {
        ...(next.meta ?? {}),
        apiFormat: format,
      };
      // Codex 侧 wire_api 固定 responses；上游格式由 meta.apiFormat 控制代理转换
      await persistProvider(next);
    },
    [currentFormat, persistProvider, provider],
  );

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const trimmed = modelId.trim();
      if (!trimmed || trimmed === currentModel) return;
      const next = deepClone(provider) as Provider;
      const settings = (next.settingsConfig ?? {}) as Record<string, any>;
      const prevConfig =
        typeof settings.config === "string" ? settings.config : "";
      settings.config = setCodexModelName(prevConfig, trimmed);
      next.settingsConfig = settings;
      await persistProvider(next);
    },
    [currentModel, persistProvider, provider],
  );

  const handleFetchModels = useCallback(async () => {
    if (!baseUrl || !apiKey) {
      setFetchStatus("failed");
      showFetchModelsError(null, t, {
        hasApiKey: !!apiKey,
        hasBaseUrl: !!baseUrl,
      });
      return;
    }
    setIsFetchingModels(true);
    setFetchStatus("fetching");
    try {
      const models = await fetchModelsForConfig(
        baseUrl,
        apiKey,
        provider.meta?.isFullUrl,
        undefined,
        provider.meta?.customUserAgent,
      );
      setFetchedModels(models);
      if (models.length === 0) {
        setFetchStatus("empty");
        toast.info(t("providerForm.fetchModelsEmpty"));
      } else {
        setFetchStatus("success");
        toast.success(
          t("providerForm.fetchModelsSuccess", { count: models.length }),
        );
      }
    } catch (err) {
      console.warn("[CodexQuickAdjust] fetch models failed", err);
      setFetchedModels([]);
      setFetchStatus("failed");
      showFetchModelsError(err, t);
    } finally {
      setIsFetchingModels(false);
    }
  }, [apiKey, baseUrl, provider.meta?.customUserAgent, provider.meta?.isFullUrl, t]);

  const groupedModels = useMemo(() => {
    const grouped: Record<string, FetchedModel[]> = {};
    for (const model of fetchedModels) {
      const vendor = model.ownedBy || "Other";
      if (!grouped[vendor]) grouped[vendor] = [];
      grouped[vendor].push(model);
    }
    return Object.keys(grouped)
      .sort()
      .map((vendor) => ({ vendor, models: grouped[vendor] }));
  }, [fetchedModels]);

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {t("codexConfig.upstreamFormatLabel", { defaultValue: "上游格式" })}
        </span>
        <Select
          value={currentFormat}
          onValueChange={(value) => void handleFormatChange(value)}
          disabled={isSaving}
        >
          <SelectTrigger className="h-7 w-[260px] min-w-[220px] max-w-[min(100%,280px)] shrink-0 text-xs [&>span]:truncate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[200] min-w-[var(--radix-select-trigger-width)]">
            <SelectItem value="openai_chat">
              {t("codexConfig.upstreamFormatChat", {
                defaultValue: "Chat Completions（需开启路由）",
              })}
            </SelectItem>
            <SelectItem value="openai_responses">
              {t("codexConfig.upstreamFormatResponses", {
                defaultValue: "Responses（原生）",
              })}
            </SelectItem>
            <SelectItem value="anthropic">
              {t("codexConfig.upstreamFormatAnthropic", {
                defaultValue: "Anthropic Messages（需开启路由）",
              })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {t("codexConfig.quickModelLabel", { defaultValue: "模型" })}
        </span>
        <div className="flex min-w-0 items-center gap-1">
          {fetchedModels.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 max-w-[180px] justify-between gap-1 px-2 text-xs"
                  disabled={isSaving}
                  title={
                    currentModel ||
                    t("codexConfig.quickSelectModel", {
                      defaultValue: "选择模型",
                    })
                  }
                >
                  <span className="truncate">
                    {currentModel ||
                      t("codexConfig.quickSelectModel", {
                        defaultValue: "选择模型",
                      })}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 max-w-[320px] overflow-y-auto z-[200]"
              >
                {groupedModels.map(({ vendor, models }, index) => (
                  <div key={vendor}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{vendor}</DropdownMenuLabel>
                    {models.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        onSelect={() => void handleModelChange(model.id)}
                        className="max-w-[300px] truncate"
                        title={model.id}
                      >
                        {model.id}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span
              className="max-w-[140px] truncate text-xs text-muted-foreground"
              title={currentModel || undefined}
            >
              {currentModel ||
                t("common.notSet", { defaultValue: "未设置" })}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={fetchButtonClassName}
            onClick={() => void handleFetchModels()}
            disabled={isFetchingModels || isSaving || fetchStatus === "fetching"}
            title={
              fetchStatus === "success"
                ? t("providerForm.fetchModelsSuccess", {
                    count: fetchedModels.length,
                    defaultValue: "获取成功",
                  })
                : fetchStatus === "empty"
                  ? t("providerForm.fetchModelsEmpty", {
                      defaultValue: "未返回模型",
                    })
                  : fetchStatus === "failed"
                    ? t("providerForm.fetchModelsFailed", {
                        defaultValue: "获取失败",
                      })
                    : t("providerForm.fetchModels")
            }
          >
            {isFetchingModels || fetchStatus === "fetching" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {fetchStatus === "idle"
              ? t("codexConfig.quickFetchModels", { defaultValue: "获取" })
              : fetchStatusLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
