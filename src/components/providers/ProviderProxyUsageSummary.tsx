import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderStats } from "@/types/usage";
import {
  formatTokensShort,
  fmtUsd,
  getResolvedLang,
} from "@/components/usage/format";
import { cn } from "@/lib/utils";

interface ProviderProxyUsageSummaryProps {
  stats?: ProviderStats | null;
  /** 近 5 分钟统计（单独查询，用于即时可用性） */
  recentStats?: ProviderStats | null;
  className?: string;
}

function formatRelativeFromUnixSeconds(
  unixSeconds: number,
  nowMs: number,
  t: (key: string, options?: { count?: number; defaultValue?: string }) => string,
): string {
  const diff = Math.floor((nowMs - unixSeconds * 1000) / 1000);
  if (diff < 60) {
    return t("usage.justNow", { defaultValue: "刚刚" });
  }
  if (diff < 3600) {
    const minutes = Math.max(1, Math.floor(diff / 60));
    return t("usage.minutesAgo", {
      count: minutes,
      defaultValue: `${minutes} 分钟前`,
    });
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return t("usage.hoursAgo", {
      count: hours,
      defaultValue: `${hours} 小时前`,
    });
  }
  const days = Math.floor(diff / 86400);
  return t("usage.daysAgo", {
    count: days,
    defaultValue: `${days} 天前`,
  });
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 成功率 0–100 连续映射：红 → 琥珀 → 绿。
 * 高成功率偏绿，低成功率偏红。
 */
function successRateColor(rate: number): string {
  const clamped = Math.max(0, Math.min(100, rate));
  // 把 50% 以下压到更红，50–100 从琥珀过渡到绿
  // hue: 0(红) → 45(琥珀) → 145(绿)
  const hue =
    clamped <= 50
      ? (clamped / 50) * 45
      : 45 + ((clamped - 50) / 50) * 100;
  const saturation = 72;
  const lightness = 38;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

function latencyTone(ms: number): string {
  if (ms < 800) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  if (ms < 2000) return "text-foreground font-medium";
  return "text-amber-600 dark:text-amber-400 font-semibold";
}

function MetricBlock({
  label,
  value,
  valueClassName,
  valueStyle,
  title,
  emphasize = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  valueStyle?: CSSProperties;
  title?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 flex-col leading-tight",
        emphasize && "rounded-md bg-muted/40 px-1.5 py-0.5",
      )}
      title={title}
    >
      <span className="truncate text-[10px] font-medium text-muted-foreground/90">
        {label}
      </span>
      <span
        className={cn(
          "truncate text-[12.5px] font-semibold tabular-nums text-foreground",
          valueClassName,
        )}
        style={valueStyle}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * 供应商卡片上的本地 proxy/session 用量摘要（固定 2 行）。
 * 行1：可用性指标块（标签上 / 数值下）
 * 行2：体量（请求 / Tokens / 成本）
 */
export function ProviderProxyUsageSummary({
  stats,
  recentStats,
  className,
}: ProviderProxyUsageSummaryProps) {
  const { t, i18n } = useTranslation();
  const lang = getResolvedLang(i18n);
  const nowMs = Date.now();

  const content = useMemo(() => {
    const hasTotal = !!(stats && stats.requestCount);
    const has5m = !!(recentStats && recentStats.requestCount);
    if (!hasTotal && !has5m) {
      return null;
    }

    const lastUsedSource = stats?.lastUsedAt ?? recentStats?.lastUsedAt;
    const lastUsed =
      typeof lastUsedSource === "number" && Number.isFinite(lastUsedSource)
        ? formatRelativeFromUnixSeconds(lastUsedSource, nowMs, t)
        : null;

    const avgFirstTokenMs =
      typeof stats?.avgFirstTokenMs === "number" &&
      Number.isFinite(stats.avgFirstTokenMs)
        ? stats.avgFirstTokenMs
        : null;

    return {
      hasTotal,
      has5m,
      successRate5m: has5m ? recentStats!.successRate : null,
      requestCount5m: has5m ? recentStats!.requestCount : 0,
      successRate: hasTotal ? stats!.successRate : null,
      avgLatencyMs: hasTotal ? stats!.avgLatencyMs : null,
      avgFirstTokenMs,
      requests: hasTotal ? stats!.requestCount.toLocaleString() : null,
      tokens: hasTotal ? formatTokensShort(stats!.totalTokens, lang) : null,
      cost: hasTotal ? fmtUsd(stats!.totalCost, 4) : null,
      lastUsed,
      absoluteLastUsed:
        typeof lastUsedSource === "number" && Number.isFinite(lastUsedSource)
          ? new Date(lastUsedSource * 1000).toLocaleString()
          : undefined,
    };
  }, [stats, recentStats, lang, nowMs, t]);

  if (!content) {
    return null;
  }

  const row1Items: ReactNode[] = [];

  if (content.has5m && content.successRate5m != null) {
    const rate = content.successRate5m;
    row1Items.push(
      <MetricBlock
        key="5m"
        label={t("usage.successRate5mLabel", {
          defaultValue: "近5分钟成功率",
        })}
        value={`${rate.toFixed(1)}%`}
        valueStyle={{ color: successRateColor(rate) }}
        title={`${content.requestCount5m} ${t("usage.requests", {
          defaultValue: "请求",
        })}`}
        emphasize
      />,
    );
  }

  if (content.successRate != null) {
    const rate = content.successRate;
    row1Items.push(
      <MetricBlock
        key="total"
        label={t("usage.totalSuccessRateLabel", {
          defaultValue: "总调用成功率",
        })}
        value={`${rate.toFixed(1)}%`}
        valueStyle={{ color: successRateColor(rate) }}
        emphasize
      />,
    );
  }

  if (content.avgLatencyMs != null) {
    row1Items.push(
      <MetricBlock
        key="lat"
        label={t("usage.avgLatency", { defaultValue: "平均用时" })}
        value={formatDurationMs(content.avgLatencyMs)}
        valueClassName={latencyTone(content.avgLatencyMs)}
      />,
    );
  }

  if (content.avgFirstTokenMs != null) {
    row1Items.push(
      <MetricBlock
        key="ttft"
        label={t("usage.avgFirstToken", { defaultValue: "首字" })}
        value={formatDurationMs(content.avgFirstTokenMs)}
        valueClassName={latencyTone(content.avgFirstTokenMs)}
      />,
    );
  }

  if (content.lastUsed) {
    row1Items.push(
      <MetricBlock
        key="last"
        label={t("usage.lastUsed", { defaultValue: "最后使用" })}
        value={content.lastUsed}
        title={content.absoluteLastUsed}
        valueClassName="text-foreground/90"
      />,
    );
  }

  const row2Items: ReactNode[] = [];
  if (content.requests != null) {
    row2Items.push(
      <span key="req" className="text-[11.5px] text-muted-foreground/90">
        {t("usage.requests", { defaultValue: "请求" })} {content.requests}
      </span>,
    );
  }
  if (content.tokens != null) {
    row2Items.push(
      <span key="tok" className="text-[11.5px] text-muted-foreground/90">
        {t("usage.tokens", { defaultValue: "Tokens" })} {content.tokens}
      </span>,
    );
  }
  if (content.cost != null) {
    row2Items.push(
      <span key="cost" className="text-[11.5px] text-muted-foreground/90">
        {t("usage.cost", { defaultValue: "成本" })} {content.cost}
      </span>,
    );
  }

  return (
    <div
      className={cn(
        "flex max-w-full flex-col gap-1 text-[12.5px] leading-5 text-muted-foreground",
        className,
      )}
      title={
        content.absoluteLastUsed
          ? `${t("usage.totalSuccessRateLabel", {
              defaultValue: "总调用成功率",
            })} · ${t("usage.lastUsed", { defaultValue: "最后使用" })}: ${
              content.absoluteLastUsed
            }`
          : t("usage.totalSuccessRateLabel", {
              defaultValue: "总调用成功率",
            })
      }
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {row1Items.length > 0 ? (
        <div className="flex min-w-0 flex-nowrap items-end gap-x-3 overflow-hidden">
          {row1Items}
        </div>
      ) : null}

      {row2Items.length > 0 ? (
        <div className="flex min-w-0 flex-nowrap items-center gap-x-2 overflow-hidden">
          {row2Items.map((item, index) => (
            <span
              key={index}
              className="inline-flex min-w-0 items-center gap-x-2"
            >
              {index > 0 ? (
                <span className="select-none text-border/70">·</span>
              ) : null}
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
