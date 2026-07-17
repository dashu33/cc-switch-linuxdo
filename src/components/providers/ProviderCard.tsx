import { useMemo, useState, useEffect } from "react";
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Loader2,
  CircleCheck,
  CircleX,
  CircleMinus,
  Pin,
} from "lucide-react";
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
import { pickModelBrandIcons } from "@/utils/modelBrandIcon";
import { applyProviderModel } from "@/utils/applyProviderModel";
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
  sequenceNumber?: number;
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
  isDragDisabled?: boolean;
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
  /** 最近一次完成的批量探测结果：右侧悬浮状态图标 */
  modelsProbeHistoryStatus?: ModelsProbeStatus;
  /** 最近一次失败/跳过原因（稳定分类码，可持久） */
  modelsProbeReason?: string;
  /** 最近一次探测到的模型 id 列表（用于行内 brand LOGO） */
  modelsProbeModelIds?: string[];
  /** 行内「获取」完成后写入持久探测历史 */
  onModelsProbeResult?: (entry: {
    status: ModelsProbeStatus;
    modelCount?: number;
    modelIds?: string[];
    reason?: string;
  }) => void;
  /** 是否允许上下移动（自定义排序） */
  canReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onPinToTop?: () => void;
  canPinToTop?: boolean;
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
  sequenceNumber,
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
  isDragDisabled = false,
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
  modelsProbeHistoryStatus,
  modelsProbeReason,
  modelsProbeModelIds,
  onModelsProbeResult,
  canReorder = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onPinToTop,
  canPinToTop = false,
  scrollHighlight = false,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const modelLogoPack = useMemo(
    () => pickModelBrandIcons(modelsProbeModelIds),
    [modelsProbeModelIds],
  );
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
  const hasInlineQuickAdjust =
    Boolean(onUpdate) &&
    (appId === "codex" || appId === "claude" || appId === "claude-desktop");
  const codexNeedsRouting = useMemo(() => {
    if (appId !== "codex") return false;
    if (
      provider.meta?.apiFormat === "openai_chat" ||
      provider.meta?.apiFormat === "anthropic"
    )
      return true;
    // 真·官方（无自定义 config 语义）通常不需要路由；有 TOML 时再看 wire_api
    const config = (provider.settingsConfig as Record<string, any>)?.config;
    return (
      typeof config === "string" &&
      (isCodexChatWireApi(extractCodexWireApi(config)) ||
        isCodexAnthropicWireApi(extractCodexWireApi(config)))
    );
  }, [
    appId,
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

  const canRename = Boolean(onUpdate) && !isHermesReadOnly && !isAnyOmo;

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
          effectiveProbeStatus === "idle" &&
            shouldUseGreen &&
            "from-emerald-500/10",
          effectiveProbeStatus === "idle" &&
            shouldUseBlue &&
            "from-blue-500/10",
          effectiveProbeStatus === "idle" &&
            !shouldUseGreen &&
            !shouldUseBlue &&
            "from-primary/10",
          effectiveProbeStatus !== "idle" ||
            isActiveProvider ||
            hasPersistentConfigHighlight
            ? "opacity-100"
            : "opacity-0",
        )}
      />
      <div
        className="absolute right-2 top-2 z-30 rounded-full bg-card/90 p-0.5 shadow-sm ring-1 ring-border/50 backdrop-blur-sm"
        role="img"
        title={
          modelsProbeHistoryStatus === "success"
            ? t("provider.modelsProbeAvailable", {
                defaultValue: "上次拉取成功",
              })
            : modelsProbeHistoryStatus
              ? t("provider.modelsProbeUnavailable", {
                  defaultValue: "上次拉取不可用",
                })
              : t("provider.modelsProbeNotChecked", {
                  defaultValue: "尚未手动拉取",
                })
        }
        aria-label={
          modelsProbeHistoryStatus === "success"
            ? t("provider.modelsProbeAvailable", {
                defaultValue: "上次拉取成功",
              })
            : modelsProbeHistoryStatus
              ? t("provider.modelsProbeUnavailable", {
                  defaultValue: "上次拉取不可用",
                })
              : t("provider.modelsProbeNotChecked", {
                  defaultValue: "尚未手动拉取",
                })
        }
      >
        {modelsProbeHistoryStatus === "success" ? (
          <CircleCheck className="h-4 w-4 text-emerald-500" />
        ) : modelsProbeHistoryStatus ? (
          <CircleX className="h-4 w-4 text-red-500" />
        ) : (
          <CircleMinus className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* 左侧窄 rail：序号 +（自定义排序时）移动控件；不侵占 Provider 图标区 */}
          <div className="flex w-7 shrink-0 flex-col items-center justify-center gap-0.5 self-center">
            {sequenceNumber !== undefined && (
              <span
                className="w-full text-center text-sm font-extrabold leading-none tabular-nums text-foreground"
                aria-label={t("provider.sequenceNumber", {
                  number: sequenceNumber,
                  defaultValue: "序号 {{number}}",
                })}
              >
                {sequenceNumber}
              </span>
            )}
            {canReorder && (
              <div
                className={cn(
                  "flex flex-col items-center gap-0",
                  "opacity-0 transition-opacity duration-150",
                  "group-hover:opacity-100 group-focus-within:opacity-100",
                  dragHandleProps?.isDragging && "opacity-100",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-3.5 w-5 items-center justify-center rounded-sm p-0",
                    "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
                    !canMoveUp && "pointer-events-none opacity-30",
                  )}
                  disabled={!canMoveUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={t("provider.moveUp", { defaultValue: "上移" })}
                  aria-label={t("provider.moveUp", { defaultValue: "上移" })}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-3.5 w-5 cursor-grab items-center justify-center rounded-sm p-0",
                    "text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing",
                    dragHandleProps?.isDragging && "cursor-grabbing",
                    isDragDisabled && "cursor-default opacity-30",
                  )}
                  aria-label={t("provider.dragHandle")}
                  title={
                    isDragDisabled
                      ? t("provider.dragDisabledHint", {
                          defaultValue: "切换到自定义排序后可拖拽",
                        })
                      : t("provider.dragToReorder")
                  }
                  disabled={isDragDisabled}
                  onClick={(e) => e.stopPropagation()}
                  {...(dragHandleProps?.attributes ?? {})}
                  {...(dragHandleProps?.listeners ?? {})}
                >
                  <GripVertical className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-3.5 w-5 items-center justify-center rounded-sm p-0",
                    "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
                    !canMoveDown && "pointer-events-none opacity-30",
                  )}
                  disabled={!canMoveDown}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={t("provider.moveDown", { defaultValue: "下移" })}
                  aria-label={t("provider.moveDown", { defaultValue: "下移" })}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center border border-border group-hover:scale-105 transition-transform duration-300">
              <ProviderIcon
                icon={provider.icon}
                name={provider.name}
                color={provider.iconColor}
                size={20}
              />
            </div>
            {canPinToTop && onPinToTop && (
              <button
                type="button"
                className={cn(
                  "inline-flex h-6 w-8 items-center justify-center rounded-md border border-border/60 bg-muted/40",
                  "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinToTop();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title={t("provider.pinToTop", { defaultValue: "置顶" })}
                aria-label={t("provider.pinToTop", { defaultValue: "置顶" })}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
            )}
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

            {/* Codex / Claude / Claude Desktop：上游格式 + 模型下拉 + 获取 + LOGO
                不因 category=official 隐藏——第三方转发常被标成官方分类，有凭证即可用 */}
            {hasInlineQuickAdjust && onUpdate && (
              <CodexProviderQuickAdjust
                appId={appId}
                provider={provider}
                onUpdate={onUpdate}
                modelsProbeStatus={modelsProbeStatus}
                modelsProbeHistoryStatus={modelsProbeHistoryStatus}
                modelsProbeReason={modelsProbeReason}
                onProbeResult={onModelsProbeResult}
                modelBrandIcons={modelLogoPack.icons}
                modelOptions={modelsProbeModelIds}
                onSelectBrandModel={(modelId) => {
                  const next = applyProviderModel(provider, appId, modelId);
                  if (next) void Promise.resolve(onUpdate(next));
                }}
                belowUpstream={
                  <ProviderProxyUsageSummary
                    stats={proxyUsageStats}
                    recentStats={proxyRecentUsageStats}
                  />
                }
              />
            )}

            {/* 其它应用：模型 LOGO 网格；已挂快速调整的应用不再重复 */}
            {!hasInlineQuickAdjust && modelLogoPack.icons.length > 0 && (
              <div
                className="grid w-full min-w-0 grid-cols-6 gap-1.5 pt-0.5"
                style={{ maxWidth: "calc(6 * 2.25rem + 5 * 0.375rem)" }}
                title={t("provider.probedModelLogos", {
                  defaultValue: "探测到的模型品牌",
                })}
              >
                {modelLogoPack.icons.map((item) => {
                  const clickable = Boolean(onUpdate && item.modelId);
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
                        if (!onUpdate || !item.modelId) return;
                        const next = applyProviderModel(
                          provider,
                          appId,
                          item.modelId,
                        );
                        if (next) {
                          void Promise.resolve(onUpdate(next));
                        }
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

            {/* 已挂 quick-adjust 的应用：成功率摘要改在上游格式下方，避免重复 */}
            {!hasInlineQuickAdjust && (
              <ProviderProxyUsageSummary
                stats={proxyUsageStats}
                recentStats={proxyRecentUsageStats}
              />
            )}
          </div>
        </div>

        {/* 右侧：Usage 单行（无小气泡）+ 最近调用卡片；启用操作行垂直居中 */}
        <div className="relative ml-auto flex w-full min-w-0 shrink-0 flex-col self-stretch sm:w-[360px] xl:w-[400px]">
          {/* 用量查询：与最近调用同宽，单行，不套外层气泡 */}
          {(isCopilot ||
            isCodexOauth ||
            (isOfficial && officialSubscriptionEnabled) ||
            hasMultiplePlans ||
            usageEnabled) && (
            <div className="pointer-events-auto z-20 mb-1 flex h-7 w-full min-w-0 items-center justify-end gap-1 overflow-hidden">
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
          )}

          <div className="relative min-h-[104px] flex-1 self-stretch">
            <ProviderRecentCallsPanel
              appId={appId}
              providerName={provider.name}
              isCurrent={isCurrent}
              className="absolute inset-0"
            />
          </div>
        </div>

        {/* 启用/操作按钮：整行垂直居中（不再贴底） */}
        <div className="pointer-events-none absolute inset-y-0 right-2 z-20 flex w-[calc(100%-1rem)] items-center justify-end opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 sm:right-3 sm:w-[360px] xl:w-[400px]">
          <div className="flex max-w-full items-center justify-end rounded-md bg-card/90 px-1 py-0.5 shadow-sm ring-1 ring-border/50 backdrop-blur-sm">
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
              isDefaultModel={isDefaultModel}
              onSetAsDefault={onSetAsDefault}
            />
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
