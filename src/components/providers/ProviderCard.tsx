import { useMemo, useState, useEffect } from "react";
import { GripVertical, ChevronDown, ChevronUp, Pencil, Check, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deepClone } from "@/utils/deepClone";
import { ProviderActions } from "@/components/providers/ProviderActions";
import { ProviderContextMenu } from "@/components/providers/ProviderContextMenu";
import type { VisibleApps } from "@/types";
import { ProviderIcon } from "@/components/ProviderIcon";
import UsageFooter from "@/components/UsageFooter";
import SubscriptionQuotaFooter from "@/components/SubscriptionQuotaFooter";
import CopilotQuotaFooter from "@/components/CopilotQuotaFooter";
import CodexOauthQuotaFooter from "@/components/CodexOauthQuotaFooter";
import { PROVIDER_TYPES, TEMPLATE_TYPES } from "@/config/constants";
import { isHermesReadOnlyProvider } from "@/config/hermesProviderPresets";
import { ProviderHealthBadge } from "@/components/providers/ProviderHealthBadge";
import { CodexProviderQuickAdjust } from "@/components/providers/CodexProviderQuickAdjust";
import { ProviderProxyUsageSummary } from "@/components/providers/ProviderProxyUsageSummary";
import { ProviderRecentCallsPanel } from "@/components/providers/ProviderRecentCallsPanel";
import type { ProviderStats } from "@/types/usage";
import type { ModelsProbeStatus } from "@/hooks/useFetchCurrentProviderModels";
import { FailoverPriorityBadge } from "@/components/providers/FailoverPriorityBadge";
import {
  extractCodexBaseUrl,
  extractCodexExperimentalBearerToken,
  extractCodexWireApi,
  isCodexAnthropicWireApi,
  isCodexChatWireApi,
} from "@/utils/providerConfigUtils";
import { supportsOfficialProxyTakeover } from "@/utils/providerCapabilities";
import { useProviderHealth } from "@/lib/query/failover";
import { useUsageQuery } from "@/lib/query/queries";

interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

interface ProviderCardProps {
  provider: Provider;
  isCurrent: boolean;
  appId: AppId;
  isInConfig?: boolean; // OpenCode: 是否已添加到 opencode.json
  isOmo?: boolean;
  isOmoSlim?: boolean;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onUpdate?: (provider: Provider) => void | Promise<void>;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onConfigureUsage: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onDuplicate: (provider: Provider) => void;
  onCopyToApp?: (provider: Provider, targetApp: AppId) => void;
  visibleApps?: VisibleApps;
  onTest?: (provider: Provider) => void;
  onOpenTerminal?: (provider: Provider) => void;
  isTesting?: boolean;
  isProxyRunning: boolean;
  isProxyTakeover?: boolean; // 代理接管模式（Live配置已被接管，切换为热切换）
  dragHandleProps?: DragHandleProps;
  isAutoFailoverEnabled?: boolean; // 是否开启自动故障转移
  failoverPriority?: number; // 故障转移优先级（1 = P1, 2 = P2, ...）
  isInFailoverQueue?: boolean; // 是否在故障转移队列中
  onToggleFailover?: (enabled: boolean) => void; // 切换故障转移队列
  activeProviderId?: string; // 代理当前实际使用的供应商 ID（用于故障转移模式下标注绿色边框）
  // OpenClaw: default model
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
  /** 本地 proxy/session 用量统计（与用量统计页同口径） */
  proxyUsageStats?: ProviderStats;
  /** 近 5 分钟本地用量（即时成功率） */
  proxyRecentUsageStats?: ProviderStats;
  /** 一键拉模型探测结果：成功绿边框 / 失败红边框 */
  modelsProbeStatus?: ModelsProbeStatus;
  /** 快速定位时的短暂高亮 */
  scrollHighlight?: boolean;
}

