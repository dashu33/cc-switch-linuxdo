import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRequestLogs } from "@/lib/query/usage";
import type { AppId } from "@/lib/api";
import type { UsageRangeSelection } from "@/types/usage";
import { getLocaleFromLanguage } from "@/components/usage/format";

interface ProviderRecentCallsPanelProps {
  appId: AppId;
  providerName: string;
  /** 当前供应商更频繁刷新 */
  isCurrent?: boolean;
  className?: string;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 供应商卡片右侧「最近调用」占位窗口：
 * - 填满父级占位高度（尽量吃满 provider 行高）
 * - z-index 低于操作按钮层
 * - 列：时间 / 模型 / 状态
 */
export function ProviderRecentCallsPanel({
  appId,
  providerName,
  isCurrent = false,
  className,
}: ProviderRecentCallsPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = getLocaleFromLanguage(
    i18n.resolvedLanguage || i18n.language || "en",
  );

  // 使用稳定 preset（1d），避免 custom 时间戳进 queryKey 导致从设置返回时缓存全 miss
  const range = useMemo<UsageRangeSelection>(() => ({ preset: "1d" }), []);

  const { data, isLoading, isFetching } = useRequestLogs({
    filters: {
      appType: appId,
      providerName,
    },
    range,
    page: 0,
    pageSize: 12,
    options: {
      enabled: Boolean(providerName),
      // 30s 内视为新鲜：设置页往返直接复用缓存，不阻塞首屏
      staleTime: 30_000,
      // 卸载后保留 10 分钟，覆盖「进设置再回来」
      gcTime: 10 * 60_000,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchInterval: isCurrent ? 15_000 : 60_000,
      refetchIntervalInBackground: false,
    },
  });

  const logs = data?.data ?? [];
  const busy = isLoading || (isFetching && logs.length === 0);

  return (
    <div
      className={cn(
        "relative z-0 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title={t("usage.recentCallsHint", {
        defaultValue: "近 1 天，最多 12 条",
      })}
    >
      <div className="flex h-5 shrink-0 items-center gap-1 border-b border-border/40 px-1.5 text-[10px] font-medium text-muted-foreground">
        <History className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">
          {t("usage.recentCalls", { defaultValue: "最近调用" })}
        </span>
        {isFetching && !busy ? (
          <span className="ml-auto text-[9px] text-muted-foreground/70">…</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {busy ? (
          <div className="flex h-full items-center justify-center px-2 text-[10px] text-muted-foreground">
            {t("common.loading", { defaultValue: "加载中…" })}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2 text-[10px] text-muted-foreground">
            {t("usage.noRecentCalls", { defaultValue: "暂无最近调用" })}
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {logs.map((log) => {
              const ok = log.statusCode >= 200 && log.statusCode < 300;
              const modelLabel =
                log.requestModel && log.requestModel !== log.model
                  ? `${log.requestModel}→${log.model}`
                  : log.model;
              return (
                <li
                  key={log.requestId}
                  className="grid grid-cols-[42px_minmax(0,1fr)_26px] items-center gap-1 px-1.5 py-[3px] text-[10px] leading-tight hover:bg-muted/50"
                  title={
                    log.errorMessage
                      ? `${modelLabel}\n${log.errorMessage}`
                      : `${modelLabel} · ${formatDurationMs(log.latencyMs)}`
                  }
                >
                  <span className="truncate tabular-nums text-muted-foreground">
                    {new Date(log.createdAt * 1000).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span className="min-w-0 truncate font-mono text-foreground/90">
                    {modelLabel}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums font-semibold",
                      ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {log.statusCode}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
