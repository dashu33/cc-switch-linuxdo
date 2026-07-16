import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CodexApiFormat, Provider } from "@/types";
import type { ModelsProbeStatus } from "@/hooks/useFetchCurrentProviderModels";
import type { ModelBrandIcon } from "@/utils/modelBrandIcon";
import { pickBrandDiverseModelIds } from "@/utils/modelBrandIcon";
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
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

interface CodexProviderQuickAdjustProps {
  provider: Provider;
  onUpdate: (provider: Provider) => void | Promise<void>;
  /** 瞬时探测结果（约 60s），驱动本卡「获取」按钮着色 */
  modelsProbeStatus?: ModelsProbeStatus;
  /** 最近一次完成的探测历史（localStorage），用于按钮色持久化 */
  modelsProbeHistoryStatus?: ModelsProbeStatus;
  /** 本卡手动获取完成后写入持久 history */
  onProbeResult?: (
    entry: {
      status: ModelsProbeStatus;
      modelCount?: number;
      modelIds?: string[];
    },
  ) => void;
  /** 探测到的模型 brand LOGO，显示在当前模型选择框下方 */
  modelBrandIcons?: ModelBrandIcon[];
  /** 探测历史中的模型 id（用于下拉选项，无需本会话重新获取） */
  modelOptions?: string[];
  onSelectBrandModel?: (modelId: string) => void;
  /**
   * 渲染在「上游格式」控件正下方（与模型图标同一水平带）。
   * 用于本地成功率摘要，避免图标把摘要整行顶到下方留下空白。
   */
  belowUpstream?: ReactNode;
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
  modelsProbeHistoryStatus,
  onProbeResult,
  modelBrandIcons = [],
  modelOptions = [],
  onSelectBrandModel,
  belowUpstream,
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