/** 判断是否为官方供应商（无自定义 base URL / API key，直连官方 API） */
function isOfficialProvider(provider: Provider, appId: AppId): boolean {
  if (provider.category === "official") {
    return true;
  }

  const config = provider.settingsConfig as Record<string, any>;
  if (appId === "claude") {
    const baseUrl = config?.env?.ANTHROPIC_BASE_URL;
    return !baseUrl || (typeof baseUrl === "string" && baseUrl.trim() === "");
  }
  if (appId === "codex") {
    // 无 OPENAI_API_KEY → 使用 Codex CLI 内置 OAuth（官方）
    const apiKey = config?.auth?.OPENAI_API_KEY;
    const bearerToken =
      typeof config?.config === "string"
        ? extractCodexExperimentalBearerToken(config.config)
        : undefined;
    return (
      !bearerToken &&
      (!apiKey || (typeof apiKey === "string" && apiKey.trim() === ""))
    );
  }
  if (appId === "gemini") {
    // 无 GEMINI_API_KEY 且无 GOOGLE_GEMINI_BASE_URL → Google OAuth 官方模式
    const apiKey = config?.env?.GEMINI_API_KEY;
    const baseUrl = config?.env?.GOOGLE_GEMINI_BASE_URL;
    return (
      (!apiKey || (typeof apiKey === "string" && apiKey.trim() === "")) &&
      (!baseUrl || (typeof baseUrl === "string" && baseUrl.trim() === ""))
    );
  }
  return false;
}

const extractApiUrl = (provider: Provider, fallbackText: string) => {
  if (provider.notes?.trim()) {
    return provider.notes.trim();
  }

  if (provider.websiteUrl) {
    return provider.websiteUrl;
  }

  const config = provider.settingsConfig;

  if (config && typeof config === "object") {
    const envBase =
      (config as Record<string, any>)?.env?.ANTHROPIC_BASE_URL ||
      (config as Record<string, any>)?.env?.GOOGLE_GEMINI_BASE_URL;
    if (typeof envBase === "string" && envBase.trim()) {
      return envBase;
    }

    const baseUrl = (config as Record<string, any>)?.config;

    if (typeof baseUrl === "string" && baseUrl.includes("base_url")) {
      const extractedBaseUrl = extractCodexBaseUrl(baseUrl);
      if (extractedBaseUrl) {
        return extractedBaseUrl;
      }
    }
  }

  return fallbackText;
};

