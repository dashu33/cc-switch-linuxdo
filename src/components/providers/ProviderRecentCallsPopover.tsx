import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRequestLogs } from "@/lib/query/usage";
import type { AppId } from "@/lib/api";
import type { UsageRangeSelection } from "@/types/usage";
import { getLocaleFromLanguage } from "@/components/usage/format";

interface ProviderRecentCallsPopoverProps {
  appId: AppId;
  providerName: string;
  className?: string;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 供应商卡片「最近调用」窗口：按 providerName + app 拉取近期请求日志，
 * 展示时间 / 模型 / 状态（口径与用量统计请求日志一致）。
 */
export function ProviderRecentCallsPopover({
  appId,
  providerName,
  className,
}: ProviderRecentCallsPopoverProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = getLocaleFromLanguage(i18n.resolvedLanguage || i18n.language || "en");

  // 稳定 1d preset；卡片主路径已改列表批量接口，Popover 仍按需单查
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
      enabled: open,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchInterval: open ? 15_000 : false,
      refetchIntervalInBackground: false,
    },
  });

  const logs = data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className,
          )}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={t("usage.recentCalls", { defaultValue: "最近调用" })}
        >
          <History className="h-3 w-3" />
          <span>{t("usage.recentCalls", { defaultValue: "最近调用" })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[min(92vw,420px)] p-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border/60 px-3 py-2">
          <div className="text-sm font-medium text-foreground">
            {t("usage.recentCalls", { defaultValue: "最近调用" })}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {providerName}
            <span className="mx-1 text-border">·</span>
            {t("usage.recentCallsHint", {
              defaultValue: "近 1 天，最多 12 条",
            })}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {!open ? null : isLoading || (isFetching && logs.length === 0) ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("common.loading", { defaultValue: "加载中…" })}
            </div>
          ) : logs.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("usage.noRecentCalls", { defaultValue: "暂无最近调用" })}
            </div>
          ) : (
            <table className="w-full text-left text-[11.5px]">
              <thead className="sticky top-0 bg-popover text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="px-3 py-1.5 font-medium">
                    {t("usage.time", { defaultValue: "时间" })}
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    {t("usage.model", { defaultValue: "模型" })}
                  </th>
                  <th className="px-2 py-1.5 font-medium text-right">
                    {t("usage.status", { defaultValue: "状态" })}
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    {t("usage.latency", { defaultValue: "延迟" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const ok = log.statusCode >= 200 && log.statusCode < 300;
                  const modelLabel =
                    log.requestModel && log.requestModel !== log.model
                      ? `${log.requestModel} → ${log.model}`
                      : log.model;
                  return (
                    <tr
                      key={log.requestId}
                      className="border-b border-border/30 last:border-0 hover:bg-muted/40"
                      title={log.errorMessage || undefined}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(log.createdAt * 1000).toLocaleString(locale, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-2 py-1.5 max-w-[160px]">
                        <div className="truncate font-mono" title={modelLabel}>
                          {modelLabel}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right tabular-nums font-semibold",
                          ok
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {log.statusCode}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatDurationMs(log.latencyMs)}
                        {log.firstTokenMs != null ? (
                          <span className="text-muted-foreground/80">
                            /{formatDurationMs(log.firstTokenMs)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
