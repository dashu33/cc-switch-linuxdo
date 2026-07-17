import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ClipboardPaste,
  Loader2,
  Settings,
  ArrowLeft,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Book,
  Brain,
  Wrench,
  History,
  BarChart2,
  Download,
  FolderArchive,
  Search,
  FolderOpen,
  KeyRound,
  Shield,
  Cpu,
  LayoutDashboard,
  Crosshair,
  Radar,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Provider, VisibleApps } from "@/types";
import type { EnvConflict } from "@/types/env";
import { useProvidersQuery, useSettingsQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  universalProvidersApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import { useCopyProviderToApp } from "@/hooks/useCopyProviderToApp";
import { useFetchCurrentProviderModels } from "@/hooks/useFetchCurrentProviderModels";
import { openclawKeys, useOpenClawHealth } from "@/hooks/useOpenClaw";
import { hermesKeys, useOpenHermesWebUI } from "@/hooks/useHermes";
import { hermesApi } from "@/lib/api/hermes";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useAutoCompact } from "@/hooks/useAutoCompact";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { useScanUnmanagedSkills } from "@/hooks/useSkills";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { deepClone } from "@/utils/deepClone";
import { readText } from "@/lib/clipboard";
import {
  mergeNewApiCredentials,
  parseNewApiClipboardPartial,
  type PartialNewApiCredentials,
  type ParsedNewApiCredentials,
} from "@/utils/parseNewApiClipboard";
import {
  createUniversalProviderFromPreset,
  findPresetByType,
} from "@/config/universalProviderPresets";
import { cn } from "@/lib/utils";
import {
  isWindows,
  isLinux,
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
} from "@/lib/platform";
import { AppSwitcher } from "@/components/AppSwitcher";
import { ProfileSwitcher } from "@/components/profiles/ProfileSwitcher";
import {
  ProviderList,
  type ProviderListHandle,
} from "@/components/providers/ProviderList";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { S3QuickSyncButtons } from "@/components/sync/S3QuickSyncButtons";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/components/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import {
  SkillsPage,
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/components/skills/SkillsPage";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { UniversalProviderPanel } from "@/components/universal";
import { McpIcon } from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/lib/query/omo";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import OpenClawHealthBanner from "@/components/openclaw/OpenClawHealthBanner";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";

type View =
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "skillsDiscovery"
  | "mcp"
  | "agents"
  | "universal"
  | "sessions"
  | "workspace"
  | "openclawEnv"
  | "openclawTools"
  | "openclawAgents"
  | "hermesMemory";

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28; // px
const HEADER_HEIGHT = 64; // px

const STORAGE_KEY = "cc-switch-last-app";
const VALID_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "cc-switch-last-view";
const VALID_VIEWS: View[] = [
  "providers",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "agents",
  "universal",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
];

const getInitialView = (): View => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return "providers";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const providerListRef = useRef<ProviderListHandle>(null);

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const sharedFeatureApp: AppId =
    activeApp === "claude-desktop" ? "claude" : activeApp;
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [skillsDiscoverySource, setSkillsDiscoverySource] =
    useState<SkillsPageSource>("repos");
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isQuickImporting, setIsQuickImporting] = useState(false);
  /** When only URL or only key was captured, wait for the missing half. */
  const [quickImportPending, setQuickImportPending] =
    useState<PartialNewApiCredentials | null>(null);
  const quickImportPendingRef = useRef<PartialNewApiCredentials | null>(null);
  const quickImportLastClipRef = useRef<string>("");
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  const { data: settingsData } = useSettingsQuery();
  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;
  const contentTopOffset = dragBarHeight + HEADER_HEIGHT;
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    gemini: true,
    grokbuild: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps["claude-desktop"]) return "claude-desktop";
    if (visibleApps.codex) return "codex";
    if (visibleApps.gemini) return "gemini";
    if (visibleApps.grokbuild) return "grokbuild";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.openclaw) return "openclaw";
    if (visibleApps.hermes) return "hermes";
    return "claude"; // fallback
  };

  useEffect(() => {
    if (!visibleApps[activeApp]) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  // Fallback from sessions view when switching to an app without session support
  useEffect(() => {
    if (
      currentView === "sessions" &&
      sharedFeatureApp !== "claude" &&
      sharedFeatureApp !== "codex" &&
      sharedFeatureApp !== "grokbuild" &&
      sharedFeatureApp !== "opencode" &&
      sharedFeatureApp !== "openclaw" &&
      sharedFeatureApp !== "gemini" &&
      sharedFeatureApp !== "hermes"
    ) {
      setCurrentView("providers");
    }
  }, [sharedFeatureApp, currentView]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    provider: Provider;
    action: "remove" | "delete";
  } | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const isToolbarCompact = useAutoCompact(toolbarRef);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);
  // 订阅未管理 Skill 的共享缓存（实际扫描由 UnifiedSkillsPanel 进入页面时触发）。
  // 这里 enabled 默认 false，仅用于「导入」按钮的绿点提示，不主动发起扫描。
  const { data: unmanagedSkills } = useScanUnmanagedSkills();
  const hasUnmanagedSkills = (unmanagedSkills?.length ?? 0) > 0;
  const addActionButtonClass =
    "bg-orange-500 hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 dark:shadow-orange-500/40 rounded-full w-8 h-8";

  const {
    isRunning: isProxyRunning,
    takeoverStatus,
    status: proxyStatus,
  } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const activeProviderId = useMemo(() => {
    const target = proxyStatus?.active_targets?.find(
      (t) => t.app_type === activeApp,
    );
    return target?.provider_id;
  }, [proxyStatus?.active_targets, activeApp]);

  const { data, isLoading, refetch } = useProvidersQuery(activeApp, {
    isProxyRunning,
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const {
    isFetching: isFetchingCurrentModels,
    fetchCurrentProviderModels,
    probeProviders,
    recordProviderProbeResult,
    probeResult: modelsProbeResult,
    probeById: modelsProbeById,
    probeHistoryById: modelsProbeHistoryById,
    forgetProviderProbeResults,
  } = useFetchCurrentProviderModels(activeApp, providers, currentProviderId);

  const scheduleAutoProbeProviders = useCallback(
    (providerIds?: string[]) => {
      // Wait a tick so providers query can settle after create/import.
      window.setTimeout(() => {
        const ids = Array.from(new Set((providerIds ?? []).filter(Boolean)));
        if (ids.length === 0) {
          // 导入当前配置等场景：列表刷新后对全部可探测项批量探测
          void fetchCurrentProviderModels();
          return;
        }
        void probeProviders(ids, { quiet: true });
      }, 400);
    },
    [fetchCurrentProviderModels, probeProviders],
  );
  const handleScrollToCurrentProvider = () => {
    // list 可能尚未挂载（loading / 切应用）时多拍重试
    const tryScroll = () =>
      providerListRef.current?.scrollToCurrentProvider() ?? false;

    if (tryScroll()) return;

    const delays = [50, 120, 250, 400, 700];
    let finished = false;
    for (const delay of delays) {
      window.setTimeout(() => {
        if (finished) return;
        if (tryScroll()) {
          finished = true;
          return;
        }
        if (delay === delays[delays.length - 1]) {
          toast.info(
            t("provider.scrollToCurrentNotFound", {
              defaultValue: "未找到当前正在使用的供应商",
            }),
          );
        }
      }, delay);
    }
  };

  const isOpenClawView =
    activeApp === "openclaw" &&
    (currentView === "providers" ||
      currentView === "workspace" ||
      currentView === "sessions" ||
      currentView === "openclawEnv" ||
      currentView === "openclawTools" ||
      currentView === "openclawAgents");
  const { data: openclawHealthWarnings = [] } =
    useOpenClawHealth(isOpenClawView);
  const hasSkillsSupport = sharedFeatureApp !== "openclaw";
  const hasSessionSupport =
    sharedFeatureApp === "claude" ||
    sharedFeatureApp === "codex" ||
    sharedFeatureApp === "grokbuild" ||
    sharedFeatureApp === "opencode" ||
    sharedFeatureApp === "openclaw" ||
    sharedFeatureApp === "gemini" ||
    sharedFeatureApp === "hermes";

  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    deleteProviders,
    saveUsageScript,
    setAsDefaultModel,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  const handleAddProviderWithProbe = useCallback(
    async (provider: Parameters<typeof addProvider>[0]) => {
      const created = await addProvider(provider);
      if (created?.id) {
        scheduleAutoProbeProviders([created.id]);
      }
    },
    [addProvider, scheduleAutoProbeProviders],
  );

  const disableOmoMutation = useDisableCurrentOmo();
  const handleDisableOmo = () => {
    disableOmoMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  const disableOmoSlimMutation = useDisableCurrentOmoSlim();
  const handleDisableOmoSlim = () => {
    disableOmoSlimMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  useTauriEvent("universal-provider-synced", async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to update tray menu", error);
    }
  });

  // 应用项目后刷新相关缓存（providers 由既有 provider-switched 监听承接；
  // proxy 状态由后端直接改 DB，不走 mutation，必须显式刷新）
  useTauriEvent("profile-applied", async () => {
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    await queryClient.invalidateQueries({ queryKey: ["mcp", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["skills"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyTakeoverStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    await queryClient.invalidateQueries({
      queryKey: ["providers", "claude-desktop"],
    });
  });

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "webdav-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.webdavSync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "s3-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.s3Sync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<{ appType: string; providerName: string }>(
    "proxy-official-warning",
    (payload) => {
      toast.warning(
        t("notifications.proxyOfficialWarning", {
          name: payload.providerName,
          defaultValue: `当前供应商 ${payload.providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
        }),
        { duration: 8000 },
      );
    },
  );

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupWindowStateSync = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const syncWindowMaximizedState = async () => {
          const maximized = await currentWindow.isMaximized();
          if (active) {
            setIsWindowMaximized(maximized);
          }
        };

        await syncWindowMaximizedState();
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowMaximizedState();
        });
      } catch (error) {
        console.error("[App] Failed to sync window maximized state", error);
      }
    };

    void setupWindowStateSync();
    return () => {
      active = false;
      unlistenResize?.();
    };
  }, []);

  useEffect(() => {
    // settingsData 未加载时跳过，避免用 fallback false 覆盖 Rust 侧已设好的装饰状态
    if (!settingsData) return;

    const syncWindowDecorations = async () => {
      try {
        await getCurrentWindow().setDecorations(!useAppWindowControls);
      } catch (error) {
        console.error("[App] Failed to update window decorations", error);
      }
    };

    void syncWindowDecorations();
  }, [useAppWindowControls, settingsData]);

  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);

  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "providers") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "providers");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [launchDashboardOpen, setLaunchDashboardOpen] = useState(false);
  const openHermesWebUI = useOpenHermesWebUI(() =>
    setLaunchDashboardOpen(true),
  );

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { provider, action } = confirmAction;

    if (action === "remove") {
      // Remove from live config only (for additive mode apps like OpenCode/OpenClaw)
      // Does NOT delete from database - provider remains in the list
      await providersApi.removeFromLiveConfig(provider.id, activeApp);
      // Invalidate queries to refresh the isInConfig state
      if (activeApp === "opencode") {
        await queryClient.invalidateQueries({
          queryKey: ["opencodeLiveProviderIds"],
        });
      } else if (activeApp === "openclaw") {
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.liveProviderIds,
        });
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.health,
        });
      } else if (activeApp === "hermes") {
        await queryClient.invalidateQueries({
          queryKey: hermesKeys.liveProviderIds,
        });
      }
      toast.success(
        t("notifications.removeFromConfigSuccess", {
          defaultValue: "已从配置移除",
        }),
        { closeButton: true },
      );
    } else {
      await deleteProvider(provider.id);
    }
    setConfirmAction(null);
  };

  const generateUniqueProviderCopyKey = (
    originalKey: string,
    existingKeys: string[],
  ): string => {
    const baseKey = `${originalKey}-copy`;

    if (!existingKeys.includes(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (existingKeys.includes(`${baseKey}-${counter}`)) {
      counter++;
    }
    return `${baseKey}-${counter}`;
  };

  const copyProviderToApp = useCopyProviderToApp(activeApp);

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> & {
      providerKey?: string;
      addToLive?: boolean;
    } = {
      name: `${provider.name} copy`,
      settingsConfig: deepClone(provider.settingsConfig),
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex, // 复制原 sortIndex + 1
      meta: provider.meta ? deepClone(provider.meta) : undefined,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (
      activeApp === "opencode" ||
      activeApp === "openclaw" ||
      activeApp === "hermes"
    ) {
      let liveProviderIds: string[] = [];
      try {
        liveProviderIds =
          activeApp === "opencode"
            ? await queryClient.ensureQueryData({
                queryKey: ["opencodeLiveProviderIds"],
                queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
              })
            : activeApp === "openclaw"
              ? await queryClient.ensureQueryData({
                  queryKey: openclawKeys.liveProviderIds,
                  queryFn: () => providersApi.getOpenClawLiveProviderIds(),
                })
              : await queryClient.ensureQueryData({
                  queryKey: hermesKeys.liveProviderIds,
                  queryFn: () => providersApi.getHermesLiveProviderIds(),
                });
      } catch (error) {
        console.error(
          "[App] Failed to load live provider IDs for duplication",
          error,
        );
        const errorMessage = extractErrorMessage(error);
        toast.error(
          t("provider.duplicateLiveIdsLoadFailed", {
            defaultValue: "读取配置中的供应商标识失败，请先修复配置后再试",
          }) + (errorMessage ? `: ${errorMessage}` : ""),
        );
        return;
      }
      const existingKeys = Array.from(
        new Set([...Object.keys(providers), ...liveProviderIds]),
      );
      duplicatedProvider.providerKey = generateUniqueProviderCopyKey(
        provider.id,
        existingKeys,
      );
      duplicatedProvider.addToLive = false;
    }

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return; // 如果排序更新失败，不继续添加
        }
      }
    }

    const createdDup = await addProvider(duplicatedProvider);
    if (createdDup?.id) {
      scheduleAutoProbeProviders([createdDup.id]);
    }
  };

  const handleOpenTerminal = async (provider: Provider) => {
    try {
      const selectedDir = await settingsApi.pickDirectory();
      if (!selectedDir) {
        return;
      }

      await providersApi.openTerminal(provider.id, activeApp, {
        cwd: selectedDir,
      });
      toast.success(
        t("provider.terminalOpened", {
          defaultValue: "终端已打开",
        }),
      );
    } catch (error) {
      console.error("[App] Failed to open terminal", error);
      const errorMessage = extractErrorMessage(error);
      toast.error(
        t("provider.terminalOpenFailed", {
          defaultValue: "打开终端失败",
        }) + (errorMessage ? `: ${errorMessage}` : ""),
      );
    }
  };

  const clearQuickImportPending = () => {
    quickImportPendingRef.current = null;
    quickImportLastClipRef.current = "";
    setQuickImportPending(null);
  };

  const createNewApiFromCredentials = async (
    credentials: ParsedNewApiCredentials,
  ) => {
    const preset = findPresetByType("newapi");
    if (!preset) {
      toast.error(
        t("provider.quickImportMissingPreset", {
          defaultValue: "未找到 NewAPI 预设，无法导入",
        }),
      );
      return false;
    }

    // 名称：几月几号 几点几分 + BASE URL；官网链接直接用 BASE URL
    const now = new Date();
    const quickImportName = `${now.getMonth() + 1}月${now.getDate()}日 ${String(
      now.getHours(),
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${
      credentials.baseUrl
    }`;

    const provider = createUniversalProviderFromPreset(
      preset,
      crypto.randomUUID(),
      credentials.baseUrl,
      credentials.apiKey,
      quickImportName,
    );
    provider.websiteUrl = credentials.baseUrl;
    // NewAPI 默认走 Chat Completions（需开启路由）；同步到 Codex 时写入 meta.apiFormat
    provider.meta = {
      ...(provider.meta ?? {}),
      apiFormat: "openai_chat",
    };

    try {
      await universalProvidersApi.upsert(provider);
    } catch (error) {
      console.error("[App] Quick import upsert failed", error);
      toast.error(
        t("universalProvider.addFailed", {
          defaultValue: "统一供应商添加失败",
        }),
      );
      return false;
    }

    try {
      await universalProvidersApi.sync(provider.id);
      toast.success(
        t("provider.quickImportCreated", {
          defaultValue: "已快速导入 NewAPI 供应商「{{name}}」并同步",
          name: provider.name,
        }),
      );
    } catch (error) {
      console.error("[App] Quick import sync failed", error);
      toast.warning(
        t("universalProvider.addedButSyncFailed", {
          defaultValue: "统一供应商已添加，但同步失败",
        }),
      );
    }

    await queryClient.invalidateQueries({
      queryKey: ["providers"],
      refetchType: "all",
    });
    await queryClient.refetchQueries({
      queryKey: ["providers"],
      type: "all",
    });
    scheduleAutoProbeProviders([provider.id]);
    return true;
  };

  const applyQuickImportPartial = async (
    partial: PartialNewApiCredentials,
    clipboardText: string,
  ) => {
    const merged = mergeNewApiCredentials(
      quickImportPendingRef.current ?? {},
      partial,
    );

    if (merged.baseUrl && merged.apiKey) {
      clearQuickImportPending();
      await createNewApiFromCredentials({
        baseUrl: merged.baseUrl,
        apiKey: merged.apiKey,
        name: merged.name,
      });
      return;
    }

    // Keep waiting for the missing half.
    quickImportPendingRef.current = merged;
    quickImportLastClipRef.current = clipboardText;
    setQuickImportPending(merged);

    if (merged.baseUrl && !merged.apiKey) {
      toast.message(
        t("provider.quickImportWaitingKey", {
          defaultValue: "已识别 BASE URL，请复制 API Key（将自动导入）",
        }),
      );
    } else if (merged.apiKey && !merged.baseUrl) {
      toast.message(
        t("provider.quickImportWaitingUrl", {
          defaultValue: "已识别 API Key，请复制 BASE URL（将自动导入）",
        }),
      );
    }
  };

  const handleQuickImportNewApi = async () => {
    // Second click while waiting cancels the wait.
    if (quickImportPendingRef.current) {
      clearQuickImportPending();
      toast.message(
        t("provider.quickImportCancelled", {
          defaultValue: "已取消快速导入等待",
        }),
      );
      return;
    }

    if (isQuickImporting) return;
    setIsQuickImporting(true);
    try {
      const clipboardText = await readText();
      if (!clipboardText.trim()) {
        toast.error(
          t("provider.quickImportEmptyClipboard", {
            defaultValue: "剪贴板为空，请先复制 URL 和 API Key",
          }),
        );
        return;
      }

      const partial = parseNewApiClipboardPartial(clipboardText);
      if (!partial) {
        toast.error(
          t("provider.quickImportPartialNoMatch", {
            defaultValue: "未识别到可用的 URL 或 API Key，请复制后重试",
          }),
        );
        return;
      }

      await applyQuickImportPartial(partial, clipboardText);
    } catch (error) {
      console.error("[App] Quick import failed", error);
      toast.error(
        t("provider.quickImportClipboardError", {
          defaultValue: "读取剪贴板失败，请检查系统剪贴板权限",
        }),
      );
    } finally {
      setIsQuickImporting(false);
    }
  };

  // While waiting for the missing half, poll clipboard and auto-create.
  useEffect(() => {
    if (!quickImportPending) return;

    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const clipboardText = await readText();
        if (cancelled) return;
        if (!clipboardText.trim()) return;
        if (clipboardText === quickImportLastClipRef.current) return;

        const partial = parseNewApiClipboardPartial(clipboardText);
        if (!partial) {
          // Ignore unrelated clipboard content; keep waiting.
          quickImportLastClipRef.current = clipboardText;
          return;
        }

        // Only accept values that fill the missing slot (or a full pair).
        const pending = quickImportPendingRef.current;
        if (!pending) return;
        const fillsMissing =
          (Boolean(partial.baseUrl) && !pending.baseUrl) ||
          (Boolean(partial.apiKey) && !pending.apiKey) ||
          (Boolean(partial.baseUrl) && Boolean(partial.apiKey));
        if (!fillsMissing) {
          quickImportLastClipRef.current = clipboardText;
          return;
        }

        await applyQuickImportPartial(partial, clipboardText);
      } catch (error) {
        // Silent during polling; user can click again or cancel.
        console.warn("[App] Quick import poll failed", error);
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll only while pending; helpers close over latest refs
  }, [quickImportPending]);

  const handleImportSuccess = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ["providers"],
        refetchType: "all",
      });
      await queryClient.refetchQueries({
        queryKey: ["providers"],
        type: "all",
      });
    } catch (error) {
      console.error("[App] Failed to refresh providers after import", error);
      await refetch();
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const notifyWindowControlError = (error: unknown) => {
    toast.error(
      t("notifications.windowControlFailed", {
        defaultValue: "窗口控制失败：{{error}}",
        error: extractErrorMessage(error),
      }),
    );
  };

  const handleWindowMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[App] Failed to minimize window", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowToggleMaximize = async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
      setIsWindowMaximized(await currentWindow.isMaximized());
    } catch (error) {
      console.error("[App] Failed to toggle maximize", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window", error);
      notifyWindowControlError(error);
    }
  };

  const handleOpenSkillsDiscovery = () => {
    setSkillsDiscoverySource("repos");
    setCurrentView("skillsDiscovery");
  };

  const providerToolbarActions = (
    <>
      <S3QuickSyncButtons className="mr-0 h-9 w-9 rounded-md" />
      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
      <Button
        onClick={() => void fetchCurrentProviderModels()}
        size={
          modelsProbeResult.status !== "idle" || isFetchingCurrentModels
            ? "sm"
            : "icon"
        }
        variant="outline"
        disabled={isFetchingCurrentModels}
        className={cn(
          "h-9 transition-colors duration-300",
          modelsProbeResult.status !== "idle" || isFetchingCurrentModels
            ? "gap-1.5 px-2 text-xs font-medium"
            : "w-9 rounded-md",
          isFetchingCurrentModels || modelsProbeResult.status === "probing"
            ? "border-amber-500/70 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
            : modelsProbeResult.status === "success"
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-300"
              : modelsProbeResult.status === "empty"
                ? "border-orange-500 bg-orange-500/15 text-orange-700 shadow-sm shadow-orange-500/20 hover:bg-orange-500/20 dark:text-orange-300"
                : modelsProbeResult.status === "failed"
                  ? "border-red-500 bg-red-500/15 text-red-700 shadow-sm shadow-red-500/20 hover:bg-red-500/20 dark:text-red-300"
                  : modelsProbeResult.status === "skipped"
                    ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                    : "",
        )}
        title={
          isFetchingCurrentModels || modelsProbeResult.status === "probing"
            ? t("provider.fetchModelsProbeRunning", {
                success: modelsProbeResult.successCount ?? 0,
                failed: modelsProbeResult.failedCount ?? 0,
                total: modelsProbeResult.totalCount ?? 0,
                defaultValue: `正在批量拉取模型… 可用 ${modelsProbeResult.successCount ?? 0} / 失败 ${modelsProbeResult.failedCount ?? 0}`,
              })
            : modelsProbeResult.status === "success"
              ? t("provider.fetchModelsProbeButtonSuccess", {
                  count: modelsProbeResult.modelCount ?? 0,
                  success: modelsProbeResult.successCount ?? 0,
                  failed: modelsProbeResult.failedCount ?? 0,
                  empty: modelsProbeResult.emptyCount ?? 0,
                  defaultValue: `探测完成：可用 ${modelsProbeResult.successCount ?? 0} · 无模型 ${modelsProbeResult.emptyCount ?? 0} · 失败 ${modelsProbeResult.failedCount ?? 0}（卡片边框约 60 秒后复位）`,
                })
              : modelsProbeResult.status === "empty"
                ? t("provider.fetchModelsProbeButtonEmpty", {
                    empty: modelsProbeResult.emptyCount ?? 0,
                    defaultValue: "均未返回模型（卡片边框约 60 秒后复位）",
                  })
                : modelsProbeResult.status === "failed"
                  ? t("provider.fetchModelsProbeButtonFailed", {
                      failed: modelsProbeResult.failedCount ?? 0,
                      defaultValue: "探测失败较多（卡片边框约 60 秒后复位）",
                    })
                  : t("provider.fetchModelsProbe", {
                      defaultValue:
                        "一键拉取模型（批量检测全部供应商是否有效）",
                    })
        }
        aria-label={t("provider.fetchModelsProbe", {
          defaultValue: "一键拉取模型（批量检测全部供应商是否有效）",
        })}
      >
        {isFetchingCurrentModels || modelsProbeResult.status === "probing" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Radar className="h-4 w-4 shrink-0" />
        )}
        {(isFetchingCurrentModels || modelsProbeResult.status !== "idle") && (
          <span className="max-w-[9rem] truncate">
            {isFetchingCurrentModels || modelsProbeResult.status === "probing"
              ? t("provider.fetchModelsProbeRunningShort", {
                  ok: modelsProbeResult.successCount ?? 0,
                  bad: modelsProbeResult.failedCount ?? 0,
                  defaultValue: `${modelsProbeResult.successCount ?? 0}✓ ${modelsProbeResult.failedCount ?? 0}✗`,
                })
              : t("provider.fetchModelsProbeDoneShort", {
                  ok: modelsProbeResult.successCount ?? 0,
                  empty: modelsProbeResult.emptyCount ?? 0,
                  bad: modelsProbeResult.failedCount ?? 0,
                  defaultValue: `${modelsProbeResult.successCount ?? 0}✓ ${modelsProbeResult.emptyCount ?? 0}○ ${modelsProbeResult.failedCount ?? 0}✗`,
                })}
          </span>
        )}
      </Button>
      <Button
        onClick={() => providerListRef.current?.openSearch()}
        size="icon"
        variant="outline"
        className="h-9 w-9 rounded-md"
        title={t("provider.searchAndLocate", {
          defaultValue: "搜索并定位供应商",
        })}
        aria-label={t("provider.searchAndLocate", {
          defaultValue: "搜索并定位供应商",
        })}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleScrollToCurrentProvider}
        size="icon"
        variant="outline"
        className="h-9 w-9 rounded-md"
        title={t("provider.scrollToCurrent", {
          defaultValue: "快速定位到正在使用的供应商",
        })}
        aria-label={t("provider.scrollToCurrent", {
          defaultValue: "快速定位到正在使用的供应商",
        })}
      >
        <Crosshair className="h-4 w-4" />
      </Button>
    </>
  );

  const renderContent = () => {
    const content = (() => {
      switch (currentView) {
        case "settings":
          return (
            <SettingsPage
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              ref={promptPanelRef}
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              appId={sharedFeatureApp}
            />
          );
        case "hermesMemory":
          return <HermesMemoryPanel />;
        case "skills":
          return (
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={handleOpenSkillsDiscovery}
              currentApp={
                sharedFeatureApp === "openclaw" ? "claude" : sharedFeatureApp
              }
            />
          );
        case "skillsDiscovery":
          return (
            <SkillsPage
              ref={skillsPageRef}
              initialApp={
                sharedFeatureApp === "openclaw" ? "claude" : sharedFeatureApp
              }
              onSourceChange={setSkillsDiscoverySource}
            />
          );
        case "mcp":
          return (
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => setCurrentView("providers")}
            />
          );
        case "agents":
          return (
            <AgentsPanel onOpenChange={() => setCurrentView("providers")} />
          );
        case "universal":
          return (
            <div className="px-6 pt-4">
              <UniversalProviderPanel />
            </div>
          );

        case "sessions":
          return (
            <SessionManagerPage
              key={sharedFeatureApp}
              appId={sharedFeatureApp}
            />
          );
        case "workspace":
          return <WorkspaceFilesPanel />;
        case "openclawEnv":
          return <EnvPanel />;
        case "openclawTools":
          return <ToolsPanel />;
        case "openclawAgents":
          return <AgentsDefaultsPanel />;
        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="provider-list-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-12 pl-1 pr-2 show-scrollbar">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeApp}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <ProviderList
                      ref={providerListRef}
                      providers={providers}
                      currentProviderId={currentProviderId}
                      appId={activeApp}
                      isLoading={isLoading}
                      isProxyRunning={isProxyRunning}
                      isProxyTakeover={
                        isProxyRunning && isCurrentAppTakeoverActive
                      }
                      activeProviderId={activeProviderId}
                      modelsProbeStatus={modelsProbeResult.status}
                      modelsProbeProviderId={modelsProbeResult.providerId}
                      modelsProbeById={modelsProbeById}
                      modelsProbeHistoryById={modelsProbeHistoryById}
                      onModelsProbeResult={recordProviderProbeResult}
                      onAutoProbeProviders={scheduleAutoProbeProviders}
                      toolbarActions={providerToolbarActions}
                      onSwitch={switchProvider}
                      onEdit={(provider) => {
                        setEditingProvider(provider);
                      }}
                      onUpdate={(provider) => updateProvider(provider)}
                      onDelete={(provider) =>
                        setConfirmAction({ provider, action: "delete" })
                      }
                      onBulkDelete={async (targets) => {
                        const deletedIds = await deleteProviders(
                          targets.map((provider) => provider.id),
                        );
                        forgetProviderProbeResults(deletedIds);
                      }}
                      onRemoveFromConfig={
                        activeApp === "opencode" ||
                        activeApp === "openclaw" ||
                        activeApp === "hermes"
                          ? (provider) =>
                              setConfirmAction({ provider, action: "remove" })
                          : undefined
                      }
                      onDisableOmo={
                        activeApp === "opencode" ? handleDisableOmo : undefined
                      }
                      onDisableOmoSlim={
                        activeApp === "opencode"
                          ? handleDisableOmoSlim
                          : undefined
                      }
                      onDuplicate={handleDuplicateProvider}
                      onCopyToApp={copyProviderToApp}
                      visibleApps={visibleApps}
                      onConfigureUsage={setUsageProvider}
                      onOpenWebsite={handleOpenWebsite}
                      onOpenTerminal={
                        activeApp === "claude" ? handleOpenTerminal : undefined
                      }
                      onCreate={() => setIsAddOpen(true)}
                      onSetAsDefault={
                        activeApp === "openclaw"
                          ? setAsDefaultModel
                          : activeApp === "hermes"
                            ? switchProvider
                            : undefined
                      }
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
      }
    })();

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          className="flex flex-1 min-h-0 flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30 pb-4"
      style={{ overflowX: "hidden", paddingTop: contentTopOffset }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-end px-2"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag", height: dragBarHeight } as any}
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowMinimize()}
                title={t("header.windowMinimize")}
                className="h-7 w-7"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowToggleMaximize()}
                title={
                  isWindowMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="h-7 w-7"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowClose()}
                title={t("header.windowClose")}
                className="h-7 w-7 hover:bg-red-500/15 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      {showEnvBanner && envConflicts.length > 0 && (
        <EnvWarningBanner
          conflicts={envConflicts}
          onDismiss={() => {
            setShowEnvBanner(false);
            sessionStorage.setItem("env_banner_dismissed", "true");
          }}
          onDeleted={async () => {
            try {
              const allConflicts = await checkAllEnvConflicts();
              const flatConflicts = Object.values(allConflicts).flat();
              setEnvConflicts(flatConflicts);
              if (flatConflicts.length === 0) {
                setShowEnvBanner(false);
              }
            } catch (error) {
              console.error(
                "[App] Failed to re-check conflicts after deletion:",
                error,
              );
            }
          }}
        />
      )}

      <header
        className="fixed z-50 w-full transition-all duration-300 bg-background/80 backdrop-blur-md"
        {...DRAG_REGION_ATTR}
        style={
          {
            ...DRAG_REGION_STYLE,
            top: dragBarHeight,
            height: HEADER_HEIGHT,
          } as any
        }
      >
        <div
          className="flex h-full items-center justify-between gap-2 px-6"
          {...DRAG_REGION_ATTR}
          style={{ ...DRAG_REGION_STYLE } as any}
        >
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as any}
          >
            {currentView !== "providers" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setCurrentView(
                      currentView === "skillsDiscovery"
                        ? "skills"
                        : "providers",
                    )
                  }
                  className="mr-2 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-lg font-semibold">
                  {currentView === "settings" && t("settings.title")}
                  {currentView === "prompts" &&
                    t("prompts.title", {
                      appName: t(`apps.${sharedFeatureApp}`),
                    })}
                  {currentView === "skills" && t("skills.title")}
                  {currentView === "skillsDiscovery" && t("skills.title")}
                  {currentView === "mcp" && t("mcp.unifiedPanel.title")}
                  {currentView === "agents" && t("agents.title")}
                  {currentView === "universal" &&
                    t("universalProvider.title", {
                      defaultValue: "统一供应商",
                    })}
                  {currentView === "sessions" && t("sessionManager.title")}
                  {currentView === "workspace" && t("workspace.title")}
                  {currentView === "openclawEnv" && t("openclaw.env.title")}
                  {currentView === "openclawTools" && t("openclaw.tools.title")}
                  {currentView === "openclawAgents" &&
                    t("openclaw.agents.title")}
                  {currentView === "hermesMemory" && t("hermes.memory.title")}
                </h1>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center">
                  <a
                    href="https://ccswitch.io"
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "text-xl font-semibold transition-colors",
                      isProxyRunning && isCurrentAppTakeoverActive
                        ? "text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                        : "text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300",
                    )}
                  >
                    CC Switch
                  </a>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSettingsDefaultTab("general");
                    setCurrentView("settings");
                  }}
                  title={t("common.settings")}
                  className="hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <UpdateBadge
                  onClick={() => {
                    setSettingsDefaultTab("about");
                    setCurrentView("settings");
                  }}
                />
                {isCurrentAppTakeoverActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSettingsDefaultTab("usage");
                      setCurrentView("settings");
                    }}
                    title={t("usage.title", {
                      defaultValue: "使用统计",
                    })}
                    className="hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 min-w-0 items-center justify-end gap-1.5">
            {currentView === "providers" &&
              activeApp !== "opencode" &&
              activeApp !== "openclaw" &&
              activeApp !== "hermes" && (
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  {activeApp === "claude-desktop" ? (
                    <ClaudeDesktopRouteToggle />
                  ) : (
                    settingsData?.enableLocalProxy && (
                      <ProxyToggle activeApp={activeApp} />
                    )
                  )}
                  {activeApp !== "claude-desktop" &&
                    settingsData?.enableFailoverToggle && (
                      <FailoverToggle activeApp={activeApp} />
                    )}
                </div>
              )}
            {currentView === "providers" &&
              (settingsData?.showProfileSwitcher ?? true) && (
                <div
                  className="flex shrink-0 items-center"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  <ProfileSwitcher activeApp={activeApp} />
                </div>
              )}
            <div
              ref={toolbarRef}
              className="flex flex-1 min-w-0 overflow-x-hidden items-center py-4 pr-2"
            >
              <div
                className="flex shrink-0 items-center gap-1.5 ml-auto"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                {currentView === "prompts" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => promptPanelRef.current?.openAdd()}
                    className="hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("prompts.add")}
                  </Button>
                )}
                {currentView === "mcp" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mcpPanelRef.current?.openImport()}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("mcp.importExisting")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mcpPanelRef.current?.openAdd()}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t("mcp.addMcp")}
                    </Button>
                  </>
                )}
                {currentView === "skills" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unifiedSkillsPanelRef.current?.openRestoreFromBackup()
                      }
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <History className="w-4 h-4 mr-2" />
                      {t("skills.restoreFromBackup.button")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unifiedSkillsPanelRef.current?.openInstallFromZip()
                      }
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <FolderArchive className="w-4 h-4 mr-2" />
                      {t("skills.installFromZip.button")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unifiedSkillsPanelRef.current?.openImport()
                      }
                      className="relative hover:bg-black/5 dark:hover:bg-white/5"
                      title={
                        hasUnmanagedSkills
                          ? t("skills.unmanagedAvailable")
                          : undefined
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("skills.import")}
                      {hasUnmanagedSkills && (
                        <span
                          className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleOpenSkillsDiscovery}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      {t("skills.discover")}
                    </Button>
                  </>
                )}
                {currentView === "skillsDiscovery" && (
                  <>
                    {getSkillsPageHeaderActions(skillsDiscoverySource).map(
                      ({ key, labelKey, Icon, execute }) => (
                        <Button
                          key={key}
                          variant="ghost"
                          size="sm"
                          onClick={() => execute(skillsPageRef.current)}
                          className="hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {t(labelKey)}
                        </Button>
                      ),
                    )}
                  </>
                )}
                {currentView === "providers" && (
                  <>
                    <AppSwitcher
                      activeApp={activeApp}
                      onSwitch={setActiveApp}
                      visibleApps={visibleApps}
                      compact={isToolbarCompact}
                    />

                    <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={
                            activeApp === "openclaw"
                              ? "openclaw"
                              : activeApp === "hermes"
                                ? "hermes"
                                : activeApp === "grokbuild"
                                  ? "grokbuild"
                                  : "default"
                          }
                          className="flex items-center gap-1"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          {activeApp === "hermes" ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("skills")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("skills.manage")}
                              >
                                <Wrench className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("hermesMemory")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("hermes.memory.title")}
                              >
                                <Brain className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void openHermesWebUI()}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("hermes.webui.open")}
                              >
                                <LayoutDashboard className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("mcp")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("mcp.title")}
                              >
                                <McpIcon size={16} />
                              </Button>
                            </>
                          ) : activeApp === "openclaw" ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("workspace")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("workspace.manage")}
                              >
                                <FolderOpen className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawEnv")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.env.title")}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawTools")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.tools.title")}
                              >
                                <Shield className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawAgents")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.agents.title")}
                              >
                                <Cpu className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("sessions")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("sessionManager.title")}
                              >
                                <History className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("skills")}
                                className={cn(
                                  "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                  "transition-all duration-200 ease-in-out overflow-hidden",
                                  hasSkillsSupport
                                    ? "opacity-100 w-8 scale-100 px-2"
                                    : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                )}
                                title={t("skills.manage")}
                              >
                                <Wrench className="flex-shrink-0 w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("prompts")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("prompts.manage")}
                              >
                                <Book className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("sessions")}
                                className={cn(
                                  "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                  "transition-all duration-200 ease-in-out overflow-hidden",
                                  hasSessionSupport
                                    ? "opacity-100 w-8 scale-100 px-2"
                                    : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                )}
                                title={t("sessionManager.title")}
                              >
                                <History className="flex-shrink-0 w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("mcp")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("mcp.title")}
                              >
                                <McpIcon size={16} />
                              </Button>
                            </>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <Button
                      onClick={() => setIsAddOpen(true)}
                      size="icon"
                      className={`ml-2 ${addActionButtonClass}`}
                      title={t("header.addProvider")}
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                    <div className="ml-1 flex items-center gap-1.5">
                      <Button
                        onClick={() => void handleQuickImportNewApi()}
                        size="icon"
                        variant="outline"
                        disabled={isQuickImporting && !quickImportPending}
                        className={cn(
                          "relative",
                          quickImportPending &&
                            "border-amber-500/70 text-amber-600 dark:text-amber-400",
                        )}
                        title={
                          quickImportPending
                            ? t("provider.quickImportWaitingHint", {
                                defaultValue: "等待剪贴板补齐中…再次点击可取消",
                              })
                            : t("provider.quickImport", {
                                defaultValue: "快速导入",
                              })
                        }
                      >
                        {isQuickImporting && !quickImportPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : quickImportPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <ClipboardPaste className="w-5 h-5" />
                        )}
                      </Button>
                      <AnimatePresence>
                        {quickImportPending && (
                          <motion.span
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -6 }}
                            className="max-w-[220px] truncate text-xs text-amber-600 dark:text-amber-400"
                            title={
                              quickImportPending.baseUrl &&
                              !quickImportPending.apiKey
                                ? t("provider.quickImportWaitingKey", {
                                    defaultValue:
                                      "已识别 BASE URL，请复制 API Key（将自动导入）",
                                  })
                                : t("provider.quickImportWaitingUrl", {
                                    defaultValue:
                                      "已识别 API Key，请复制 BASE URL（将自动导入）",
                                  })
                            }
                          >
                            {quickImportPending.baseUrl &&
                            !quickImportPending.apiKey
                              ? t("provider.quickImportWaitingKey", {
                                  defaultValue:
                                    "已识别 BASE URL，请复制 API Key（将自动导入）",
                                })
                              : t("provider.quickImportWaitingUrl", {
                                  defaultValue:
                                    "已识别 API Key，请复制 BASE URL（将自动导入）",
                                })}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        className={
          currentView === "providers"
            ? "flex-1 min-h-0 flex flex-col overflow-hidden animate-fade-in"
            : "flex-1 min-h-0 flex flex-col overflow-y-auto show-scrollbar animate-fade-in"
        }
      >
        {isOpenClawView && openclawHealthWarnings.length > 0 && (
          <OpenClawHealthBanner warnings={openclawHealthWarnings} />
        )}
        {renderContent()}
      </main>

      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        appId={activeApp}
        onSubmit={handleAddProviderWithProbe}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
        isProxyTakeover={isCurrentAppTakeoverActive}
      />

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          setLaunchDashboardOpen(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => setLaunchDashboardOpen(false)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </div>
  );
}

export default App;
