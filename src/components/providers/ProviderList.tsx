import { CSS } from "@dnd-kit/utilities";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  ListOrdered,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Provider, VisibleApps } from "@/types";
import type { AppId } from "@/lib/api";
import { providersApi } from "@/lib/api/providers";
import { useDragSort } from "@/hooks/useDragSort";
import {
  useOpenClawLiveProviderIds,
  useOpenClawDefaultModel,
} from "@/hooks/useOpenClaw";
import {
  useHermesLiveProviderIds,
  useHermesModelConfig,
} from "@/hooks/useHermes";
import { useStreamCheck } from "@/hooks/useStreamCheck";
import { ProviderCard } from "@/components/providers/ProviderCard";
import { ProviderEmptyState } from "@/components/providers/ProviderEmptyState";
import {
  useAutoFailoverEnabled,
  useFailoverQueue,
  useAddToFailoverQueue,
  useRemoveFromFailoverQueue,
} from "@/lib/query/failover";
import {
  useCurrentOmoProviderId,
  useCurrentOmoSlimProviderId,
} from "@/lib/query/omo";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { useProviderStats } from "@/lib/query/usage";
import type { ProviderStats } from "@/types/usage";
import type { UsageRangeSelection } from "@/types/usage";
import type {
  ModelsProbeById,
  ModelsProbeStatus,
} from "@/hooks/useFetchCurrentProviderModels";
import {
  isProviderSortMode,
  sortProvidersByMode,
  type ProviderSortMode,
} from "@/utils/providerSort";

const providerSortStorageKey = (appId: AppId) =>
  `cc-switch-provider-sort-mode:${appId}`;

function readProviderSortMode(appId: AppId): ProviderSortMode {
  try {
    const stored = globalThis.localStorage?.getItem(
      providerSortStorageKey(appId),
    );
    return isProviderSortMode(stored) ? stored : "manual";
  } catch {
    return "manual";
  }
}

export type ProviderListHandle = {
  /** 滚动并高亮当前正在使用的供应商；找不到返回 false */
  scrollToCurrentProvider: () => boolean;
  /** 打开供应商搜索；按 Enter 后定位首个匹配项 */
  openSearch: () => void;
};

interface ProviderListProps {
  providers: Record<string, Provider>;
  currentProviderId: string;
  appId: AppId;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onUpdate?: (provider: Provider) => void | Promise<void>;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onDuplicate: (provider: Provider) => void;
  onCopyToApp?: (provider: Provider, targetApp: AppId) => void;
  visibleApps?: VisibleApps;
  onConfigureUsage?: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onOpenTerminal?: (provider: Provider) => void;
  onCreate?: () => void;
  isLoading?: boolean;
  isProxyRunning?: boolean; // 代理服务运行状态
  isProxyTakeover?: boolean; // 代理接管模式（Live配置已被接管）
  activeProviderId?: string; // 代理当前实际使用的供应商 ID（用于故障转移模式下标注绿色边框）
  onSetAsDefault?: (provider: Provider) => void; // OpenClaw: set as default model
  /** 一键拉模型探测结果（按 providerId 匹配当前卡） */
  modelsProbeStatus?: ModelsProbeStatus;
  modelsProbeProviderId?: string | null;
  /** 批量探测：每张卡独立状态 */
  modelsProbeById?: ModelsProbeById;
  /** 最近一次完成的批量探测结果，用于持久状态图标 */
  modelsProbeHistoryById?: ModelsProbeById;
  /** 与当前 Provider 列表相关的快捷操作，显示在排序子菜单右侧 */
  toolbarActions?: ReactNode;
}