export function ProviderCard({
  provider,
  isCurrent,
  appId,
  isInConfig = true,
  isOmo = false,
  isOmoSlim = false,
  onSwitch,
  onEdit,
  onUpdate,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onConfigureUsage,
  onOpenWebsite,
  onDuplicate,
  onCopyToApp,
  visibleApps,
  onTest,
  onOpenTerminal,
  isTesting,
  isProxyRunning,
  isProxyTakeover = false,
  dragHandleProps,
  isAutoFailoverEnabled = false,
  failoverPriority,
  isInFailoverQueue = false,
  onToggleFailover,
  activeProviderId,
  // OpenClaw: default model
  isDefaultModel,
  onSetAsDefault,
  proxyUsageStats,
  proxyRecentUsageStats,
  modelsProbeStatus = "idle",
  scrollHighlight = false,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(provider.name);
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(provider.name);
    }
  }, [provider.name, isRenaming]);

  // OMO and OMO Slim share the same card behavior
  const isAnyOmo = isOmo || isOmoSlim;
  const handleDisableAnyOmo = isOmoSlim ? onDisableOmoSlim : onDisableOmo;
  const isAdditiveMode = appId === "opencode" && !isAnyOmo;

  const { data: health } = useProviderHealth(provider.id, appId);

  const fallbackUrlText = t("provider.notConfigured", {
    defaultValue: "未配置接口地址",
  });

  const displayUrl = useMemo(() => {
    return extractApiUrl(provider, fallbackUrlText);
  }, [provider, fallbackUrlText]);

  const isClickableUrl = useMemo(() => {
    if (provider.notes?.trim()) {
      return false;
    }
    if (displayUrl === fallbackUrlText) {
      return false;
    }
    return true;
  }, [provider.notes, displayUrl, fallbackUrlText]);

  const usageEnabled = provider.meta?.usage_script?.enabled ?? false;
  const isOfficial = isOfficialProvider(provider, appId);
  const supportsOfficialSubscription =
    isOfficial && ["claude", "codex", "gemini"].includes(appId);
  const isOfficialSubscriptionUsage =
    provider.meta?.usage_script?.templateType ===
    TEMPLATE_TYPES.OFFICIAL_SUBSCRIPTION;
  const officialSubscriptionEnabled =
    supportsOfficialSubscription && usageEnabled && isOfficialSubscriptionUsage;
  // 官方判定只认显式 category === "official"（SSOT），不回退 isOfficial 的空字段启发式。
  // 理由（此判定曾在「纯 category ↔ category+isOfficial 回退」间反复，结论钉死于此）：
  //  1) 封号保护是高代价决策，不该建立在「base_url/key 缺失」这种脆弱信号上——它无法区分
  //     「想直连官方」与「自定义但还没填完」，两者都表现为字段为空，必然误伤后者。
  //  2) 启发式在 UI 多拦的部分，执行层 useProviderActions.ts 也只认 category === "official"、
  //     并不兑现（绕过 UI 即可切换）→ 属虚保护，却以误伤 category 缺失的自定义供应商为代价。
  //  3) 预设导入的官方一定带 category="official"，category 缺失的「真官方」现实中≈不存在。
  // 真官方就该有显式 category；手动新建官方应引导标注，而不是靠空字段猜。
  const supportsOfficialRouting = supportsOfficialProxyTakeover(
    appId,
    provider,
  );
  const isOfficialBlockedByProxy =
    isProxyTakeover &&
    provider.category === "official" &&
    !supportsOfficialRouting;
  const isCopilot =
    provider.meta?.providerType === PROVIDER_TYPES.GITHUB_COPILOT ||
    provider.meta?.usage_script?.templateType === "github_copilot";
  // Hermes v12+ overlay entries live under the `providers:` dict and are
  // read-only here — writes have to go through Hermes Web UI.
  const isHermesReadOnly =
    appId === "hermes" && isHermesReadOnlyProvider(provider.settingsConfig);
  const isCodexOauth =
    provider.meta?.providerType === PROVIDER_TYPES.CODEX_OAUTH;
  const codexNeedsRouting = useMemo(() => {
    if (appId !== "codex" || provider.category === "official") return false;
    if (
      provider.meta?.apiFormat === "openai_chat" ||
      provider.meta?.apiFormat === "anthropic"
    )
      return true;
    const config = (provider.settingsConfig as Record<string, any>)?.config;
    return (
      typeof config === "string" &&
      (isCodexChatWireApi(extractCodexWireApi(config)) ||
        isCodexAnthropicWireApi(extractCodexWireApi(config)))
    );
  }, [
    appId,
    provider.category,
    provider.meta?.apiFormat,
    (provider.settingsConfig as Record<string, any>)?.config,
  ]);
  // 获取用量数据以判断是否有多套餐
  // 累加模式应用（OpenCode/OpenClaw/Hermes）：使用 isInConfig 代替 isCurrent
  const shouldAutoQuery =
    appId === "opencode" || appId === "openclaw" || appId === "hermes"
      ? isInConfig
      : isCurrent;
  const autoQueryInterval = shouldAutoQuery
    ? provider.meta?.usage_script?.autoQueryInterval || 0
    : 0;

  const { data: usage } = useUsageQuery(provider.id, appId, {
    enabled: usageEnabled && !isOfficial && !isOfficialSubscriptionUsage,
    autoQueryInterval,
  });

  const isTokenPlan =
    provider.meta?.usage_script?.templateType === "token_plan";
  const hasMultiplePlans =
    usage?.success && usage.data && usage.data.length > 1 && !isTokenPlan;

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (hasMultiplePlans) {
      setIsExpanded(true);
    }
  }, [hasMultiplePlans]);

  const handleOpenWebsite = () => {
    if (!isClickableUrl) {
      return;
    }
    onOpenWebsite(displayUrl);
  };

  // 判断是否是"当前使用中"的供应商
  // - OMO/OMO Slim 供应商：使用 isCurrent
  // - OpenClaw：使用默认模型归属的 provider 作为当前项（蓝色边框）
  // - OpenCode（非 OMO）：不存在"当前"概念，返回 false
  // - 故障转移模式：代理实际使用的供应商（activeProviderId）
  // - 普通模式：isCurrent
  const isActiveProvider = isAnyOmo
    ? isCurrent
    : appId === "openclaw"
      ? Boolean(isDefaultModel)
      : appId === "opencode"
        ? false
        : isAutoFailoverEnabled
          ? activeProviderId === provider.id
          : isCurrent;

  const shouldUseGreen = !isAnyOmo && isProxyTakeover && isActiveProvider;
  const hasPersistentConfigHighlight = isAdditiveMode && isInConfig;
  const shouldUseBlue =
    (isAnyOmo && isActiveProvider) ||
    (!isAnyOmo &&
      !isProxyTakeover &&
      (isActiveProvider || hasPersistentConfigHighlight));

  // skipped 与 idle 一样不抢边框色
  const effectiveProbeStatus =
    modelsProbeStatus === "skipped" ? "idle" : modelsProbeStatus;

  const canRename =
    Boolean(onUpdate) && !isHermesReadOnly && !isAnyOmo;

  const startRename = () => {
    if (!canRename) return;
    setRenameValue(provider.name);
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameValue(provider.name);
  };

  const saveRename = async () => {
    if (!onUpdate || isSavingName) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      toast.error(
        t("provider.renameEmpty", {
          defaultValue: "供应商名称不能为空",
        }),
      );
      return;
    }
    if (nextName === provider.name) {
      setIsRenaming(false);
      return;
    }
    setIsSavingName(true);
    try {
      const next = deepClone(provider) as Provider;
      next.name = nextName;
      await onUpdate(next);
      setIsRenaming(false);
      toast.success(
        t("provider.renameSuccess", {
          defaultValue: "名称已更新",
        }),
      );
    } catch (err) {
      console.warn("[ProviderCard] rename failed", err);
      toast.error(
        t("provider.renameFailed", {
          defaultValue: "名称更新失败",
        }),
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const card = (
    <div
      data-provider-id={provider.id}
      data-provider-current={isCurrent ? "true" : "false"}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border p-4 transition-all duration-300 scroll-mt-24",
        "bg-card text-card-foreground group",
        scrollHighlight &&
          "ring-2 ring-primary shadow-lg shadow-primary/25 border-primary/70 animate-pulse",
        isAutoFailoverEnabled || isProxyTakeover
          ? "hover:border-emerald-500/50"
          : "hover:border-border-active",
        effectiveProbeStatus === "success" &&
          "border-emerald-500 border-2 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/50",
        effectiveProbeStatus === "empty" &&
          "border-orange-500 border-2 shadow-md shadow-orange-500/25 ring-2 ring-orange-500/50",
        effectiveProbeStatus === "failed" &&
          "border-red-500 border-2 shadow-md shadow-red-500/25 ring-2 ring-red-500/50",
        effectiveProbeStatus === "probing" &&
          "border-amber-500 border-2 shadow-sm shadow-amber-500/20 animate-pulse",
        effectiveProbeStatus === "idle" &&
          shouldUseGreen &&
          "border-emerald-500/60 shadow-sm shadow-emerald-500/10",
        effectiveProbeStatus === "idle" &&
          shouldUseBlue &&
          "border-blue-500/60 shadow-sm shadow-blue-500/10",
        !(isActiveProvider || hasPersistentConfigHighlight) &&
          "hover:shadow-sm",
        dragHandleProps?.isDragging &&
          "cursor-grabbing border-primary shadow-lg scale-105 z-10",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-r to-transparent transition-opacity duration-500 pointer-events-none",
          effectiveProbeStatus === "success" && "from-emerald-500/15",
          effectiveProbeStatus === "empty" && "from-orange-500/15",
          effectiveProbeStatus === "failed" && "from-red-500/15",
          effectiveProbeStatus === "probing" && "from-amber-500/10",
          effectiveProbeStatus === "idle" && shouldUseGreen && "from-emerald-500/10",
          effectiveProbeStatus === "idle" && shouldUseBlue && "from-blue-500/10",
          effectiveProbeStatus === "idle" &&
            !shouldUseGreen &&
            !shouldUseBlue &&
            "from-primary/10",
          (effectiveProbeStatus !== "idle" ||
            isActiveProvider ||
            hasPersistentConfigHighlight)
            ? "opacity-100"
            : "opacity-0",
        )}
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            className={cn(
              "-ml-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing p-1.5",
              "text-muted-foreground/50 hover:text-muted-foreground transition-colors",
              dragHandleProps?.isDragging && "cursor-grabbing",
            )}
            aria-label={t("provider.dragHandle")}
            {...(dragHandleProps?.attributes ?? {})}
            {...(dragHandleProps?.listeners ?? {})}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center border border-border group-hover:scale-105 transition-transform duration-300">
            <ProviderIcon
              icon={provider.icon}
              name={provider.name}
              color={provider.iconColor}
              size={20}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 min-h-7">
              {isRenaming ? (
                <div
                  className="flex min-w-0 max-w-full items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="h-7 w-[min(100%,16rem)] px-2 text-sm font-semibold"
                    autoFocus
                    disabled={isSavingName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    aria-label={t("provider.renameAria", {
                      defaultValue: "编辑供应商名称",
                    })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-emerald-600 hover:text-emerald-700"
                    disabled={isSavingName}
                    onClick={() => void saveRename()}
                    title={t("common.save", { defaultValue: "保存" })}
                  >
                    {isSavingName ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    disabled={isSavingName}
                    onClick={cancelRename}
                    title={t("common.cancel", { defaultValue: "取消" })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  {canRename && (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
                        "transition-colors",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title={t("provider.rename", {
                        defaultValue: "编辑名称",
                      })}
                      aria-label={t("provider.rename", {
                        defaultValue: "编辑名称",
                      })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <h3 className="text-base font-semibold leading-none">
                    {provider.name}
                  </h3>
                </>
              )}

              {isOmo && (
                <span className="inline-flex items-center rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  OMO
                </span>
              )}

              {isOmoSlim && (
                <span className="inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  Slim
                </span>
              )}

              {appId === "claude-desktop" &&
                provider.category !== "official" &&
                provider.meta?.claudeDesktopMode === "proxy" && (
                  <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    {t("claudeDesktop.modeProxy", {
                      defaultValue: "需要路由",
                    })}
                  </span>
                )}

              {appId === "claude" &&
                provider.category !== "official" &&
                provider.meta?.apiFormat &&
                provider.meta.apiFormat !== "anthropic" && (
                  <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    {t("claudeCode.needsRouting", {
                      defaultValue: "需要路由",
                    })}
                  </span>
                )}

              {codexNeedsRouting && (
                <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  {t("codex.needsRouting", {
                    defaultValue: "需要路由",
                  })}
                </span>
              )}

              {appId === "claude" && provider.category === "official" && (
                <span className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/60 dark:text-slate-200">
                  {t("claudeCode.noRoutingSupport", {
                    defaultValue: "不支持路由",
                  })}
                </span>
              )}

              {appId === "codex" && supportsOfficialRouting && (
                <span className="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  {isProxyTakeover
                    ? t("codex.officialRouting", {
                        defaultValue: "官方账号路由",
                      })
                    : t("codex.nativeLogin", {
                        defaultValue: "Codex 登录",
                      })}
                </span>
              )}

              {appId === "codex" &&
                provider.category === "official" &&
                !supportsOfficialRouting && (
                  <span className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/60 dark:text-slate-200">
                    {t("codex.noRoutingSupport", {
                      defaultValue: "不支持路由",
                    })}
                  </span>
                )}

              {isProxyRunning && isInFailoverQueue && health && (
                <ProviderHealthBadge
                  consecutiveFailures={health.consecutive_failures}
                  isHealthy={health.is_healthy}
                />
              )}

              {isAutoFailoverEnabled &&
                isInFailoverQueue &&
                failoverPriority && (
                  <FailoverPriorityBadge priority={failoverPriority} />
                )}

              {provider.category === "third_party" &&
                provider.meta?.isPartner && (
                  <span
                    className="text-yellow-500 dark:text-yellow-400"
                    title={t("provider.officialPartner", {
                      defaultValue: "官方合作伙伴",
                    })}
                  >
                    ⭐
                  </span>
                )}

              {isHermesReadOnly && (
                <span
                  className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/60 dark:text-slate-200"
                  title={t("provider.managedByHermesHint", {
                    defaultValue: "由 Hermes 管理，请在 Hermes Web UI 中编辑",
                  })}
                >
                  {t("provider.managedByHermes", {
                    defaultValue: "Hermes Managed",
                  })}
                </span>
              )}
            </div>

            {displayUrl && (
              <button
                type="button"
                onClick={handleOpenWebsite}
                className={cn(
                  "inline-flex max-w-full items-center overflow-hidden text-left text-sm",
                  isClickableUrl
                    ? "text-blue-500 transition-colors hover:underline dark:text-blue-400 cursor-pointer"
                    : "text-muted-foreground cursor-default",
                )}
                title={displayUrl}
                disabled={!isClickableUrl}
              >
                <span className="min-w-0 truncate">{displayUrl}</span>
              </button>
            )}

            {appId === "codex" &&
              provider.category !== "official" &&
              onUpdate && (
                <CodexProviderQuickAdjust
                  provider={provider}
                  onUpdate={onUpdate}
                  modelsProbeStatus={modelsProbeStatus}
                />
              )}

            <ProviderProxyUsageSummary
              stats={proxyUsageStats}
              recentStats={proxyRecentUsageStats}
            />
          </div>
        </div>

        {/* 右侧：最近调用占位吃满行高；配额常显叠顶；操作按钮 hover 叠上（逻辑同前） */}
        <div className="relative ml-auto flex w-[200px] sm:w-[280px] shrink-0 self-stretch min-h-[104px]">
          <ProviderRecentCallsPanel
            appId={appId}
            providerName={provider.name}
            isCurrent={isCurrent}
            className="absolute inset-0"
          />

          {/* 配额/套餐：始终可见，叠在最近调用上方 */}
          <div className="pointer-events-auto absolute right-1 top-1 z-10 max-w-[calc(100%-0.5rem)]">
            <div className="flex max-w-full items-center gap-1 rounded-md bg-card/85 px-1 py-0.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm">
              {isCopilot ? (
                <CopilotQuotaFooter
                  meta={provider.meta}
                  inline={true}
                  isCurrent={isCurrent}
                />
              ) : isCodexOauth ? (
                <CodexOauthQuotaFooter
                  meta={provider.meta}
                  inline={true}
                  isCurrent={isCurrent}
                />
              ) : isOfficial ? (
                officialSubscriptionEnabled ? (
                  <SubscriptionQuotaFooter
                    appId={appId}
                    inline={true}
                    isCurrent={isCurrent}
                    autoQueryInterval={
                      provider.meta?.usage_script?.autoQueryInterval ?? 0
                    }
                  />
                ) : null
              ) : hasMultiplePlans ? (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-medium">
                    {t("usage.multiplePlans", {
                      count: usage?.data?.length || 0,
                      defaultValue: `${usage?.data?.length || 0} 个套餐`,
                    })}
                  </span>
                </div>
              ) : (
                <UsageFooter
                  provider={provider}
                  providerId={provider.id}
                  appId={appId}
                  usageEnabled={usageEnabled}
                  isCurrent={isCurrent}
                  isInConfig={isInConfig}
                  inline={true}
                />
              )}
              {hasMultiplePlans && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 flex-shrink-0"
                  title={
                    isExpanded
                      ? t("usage.collapse", { defaultValue: "收起" })
                      : t("usage.expand", { defaultValue: "展开" })
                  }
                >
                  {isExpanded ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 操作按钮：hover 显示，层级在最近调用之上 */}
          <div className="pointer-events-none absolute inset-x-1 bottom-1 z-20 flex items-center justify-end opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <div className="flex items-center gap-1.5 rounded-md bg-card/90 px-1 py-0.5 shadow-sm ring-1 ring-border/50 backdrop-blur-sm">
            <ProviderActions
              appId={appId}
              isCurrent={isCurrent}
              isInConfig={isInConfig}
              isTesting={isTesting}
              isProxyTakeover={isProxyTakeover}
              isOfficialBlockedByProxy={isOfficialBlockedByProxy}
              isReadOnly={isHermesReadOnly}
              isOmo={isAnyOmo}
              onSwitch={() => onSwitch(provider)}
              onEdit={() => onEdit(provider)}
              onDuplicate={() => onDuplicate(provider)}
              onTest={
                // 连通检测对第三方/自定义/Copilot/Codex-OAuth 供应商开放（这些正是旧的
                // 真实请求探测会误报、而可达性探测能正确处理的对象）。官方供应商
                // (category === "official") 一律隐藏：它们 base_url 故意留空、走客户端
                // 默认/OAuth 端点，cc-switch 没有可靠的探测目标（尤其 Claude Desktop
                // 官方是原生 1P 模式，根本不在请求路径上）。
                onTest && provider.category !== "official"
                  ? () => onTest(provider)
                  : undefined
              }
              onConfigureUsage={
                (isOfficial && !supportsOfficialSubscription) ||
                isCopilot ||
                isCodexOauth
                  ? undefined
                  : () => onConfigureUsage(provider)
              }
              onDelete={() => onDelete(provider)}
              onRemoveFromConfig={
                onRemoveFromConfig
                  ? () => onRemoveFromConfig(provider)
                  : undefined
              }
              onDisableOmo={handleDisableAnyOmo}
              onOpenTerminal={
                onOpenTerminal ? () => onOpenTerminal(provider) : undefined
              }
              isAutoFailoverEnabled={isAutoFailoverEnabled}
              isInFailoverQueue={isInFailoverQueue}
              onToggleFailover={onToggleFailover}
              // OpenClaw: default model
              isDefaultModel={isDefaultModel}
              onSetAsDefault={onSetAsDefault}
            />
            </div>
          </div>
        </div>
      </div>

      {isExpanded && hasMultiplePlans && (
        <div className="mt-4 pt-4 border-t border-border-default">
          <UsageFooter
            provider={provider}
            providerId={provider.id}
            appId={appId}
            usageEnabled={usageEnabled}
            isCurrent={isCurrent}
            isInConfig={isInConfig}
            inline={false}
          />
        </div>
      )}
    </div>
  );

  if (!onCopyToApp) {
    return card;
  }

  return (
    <ProviderContextMenu
      provider={provider}
      appId={appId}
      visibleApps={visibleApps}
      onDuplicate={onDuplicate}
      onCopyToApp={onCopyToApp}
    >
      {card}
    </ProviderContextMenu>
  );
}
