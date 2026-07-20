# CODEMAP — 供应商卡片本地用量与可用性

> 维护目录：\`自用特性/供应商卡片本地用量与可用性/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src-tauri/src/services/usage_stats.rs` | `ProviderStats` 聚合；`get_recent_calls_by_provider` 批量 lite |
| `src-tauri/src/commands/usage.rs` | `get_recent_calls_by_provider` 命令 |
| `src-tauri/src/lib.rs` | 注册 invoke |
| `src/types/usage.ts` | `UsageRangePreset` 含 `"5m"`；`ProviderStats`；`RecentCallLite` / `ProviderRecentCalls` |
| `src/lib/usageRange.ts` | `resolveUsageRange("5m")` → now-300s |
| `src/lib/api/usage.ts` | `getRecentCallsByProvider` |
| `src/lib/query/usage.ts` | `useProviderStats` / `useRequestLogs` / **`useRecentCallsByProvider`** |
| `src/components/providers/ProviderList.tsx` | 批量拉 7d + 5m stats + **recent calls**，按 name 分发 |
| `src/components/providers/ProviderCard.tsx` | 透传 stats / recentStats / recentCalls |
| `src/components/providers/ProviderProxyUsageSummary.tsx` | 卡片摘要（总调用率文案） |
| `src/components/providers/ProviderRecentCallsPanel.tsx` | 最近调用行内窗口（纯展示 props） |
| `src/components/providers/ProviderRecentCallsPopover.tsx` | 旧 Popover（保留；仍 per-open `useRequestLogs`） |
| `src/i18n/locales/*` | `statsRangeTotal` / `totalSuccessRate` / `recentCalls*` |
| `自用特性/供应商卡片本地用量与可用性/*` | 文档 |

## 数据流

```text
ProviderList
  useProviderStats(7d)              ──┐
  useProviderStats(5m)              ──┼→ resolve by providerId/name
  useRecentCallsByProvider(1d,12)   ──┼→ Map<providerName, RecentCallLite[]>
                                      ↓
  ProviderCard
    ProviderProxyUsageSummary
      [近5分钟成功率] [总调用率/总成功率…]
    右侧
      ProviderRecentCallsPanel(calls, isLoading, isFetching)
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
calls?: RecentCallLite[]
isLoading?: boolean
isFetching?: boolean
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

- 5m 走现有 `get_provider_stats` 时间过滤
- 最近调用按 `providerName`（展示名 coalesce）匹配，与请求日志页 / stats 一致
- 行内窗口层级必须低于操作按钮
- 禁止与 `UsageFooter` 上游配额混写
- 卡片路径禁止回退到 per-card `useRequestLogs`（会重新引入 N 路并发）

## 最近调用缓存要点

| 项 | 值 |
|----|----|
| 列表 queryKey | `["usage","recent-calls-by-provider","1d", appType, 12]` |
| 时间窗 | `preset: "1d"`（禁止 `custom`+`Date.now()` 进 key） |
| `useRecentCallsByProvider` | `staleTime: 30_000`, `gcTime: 10*60_000`, `refetchOnWindowFocus: false`, interval 60s |
| 后端 | `get_recent_calls_by_provider`：窗口函数 + lite 字段，无 COUNT/回填 |
| 列表 `useProviderStats` | 7d: stale 60s；5m: stale 15s + interval 30s |
| 旧 Popover | 仍 `useRequestLogs` + `enabled: open`（非卡片主路径） |

## 验证命令

```bash
# 后端单元（含批量最近调用）
cargo test -p cc-switch --lib services::usage_stats::tests::test_get_recent_calls_by_provider_groups_and_limits -- --nocapture

# 前端布局契约
pnpm exec vitest run tests/components/ProviderCardLayout.test.ts
```

## 易冲突点

- `usage_stats.rs` 与上游合并时注意 `effective_usage_log_filter` / `provider_name_coalesce` / `folded_app_type_sql`
- `ProviderList` 分发逻辑与 stats 的 byName 口径必须一致
- `lib.rs` generate_handler 注册表易漏命令