export const ProviderList = forwardRef<ProviderListHandle, ProviderListProps>(function ProviderList({
  providers,
  currentProviderId,
  appId,
  onSwitch,
  onEdit,
  onUpdate,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onDuplicate,
  onCopyToApp,
  visibleApps,
  onConfigureUsage,
  onOpenWebsite,
  onOpenTerminal,
  onCreate,
  isLoading = false,
  isProxyRunning = false,
  isProxyTakeover = false,
  activeProviderId,
  onSetAsDefault,
  modelsProbeStatus = "idle",
  modelsProbeProviderId = null,
  modelsProbeById = {},
  modelsProbeHistoryById = {},
  toolbarActions,
}, ref) {
  const { t, i18n } = useTranslation();
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const searchTermRef = useRef("");
  const { checkProvider, isChecking } = useStreamCheck(appId);
  const { sortedProviders, sensors, handleDragEnd } = useDragSort(
    providers,
    appId,
  );

  const { data: opencodeLiveIds } = useQuery({
    queryKey: ["opencodeLiveProviderIds"],
    queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
    enabled: appId === "opencode",
  });

  // OpenClaw: 查询 live 配置中的供应商 ID 列表，用于判断 isInConfig
  const { data: openclawLiveIds } = useOpenClawLiveProviderIds(
    appId === "openclaw",
  );

  // Hermes: 查询 live 配置中的供应商 ID 列表，用于判断 isInConfig
  const { data: hermesLiveIds } = useHermesLiveProviderIds(
    appId === "hermes",
  );

  // Hermes: 读取当前 model.provider，用于判断哪个供应商是"当前激活"（高亮）
  const { data: hermesModelConfig } = useHermesModelConfig(
    appId === "hermes",
  );
  const hermesCurrentProviderId = hermesModelConfig?.provider;

  // 本地 proxy/session 用量：列表级批量拉取一次，按 providerId 分发到卡片
  // 口径与「用量统计」页的 Provider 统计一致（默认近 7 天）
  const providerUsageRange = useMemo<UsageRangeSelection>(
    () => ({ preset: "7d" }),
    [],
  );
  // 近 5 分钟：即时可用性（成功率）
  const providerRecentUsageRange = useMemo<UsageRangeSelection>(
    () => ({ preset: "5m" }),
    [],
  );
  const { data: providerStatsList } = useProviderStats(
    providerUsageRange,
    { appType: appId },
    {
      // 列表统计缓存：从设置返回时先展示旧值，避免整页卡顿
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
    },
  );
  const { data: providerRecentStatsList } = useProviderStats(
    providerRecentUsageRange,
    { appType: appId },
    {
      // 近 5 分钟更需要新鲜度，但仍保留短缓存避免视图切换时全量重拉
      staleTime: 15_000,
      gcTime: 10 * 60_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );

  const buildStatsMaps = useCallback((list?: ProviderStats[]) => {
    const byId = new Map<string, ProviderStats>();
    const byName = new Map<string, ProviderStats>();
    for (const stat of list ?? []) {
      if (stat.providerId) {
        byId.set(stat.providerId, stat);
      }
      if (stat.providerName) {
        byName.set(stat.providerName, stat);
      }
    }
    return { byId, byName };
  }, []);

  const providerStatsById = useMemo(
    () => buildStatsMaps(providerStatsList),
    [buildStatsMaps, providerStatsList],
  );
  const providerRecentStatsById = useMemo(
    () => buildStatsMaps(providerRecentStatsList),
    [buildStatsMaps, providerRecentStatsList],
  );

  const resolveProviderStats = useCallback(
    (provider: Provider): ProviderStats | undefined => {
      return (
        providerStatsById.byId.get(provider.id) ??
        providerStatsById.byName.get(provider.name)
      );
    },
    [providerStatsById],
  );

  const resolveProviderRecentStats = useCallback(
    (provider: Provider): ProviderStats | undefined => {
      return (
        providerRecentStatsById.byId.get(provider.id) ??
        providerRecentStatsById.byName.get(provider.name)
      );
    },
    [providerRecentStatsById],
  );

  // 判断供应商是否已添加到配置（累加模式应用：OpenCode/OpenClaw/Hermes）
  const isProviderInConfig = useCallback(
    (providerId: string): boolean => {
      if (appId === "opencode") {
        return opencodeLiveIds?.includes(providerId) ?? false;
      }
      if (appId === "openclaw") {
        return openclawLiveIds?.includes(providerId) ?? false;
      }
      if (appId === "hermes") {
        return hermesLiveIds?.includes(providerId) ?? false;
      }
      return true; // 其他应用始终返回 true
    },
    [appId, opencodeLiveIds, openclawLiveIds, hermesLiveIds],
  );

  // OpenClaw: query default model to determine which provider is default
  const { data: openclawDefaultModel } = useOpenClawDefaultModel(
    appId === "openclaw",
  );

  const isProviderDefaultModel = useCallback(
    (providerId: string): boolean => {
      if (appId !== "openclaw" || !openclawDefaultModel?.primary)
        return false;
      return openclawDefaultModel.primary.startsWith(providerId + "/");
    },
    [appId, openclawDefaultModel],
  );

  // 故障转移相关
  const { data: isAutoFailoverEnabled } = useAutoFailoverEnabled(appId);
  const { data: failoverQueue } = useFailoverQueue(appId);
  const addToQueue = useAddToFailoverQueue();
  const removeFromQueue = useRemoveFromFailoverQueue();

  const isFailoverModeActive =
    isProxyTakeover === true && isAutoFailoverEnabled === true;

  const isOpenCode = appId === "opencode";
  const { data: currentOmoId } = useCurrentOmoProviderId(isOpenCode);
  const { data: currentOmoSlimId } = useCurrentOmoSlimProviderId(isOpenCode);

  const getFailoverPriority = useCallback(
    (providerId: string): number | undefined => {
      if (!isFailoverModeActive || !failoverQueue) return undefined;
      const index = failoverQueue.findIndex(
        (item) => item.providerId === providerId,
      );
      return index >= 0 ? index + 1 : undefined;
    },
    [isFailoverModeActive, failoverQueue],
  );

  const isInFailoverQueue = useCallback(
    (providerId: string): boolean => {
      if (!isFailoverModeActive || !failoverQueue) return false;
      return failoverQueue.some((item) => item.providerId === providerId);
    },
    [isFailoverModeActive, failoverQueue],
  );

  const handleToggleFailover = useCallback(
    (providerId: string, enabled: boolean) => {
      if (enabled) {
        addToQueue.mutate({ appType: appId, providerId });
      } else {
        removeFromQueue.mutate({ appType: appId, providerId });
      }
    },
    [appId, addToQueue, removeFromQueue],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<ProviderSortMode>(() =>
    readProviderSortMode(appId),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scrollHighlightId, setScrollHighlightId] = useState<string | null>(
    null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { data: claudeDesktopStatus } = useQuery({
    queryKey: ["claudeDesktopStatus"],
    queryFn: () => providersApi.getClaudeDesktopStatus(),
    enabled: appId === "claude-desktop",
    refetchInterval: appId === "claude-desktop" ? 5000 : false,
  });

  // 连通性检查不发真实请求、无封号/计费风险，直接执行（无需确认弹窗）。
  const handleTest = useCallback(
    (provider: Provider) => {
      checkProvider(provider.id, provider.name);
    },
    [checkProvider],
  );

  // Import current live config as default provider
  const queryClient = useQueryClient();
  const importMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (appId === "opencode") {
        const count = await providersApi.importOpenCodeFromLive();
        return count > 0;
      }
      if (appId === "openclaw") {
        const count = await providersApi.importOpenClawFromLive();
        return count > 0;
      }
      if (appId === "hermes") {
        const count = await providersApi.importHermesFromLive();
        return count > 0;
      }
      if (appId === "claude-desktop") {
        const count = await providersApi.importClaudeDesktopFromClaude();
        return count > 0;
      }
      return providersApi.importDefault(appId);
    },
    onSuccess: (imported) => {
      if (imported) {
        queryClient.invalidateQueries({ queryKey: ["providers", appId] });
        if (appId === "claude-desktop") {
          queryClient.invalidateQueries({
            queryKey: ["claudeDesktopStatus"],
          });
        }
        toast.success(t("provider.importCurrentDescription"));
      } else {
        toast.info(t("provider.noProviders"));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "f") {
        // 正在输入框/可编辑区域中时不抢占 Ctrl+F（例如添加供应商表单里
        // ProviderPresetSelector 的搜索框），避免与其同名快捷键冲突。
        if (isTextEditableTarget(document.activeElement)) return;
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (key === "escape") {
        setIsSearchOpen(false);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  useEffect(() => {
    setSortMode(readProviderSortMode(appId));
  }, [appId]);

  const selectSortMode = useCallback(
    (mode: ProviderSortMode) => {
      setSortMode(mode);
      try {
        globalThis.localStorage?.setItem(providerSortStorageKey(appId), mode);
      } catch {
        // Sorting still works for this session when storage is unavailable.
      }
    },
    [appId],
  );

  const displayProviders = useMemo(() => {
    if (sortMode === "manual") return sortedProviders;

    const locale =
      i18n.language === "zh"
        ? "zh-CN"
        : i18n.language === "zh-TW"
          ? "zh-TW"
          : i18n.language === "ja"
            ? "ja-JP"
            : "en-US";
    return sortProvidersByMode(sortedProviders, sortMode, locale);
  }, [i18n.language, sortMode, sortedProviders]);

  const providerSequenceById = useMemo(
    () =>
      new Map(
        displayProviders.map((provider, index) => [provider.id, index + 1]),
      ),
    [displayProviders],
  );

  useEffect(() => {
    if (isSearchOpen) {
      const frame = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isSearchOpen]);

  const filteredProviders = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return displayProviders;
    return displayProviders.filter((provider) => {
      const fields = [provider.name, provider.notes, provider.websiteUrl];
      return fields.some((field) =>
        field?.toString().toLowerCase().includes(keyword),
      );
    });
  }, [displayProviders, searchTerm]);

  /** 与卡片 isCurrent 一致的「正在使用」供应商 ID */
  const resolveInUseProviderId = useCallback((): string | null => {
    // 代理接管/故障转移：优先实际在跑的供应商
    if (
      (isProxyTakeover || isFailoverModeActive) &&
      activeProviderId &&
      providers[activeProviderId]
    ) {
      return activeProviderId;
    }
    if (
      appId === "hermes" &&
      hermesCurrentProviderId &&
      providers[hermesCurrentProviderId]
    ) {
      return hermesCurrentProviderId;
    }
    if (currentProviderId && providers[currentProviderId]) {
      return currentProviderId;
    }
    if (currentOmoId && providers[currentOmoId]) {
      return currentOmoId;
    }
    if (currentOmoSlimId && providers[currentOmoSlimId]) {
      return currentOmoSlimId;
    }
    return null;
  }, [
    activeProviderId,
    appId,
    currentOmoId,
    currentOmoSlimId,
    currentProviderId,
    hermesCurrentProviderId,
    isFailoverModeActive,
    isProxyTakeover,
    providers,
  ]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const scrollToProvider = useCallback(
    (targetId: string) => {
      if (!providers[targetId]) return false;
      const isTargetVisible = () =>
        Object.prototype.hasOwnProperty.call(providers, targetId) &&
        (searchTermRef.current.trim() === "" ||
          filteredProviders.some((p) => p.id === targetId));

      // 搜索把当前供应商藏起来时，先清空搜索再定位
      const needClearSearch =
        !isTargetVisible() && Boolean(searchTermRef.current.trim());
      if (needClearSearch) {
        setSearchTerm("");
        setIsSearchOpen(false);
      }

      const findScrollableParents = (el: HTMLElement): HTMLElement[] => {
        const parents: HTMLElement[] = [];
        let parent: HTMLElement | null = el.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          const overflowY = style.overflowY;
          const overflow = style.overflow;
          const allowsY =
            overflowY === "auto" ||
            overflowY === "scroll" ||
            overflowY === "overlay" ||
            overflow === "auto" ||
            overflow === "scroll" ||
            overflow === "overlay";
          // flex 布局下 scrollHeight 可能接近 clientHeight，放宽阈值
          if (allowsY && parent.scrollHeight > parent.clientHeight - 1) {
            parents.push(parent);
          }
          parent = parent.parentElement;
        }
        return parents;
      };

      const scrollProviderIntoView = (el: HTMLElement) => {
        const scrollParents = findScrollableParents(el);
        if (scrollParents.length === 0) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        // 从最外层到最内层：每层用当前几何位置重算，避免嵌套滚动位移叠加错误
        // 外层先 instant，最内层 smooth，体感更准
        const ordered = [...scrollParents].reverse();
        ordered.forEach((parent, index) => {
          const parentRect = parent.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const delta =
            elRect.top -
            parentRect.top -
            parent.clientHeight / 2 +
            elRect.height / 2;
          const nextTop = Math.max(
            0,
            Math.min(
              parent.scrollHeight - parent.clientHeight,
              parent.scrollTop + delta,
            ),
          );
          const isLast = index === ordered.length - 1;
          parent.scrollTo({
            top: nextTop,
            behavior: isLast ? "smooth" : "auto",
          });
        });
      };

      const queryTargetEl = (): HTMLElement | null => {
        const safeId =
          typeof globalThis.CSS !== "undefined" &&
          typeof globalThis.CSS.escape === "function"
            ? globalThis.CSS.escape(targetId)
            : targetId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const selector = `[data-provider-id="${safeId}"]`;
        const scope: ParentNode = listRootRef.current ?? document;
        const matches = Array.from(
          scope.querySelectorAll(selector),
        ) as HTMLElement[];
        const pool =
          matches.length > 0
            ? matches
            : (Array.from(
                document.querySelectorAll(selector),
              ) as HTMLElement[]);
        if (pool.length === 0) return null;
        return (
          pool.find(
            (node) => node.getAttribute("data-provider-current") === "true",
          ) ??
          pool[pool.length - 1] ??
          null
        );
      };

      const runScroll = (): boolean => {
        const el = queryTargetEl();
        if (!el) return false;
        scrollProviderIntoView(el);
        // smooth 过程中再校正一次，处理双层 overflow 布局滞后
        window.setTimeout(() => {
          const latest = queryTargetEl();
          if (latest) scrollProviderIntoView(latest);
        }, 120);
        setScrollHighlightId(targetId);
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = setTimeout(() => {
          setScrollHighlightId((cur) => (cur === targetId ? null : cur));
        }, 1800);
        return true;
      };

      if (runScroll()) return true;

      // 清空搜索 / 列表重渲染后多拍重试
      const retryDelays = [0, 50, 120, 250, 400];
      let succeeded = false;
      for (const delay of retryDelays) {
        window.setTimeout(() => {
          if (succeeded) return;
          if (runScroll()) {
            succeeded = true;
          }
        }, delay);
      }
      // 仅在刚清空搜索、等待 DOM 重挂时对调用方返回 true；
      // loading / 未找到 DOM 时返回 false，让 App 侧继续重试。
      return needClearSearch;
    },
    [filteredProviders, providers],
  );

  const locateFirstSearchResult = useCallback(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return false;
    const target =
      filteredProviders.find(
        (provider) => provider.name.trim().toLowerCase() === keyword,
      ) ?? filteredProviders[0];
    if (!target) return false;

    setIsSearchOpen(false);
    setSearchTerm("");
    searchTermRef.current = "";
    return scrollToProvider(target.id);
  }, [filteredProviders, scrollToProvider, searchTerm]);

  useImperativeHandle(
    ref,
    () => ({
      openSearch: () => setIsSearchOpen(true),
      scrollToCurrentProvider: () => {
        const targetId = resolveInUseProviderId();
        return targetId ? scrollToProvider(targetId) : false;
      },
    }),
    [resolveInUseProviderId, scrollToProvider],
  );

  const claudeDesktopStatusMessages = useMemo(() => {
    if (appId !== "claude-desktop" || !claudeDesktopStatus) return [];

    const messages: string[] = [];
    if (!claudeDesktopStatus.supported) {
      messages.push(
        t("claudeDesktop.statusUnsupported", {
          defaultValue: "当前平台暂不支持 Claude Desktop 3P 配置写入。",
        }),
      );
      return messages;
    }

    if (claudeDesktopStatus.staleRawModels) {
      messages.push(
        t("claudeDesktop.statusStaleRawModels", {
          defaultValue:
            "Claude Desktop profile 中存在非 claude-* 模型名，新版 Claude Desktop 可能拒绝加载；重新切换当前供应商可修复。",
        }),
      );
    }
    if (claudeDesktopStatus.missingRouteMappings) {
      messages.push(
        t("claudeDesktop.statusMissingRouteMappings", {
          defaultValue:
            "当前供应商启用了模型映射，但没有有效路由；请编辑供应商并补全至少一个模型映射。",
        }),
      );
    }
    if (
      claudeDesktopStatus.mode === "proxy" &&
      !claudeDesktopStatus.gatewayTokenConfigured
    ) {
      messages.push(
        t("claudeDesktop.statusGatewayTokenMissing", {
          defaultValue:
            "当前本地路由 token 尚未生成；重新切换该供应商会写入新的本地 token。",
        }),
      );
    }

    const expected = claudeDesktopStatus.expectedBaseUrl?.replace(/\/+$/, "");
    const actual = claudeDesktopStatus.actualBaseUrl?.replace(/\/+$/, "");
    if (expected && actual && expected !== actual) {
      messages.push(
        t("claudeDesktop.statusBaseUrlMismatch", {
          expected,
          actual,
          defaultValue:
            "Claude Desktop profile 指向的地址与当前供应商不一致；当前为 {{actual}}，应为 {{expected}}。重新切换当前供应商可修复。",
        }),
      );
    }

    return messages;
  }, [appId, claudeDesktopStatus, t]);

  const renderProviderList = () => (
    <DndContext
      sensors={sortMode === "manual" ? sensors : []}
      collisionDetection={closestCenter}
      onDragEnd={sortMode === "manual" ? handleDragEnd : undefined}
    >
      <SortableContext
        items={filteredProviders.map((provider) => provider.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {filteredProviders.map((provider) => {
            const isOmo = provider.category === "omo";
            const isOmoSlim = provider.category === "omo-slim";
            const isOmoCurrent =
              isOmo && provider.id === (currentOmoId || "");
            const isOmoSlimCurrent =
              isOmoSlim && provider.id === (currentOmoSlimId || "");
            const isHermesCurrent =
              appId === "hermes" && hermesCurrentProviderId === provider.id;
            return (
              <SortableProviderCard
                key={provider.id}
                provider={provider}
                sequenceNumber={providerSequenceById.get(provider.id) ?? 0}
                dragDisabled={sortMode !== "manual"}
                isCurrent={
                  isOmo
                    ? isOmoCurrent
                    : isOmoSlim
                      ? isOmoSlimCurrent
                      : appId === "hermes"
                        ? isHermesCurrent
                        : provider.id === currentProviderId
                }
                appId={appId}
                isInConfig={isProviderInConfig(provider.id)}
                isOmo={isOmo}
                isOmoSlim={isOmoSlim}
                onSwitch={onSwitch}
                onEdit={onEdit}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onRemoveFromConfig={onRemoveFromConfig}
                onDisableOmo={onDisableOmo}
                onDisableOmoSlim={onDisableOmoSlim}
                onDuplicate={onDuplicate}
                onCopyToApp={onCopyToApp}
                visibleApps={visibleApps}
                onConfigureUsage={onConfigureUsage}
                onOpenWebsite={onOpenWebsite}
                onOpenTerminal={onOpenTerminal}
                onTest={handleTest}
                isTesting={isChecking(provider.id)}
                isProxyRunning={isProxyRunning}
                isProxyTakeover={isProxyTakeover}
                isAutoFailoverEnabled={isFailoverModeActive}
                failoverPriority={getFailoverPriority(provider.id)}
                isInFailoverQueue={isInFailoverQueue(provider.id)}
                onToggleFailover={(enabled) =>
                  handleToggleFailover(provider.id, enabled)
                }
                activeProviderId={activeProviderId}
                // OpenClaw: default model / Hermes: model.provider === provider.id
                isDefaultModel={
                  appId === "hermes"
                    ? isHermesCurrent
                    : isProviderDefaultModel(provider.id)
                }
                onSetAsDefault={
                  onSetAsDefault ? () => onSetAsDefault(provider) : undefined
                }
                proxyUsageStats={resolveProviderStats(provider)}
                proxyRecentUsageStats={resolveProviderRecentStats(provider)}
                modelsProbeStatus={
                  modelsProbeById[provider.id]?.status ??
                  (modelsProbeProviderId === provider.id
                    ? modelsProbeStatus
                    : "idle")
                }
                modelsProbeHistoryStatus={
                  modelsProbeHistoryById[provider.id]?.status
                }
                scrollHighlight={scrollHighlightId === provider.id}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );

  return (
    <div ref={listRootRef} className="space-y-4">
      <div className="sticky top-0 z-20 flex min-h-12 items-center gap-2 overflow-x-auto border-b border-border/60 bg-background/95 py-2 backdrop-blur-md">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {t("provider.sortBy", { defaultValue: "排序" })}
        </span>
        <div
          className="flex shrink-0 items-center gap-1 rounded-md bg-muted p-1"
          role="group"
          aria-label={t("provider.sortBy", { defaultValue: "排序" })}
        >
          {(
            [
              ["manual", ListOrdered],
              ["newest", CalendarArrowDown],
              ["oldest", CalendarArrowUp],
              ["name", ArrowDownAZ],
            ] as const
          ).map(([mode, Icon]) => (
            <Button
              key={mode}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm"
              data-active={sortMode === mode}
              aria-pressed={sortMode === mode}
              onClick={() => selectSortMode(mode)}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`provider.sortMode.${mode}`)}
            </Button>
          ))}
        </div>
        {toolbarActions && (
          <div
            className="ml-auto flex shrink-0 items-center gap-1 border-l border-border/60 pl-2"
            role="toolbar"
            aria-label={t("common.actions", { defaultValue: "操作" })}
          >
            {toolbarActions}
          </div>
        )}
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums text-muted-foreground",
            !toolbarActions && "ml-auto",
          )}
        >
          {t("provider.providerCount", {
            count: displayProviders.length,
            defaultValue: "{{count}} 个供应商",
          })}
        </span>
      </div>
      {claudeDesktopStatusMessages.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("claudeDesktop.statusTitle", {
              defaultValue: "Claude Desktop 配置需要检查",
            })}
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed">
            {claudeDesktopStatusMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            key="provider-search"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed left-1/2 top-[6.5rem] z-40 w-[min(90vw,26rem)] -translate-x-1/2 sm:right-6 sm:left-auto sm:translate-x-0"
          >
            <div className="p-4 space-y-3 border shadow-md rounded-2xl border-white/10 bg-background/95 shadow-black/20 backdrop-blur-md">
              <div className="relative flex items-center gap-2">
                <Search className="absolute w-4 h-4 -translate-y-1/2 pointer-events-none left-3 top-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      locateFirstSearchResult();
                    }
                  }}
                  placeholder={t("provider.searchPlaceholder", {
                    defaultValue: "Search name, notes, or URL...",
                  })}
                  aria-label={t("provider.searchAriaLabel", {
                    defaultValue: "Search providers",
                  })}
                  className="pr-16 pl-9"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute text-xs -translate-y-1/2 right-11 top-1/2"
                    onClick={() => setSearchTerm("")}
                  >
                    {t("common.clear", { defaultValue: "Clear" })}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setIsSearchOpen(false)}
                  aria-label={t("provider.searchCloseAriaLabel", {
                    defaultValue: "Close provider search",
                  })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {t("provider.searchScopeHint", {
                    defaultValue: "Matches provider name, notes, and URL.",
                  })}
                </span>
                <span>
                  {t("provider.searchCloseHint", {
                    defaultValue: "Press Esc to close",
                  })}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="w-full border border-dashed rounded-lg h-28 border-muted-foreground/40 bg-muted/40"
            />
          ))}
        </div>
      ) : sortedProviders.length === 0 ? (
        <ProviderEmptyState
          appId={appId}
          onCreate={onCreate}
          onImport={() => importMutation.mutate()}
        />
      ) : filteredProviders.length === 0 ? (
        <div className="px-6 py-8 text-sm text-center border border-dashed rounded-lg border-border text-muted-foreground">
          {t("provider.noSearchResults", {
            defaultValue: "No providers match your search.",
          })}
        </div>
      ) : (
        renderProviderList()
      )}
    </div>
  );
});

