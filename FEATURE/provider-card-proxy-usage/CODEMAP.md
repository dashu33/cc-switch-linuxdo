# CODEMAP — provider-card-proxy-usage

## 文件清单

| 文件 | 角色 |
|------|------|
| `src-tauri/src/services/usage_stats.rs` | `ProviderStats` 聚合（7d/任意时间窗共用） |
| `src/types/usage.ts` | `UsageRangePreset` 含 `"5m"`；`ProviderStats` 字段 |
| `src/lib/usageRange.ts` | `resolveUsageRange("5m")` → now-300s |
| `src/lib/query/usage.ts` | `useProviderStats` / `useRequestLogs` |
| `src/components/providers/ProviderList.tsx` | 批量拉 7d + 5m stats 并分发 |
| `src/components/providers/ProviderCard.tsx` | 透传 stats / recentStats；右侧行内最近调用；探测边框 |
| `src/components/providers/ProviderProxyUsageSummary.tsx` | 卡片摘要（总调用率文案） |
| `src/components/providers/ProviderRecentCallsPanel.tsx` | 最近调用行内窗口 |
| `src/components/providers/ProviderRecentCallsPopover.tsx` | 旧 Popover（保留，卡片主路径不用） |
| `src/i18n/locales/*` | `statsRangeTotal` / `totalSuccessRate` / `recentCalls*` |
| `FEATURE/provider-card-proxy-usage/*` | 文档 |

## 数据流

```text
ProviderList
  useProviderStats(7d)  ──┐
  useProviderStats(5m)  ──┼→ resolve by providerId/name
                          ↓
  ProviderCard
    ProviderProxyUsageSummary
      [近5分钟成功率] [总调用率/总成功率…]
    右侧
      ProviderRecentCallsPanel (absolute inset-0 占位)
      Overlay (z-20, hover 显示)
        UsageFooter / 配额
        ProviderActions
```

## 关键 props

```ts
// ProviderProxyUsageSummary
stats?: ProviderStats | null          // 累计（列表仍用 7d 查询）
recentStats?: ProviderStats | null    // 5m

// ProviderRecentCallsPanel
appId: AppId
providerName: string
isCurrent?: boolean
```

## i18n

| Key | 用途 |
|-----|------|
| `usage.statsRange5m` | 近 5 分钟 |
| `usage.statsRangeTotal` | 总调用率（标签） |
| `usage.totalSuccessRate` | 总成功率 |
| `usage.statsRange7d` | 用量页等其它 7d 文案（保留） |
| `usage.successRate` | 成功率（近 5 分钟） |
| `usage.avgLatency` / `avgFirstToken` | 用时 / 首字 |
| `usage.recentCalls` | 最近调用标题 |
| `usage.recentCallsHint` | 窗口说明 |
| `usage.noRecentCalls` | 空态 |
| `usage.time` / `status` / `model` / `latency` | 列/提示 |

## 布局约束

- `ProviderProxyUsageSummary`：固定 2 行（可用性 / 体量）
- 右侧占位 `min-h-[92px]` + `self-stretch`，尽量吃满 provider 行高
- 操作按钮不参与占位，hover 叠在最近调用上方

## 注意

- 5m 走现有 `get_provider_stats` 时间过滤，无需新后端命令
- 最近调用按 `providerName` 匹配（与请求日志页一致）
- 行内窗口层级必须低于操作按钮
- 禁止与 `UsageFooter` 上游配额混写


## 最近调用缓存要点

| 项 | 值 |
|----|----|
| queryKey 时间窗 | `preset: "1d"`（禁止 `custom`+`Date.now()`） |
| `useRequestLogs` 选项 | `staleTime: 30_000`, `gcTime: 10*60_000`, `refetchOnWindowFocus: false` |
| 列表 `useProviderStats` | 7d: stale 60s；5m: stale 15s + interval 30s |
| 扩展点 | `UsageQueryOptions` 支持 `staleTime` / `gcTime` / `refetchOnMount` / `refetchOnWindowFocus` |