  // 同步探测结果到本卡「获取」按钮色：
  // 1) 本地手动获取进行中优先
  // 2) 瞬时批量/单条探测（约 60s）
  // 3) 持久 history（localStorage），重启/切 app 后仍保持颜色
  useEffect(() => {
    if (isFetchingModels) return;

    const applyCompleted = (status: ModelsProbeStatus | undefined) => {
      if (status === "success") {
        setFetchStatus("success");
        return true;
      }
      if (status === "empty") {
        setFetchStatus("empty");
        return true;
      }
      if (status === "failed") {
        setFetchStatus("failed");
        return true;
      }
      return false;
    };

    if (modelsProbeStatus === "probing") {
      setFetchStatus("fetching");
      return;
    }
    if (applyCompleted(modelsProbeStatus)) {
      return;
    }
    // 瞬时态已 idle/skipped：回落到持久 history
    if (applyCompleted(modelsProbeHistoryStatus)) {
      return;
    }
  }, [isFetchingModels, modelsProbeHistoryStatus, modelsProbeStatus]);

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
      onProbeResult?.({ status: "failed" });
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
      const modelIds = pickBrandDiverseModelIds(
        models
          .map((model) => model.id)
          .filter(
            (id): id is string =>
              typeof id === "string" && id.trim().length > 0,
          ),
      );
      if (models.length === 0) {
        setFetchStatus("empty");
        onProbeResult?.({
          status: "empty",
          modelCount: 0,
          modelIds: [],
        });
        toast.info(t("providerForm.fetchModelsEmpty"));
      } else {
        setFetchStatus("success");
        onProbeResult?.({
          status: "success",
          modelCount: models.length,
          modelIds,
        });
        toast.success(
          t("providerForm.fetchModelsSuccess", { count: models.length }),
        );
      }
    } catch (err) {
      console.warn("[CodexQuickAdjust] fetch models failed", err);
      setFetchedModels([]);
      setFetchStatus("failed");
      onProbeResult?.({ status: "failed" });
      showFetchModelsError(err, t);
    } finally {
      setIsFetchingModels(false);
    }
  }, [
    apiKey,
    baseUrl,
    onProbeResult,
    provider.meta?.customUserAgent,
    provider.meta?.isFullUrl,
    t,
  ]);


  const selectableModelIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const push = (raw?: string) => {
      const id = raw?.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    for (const model of fetchedModels) push(model.id);
    for (const id of modelOptions) push(id);
    for (const brand of modelBrandIcons) {
      push(brand.modelId);
      for (const id of brand.modelIds ?? []) push(id);
    }
    push(currentModel);
    return ids;
  }, [currentModel, fetchedModels, modelBrandIcons, modelOptions]);

  return (
    <div
      className="mt-1 flex w-full min-w-0 flex-col gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/*
        两列：左=上游格式(+成功率摘要)，右=模型控件+图标。
        图标只撑高右列，成功率贴在上游格式下，消除中间空白。
      */}
      <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-col gap-1">
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
          {belowUpstream ? (
            <div className="min-w-0 max-w-[min(100%,28rem)]">{belowUpstream}</div>
          ) : null}
        </div>

        <div className="flex min-w-0 items-start gap-1.5">
          <span className="mt-1.5 shrink-0 text-[11px] leading-none text-muted-foreground">
            {t("codexConfig.quickModelLabel", { defaultValue: "模型" })}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
              <Select
                value={currentModel || undefined}
                onValueChange={(value) => void handleModelChange(value)}
                disabled={isSaving || selectableModelIds.length === 0}
              >
                <SelectTrigger
                  className="h-7 w-[180px] max-w-[200px] shrink-0 text-xs [&>span]:truncate"
                  title={
                    currentModel ||
                    t("codexConfig.quickSelectModel", {
                      defaultValue: "选择模型",
                    })
                  }
                >
                  <SelectValue
                    placeholder={t("codexConfig.quickSelectModel", {
                      defaultValue: "选择模型",
                    })}
                  />
                </SelectTrigger>
                <SelectContent className="z-[200] max-h-64 min-w-[var(--radix-select-trigger-width)]">
                  {selectableModelIds.map((id) => (
                    <SelectItem key={id} value={id} title={id}>
                      <span className="truncate">{id}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={fetchButtonClassName}
                onClick={() => void handleFetchModels()}
                disabled={
                  isFetchingModels || isSaving || fetchStatus === "fetching"
                }
                title={
                  fetchStatus === "success"
                    ? t("providerForm.fetchModelsSuccess", {
                        count:
                          fetchedModels.length || selectableModelIds.length,
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

            {modelBrandIcons.length > 0 && (
              <div
                className="grid grid-cols-6 gap-1.5"
                style={{
                  width: "calc(6 * 2.25rem + 5 * 0.375rem)",
                }}
                title={t("provider.probedModelLogos", {
                  defaultValue: "探测到的模型品牌",
                })}
              >
                {modelBrandIcons.map((item) => {
                  const clickable = Boolean(onSelectBrandModel && item.modelId);
                  return (
                    <button
                      key={`${item.brand}-${item.modelId}`}
                      type="button"
                      disabled={!clickable}
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30",
                        clickable
                          ? "cursor-pointer hover:bg-muted hover:ring-1 hover:ring-primary/40"
                          : "cursor-default opacity-80",
                      )}
                      title={
                        clickable
                          ? t("provider.switchToBrandModel", {
                              model: item.modelId,
                              defaultValue: `切换到 ${item.modelId}`,
                            })
                          : item.modelId
                      }
                      aria-label={
                        clickable
                          ? t("provider.switchToBrandModel", {
                              model: item.modelId,
                              defaultValue: `切换到 ${item.modelId}`,
                            })
                          : item.modelId
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        if (!onSelectBrandModel || !item.modelId) return;
                        onSelectBrandModel(item.modelId);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <ProviderIcon
                        icon={item.icon || undefined}
                        name={item.modelId}
                        color={item.iconColor}
                        size={21}
                        showFallback
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