interface SortableProviderCardProps {
  provider: Provider;
  sequenceNumber: number;
  dragDisabled: boolean;
  proxyUsageStats?: ProviderStats;
  proxyRecentUsageStats?: ProviderStats;
  modelsProbeStatus?: ModelsProbeStatus;
  modelsProbeHistoryStatus?: ModelsProbeStatus;
  scrollHighlight?: boolean;
  isCurrent: boolean;
  appId: AppId;
  isInConfig: boolean;
  isOmo: boolean;
  isOmoSlim: boolean;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onUpdate?: (provider: Provider) => void | Promise<void>;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onDuplicate: (provider: Provider) => void;
  onCopyToApp?: (provider: Provider, targetApp: AppId) => void;
  visibleApps?: VisibleApps;
  onConfigureUsage?: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onOpenTerminal?: (provider: Provider) => void;
  onTest?: (provider: Provider) => void;
  isTesting: boolean;
  isProxyRunning: boolean;
  isProxyTakeover: boolean;
  isAutoFailoverEnabled: boolean;
  failoverPriority?: number;
  isInFailoverQueue: boolean;
  onToggleFailover: (enabled: boolean) => void;
  activeProviderId?: string;
  // OpenClaw: default model
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
}

function SortableProviderCard({
  provider,
  sequenceNumber,
  dragDisabled,
  isCurrent,
  appId,
  isInConfig,
  isOmo,
  isOmoSlim,
  onSwitch,
  onEdit,
  onUpdate,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onDuplicate,
  onCopyToApp,
  visibleApps,
  onConfigureUsage,
  onOpenWebsite,
  onOpenTerminal,
  onTest,
  isTesting,
  isProxyRunning,
  isProxyTakeover,
  isAutoFailoverEnabled,
  failoverPriority,
  isInFailoverQueue,
  onToggleFailover,
  activeProviderId,
  isDefaultModel,
  onSetAsDefault,
  proxyUsageStats,
  proxyRecentUsageStats,
  modelsProbeStatus = "idle",
  modelsProbeHistoryStatus,
  scrollHighlight = false,
}: SortableProviderCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: provider.id, disabled: dragDisabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-provider-id={provider.id}
      data-provider-current={isCurrent ? "true" : "false"}
    >
      <ProviderCard
        provider={provider}
        sequenceNumber={sequenceNumber}
        isCurrent={isCurrent}
        appId={appId}
        isInConfig={isInConfig}
        isOmo={isOmo}
        isOmoSlim={isOmoSlim}
        onSwitch={onSwitch}
        onEdit={onEdit}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRemoveFromConfig={onRemoveFromConfig}
        onDisableOmo={onDisableOmo}
        onDisableOmoSlim={onDisableOmoSlim}
        onDuplicate={onDuplicate}
        onCopyToApp={onCopyToApp}
        visibleApps={visibleApps}
        onConfigureUsage={
          onConfigureUsage ? (item) => onConfigureUsage(item) : () => undefined
        }
        onOpenWebsite={onOpenWebsite}
        onOpenTerminal={onOpenTerminal}
        onTest={onTest}
        isTesting={isTesting}
        isProxyRunning={isProxyRunning}
        isProxyTakeover={isProxyTakeover}
        dragHandleProps={{
          attributes,
          listeners,
          isDragging,
        }}
        isDragDisabled={dragDisabled}
        isAutoFailoverEnabled={isAutoFailoverEnabled}
        failoverPriority={failoverPriority}
        isInFailoverQueue={isInFailoverQueue}
        onToggleFailover={onToggleFailover}
        activeProviderId={activeProviderId}
        // OpenClaw: default model
        isDefaultModel={isDefaultModel}
        onSetAsDefault={onSetAsDefault}
        proxyUsageStats={proxyUsageStats}
        proxyRecentUsageStats={proxyRecentUsageStats}
        modelsProbeStatus={modelsProbeStatus}
        modelsProbeHistoryStatus={modelsProbeHistoryStatus}
        scrollHighlight={scrollHighlight}
      />
    </div>
  );
}
