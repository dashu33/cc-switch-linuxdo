# 供应商卡片：本地用量 + 可用性指标

## 目标

在每个供应商卡片上展示本地 proxy/session 用量，并优先呈现可用性：

1. **近 5 分钟成功率**（即时可用性，高亮）
2. **总调用率 / 总成功率 / 平均用时 / 首字**（累计可用性；数据窗仍为列表级 7d 聚合）
3. **最后使用时间**
4. 请求数 / Tokens / 成本（次要）
5. **最近调用行内窗口**：时间 / 模型 / 状态（压缩在卡片右侧）

数据复用「用量统计」页的 `get_provider_stats` / `get_request_logs` 口径，**不是**上游配额脚本（`UsageFooter` / `usage_script`）。

## 显示规则

| 项 | 规则 |
|----|------|
| 累计统计 | `useProviderStats({ preset: "7d" }, { appType })` 列表级批量；UI 文案为 **总调用率/总成功率** |
| 5 分钟统计 | `useProviderStats({ preset: "5m" }, { appType })`，30s 刷新 |
| 匹配 | 优先 `providerId`，失败回退 `providerName` |
| 空数据 | 累计与 5m 都无请求 → **不渲染**该行 |
| 最近调用 | 卡片右侧 **占位 panel**（`ProviderRecentCallsPanel`），`self-stretch` 吃满行高，内部滚动 |
| 层级 | panel 底层占位；配额常显叠顶（`z-10`）；操作按钮叠上（`z-20`）默认隐藏、hover 显示 |
| 日志范围 | 近 1 天（preset `1d`），最多 12 条；列：时间 / 模型 / 状态 |
| 刷新 | 当前供应商 15s；其他 60s；queryKey 稳定 + stale/gc 缓存 |

## 用量摘要布局

- **固定 2 行**，避免把卡片撑高：
  1. 可用性指标块（标签上 / 数值下）：`近5分钟成功率` · `总调用成功率` · 平均用时 · 首字 · 最后使用
  2. 体量：请求数 · Tokens · 成本
- 成功率数值用 **绿→红连续渐变**（高绿低红）
- 行内 `nowrap` + 溢出隐藏

## 可用性视觉

- 字号约 `12.5px`
- **近 5 分钟**标签绿色弱底，成功率语义色：
  - `≥99%` 绿 / `95–99%` 正常 / `80–95%` 琥珀 / `<80%` 红
- **总成功率**、平均用时、首字同规则高亮
- 请求 / Tokens / 成本弱化

## 最近调用窗口

- 组件：`ProviderRecentCallsPanel`（行内）
- 旧 Popover 组件 `ProviderRecentCallsPopover` 仍保留在仓库，但卡片主 UI 不再使用
- 复用 `useRequestLogs` + `providerName` + `appType`
- 状态码 2xx 绿 / 非 2xx 红；hover 可看 errorMessage / 延迟

## 平均用时 / 首字

| 字段 | 来源 |
|------|------|
| `avgLatencyMs` | 明细 + rollup 加权（7d 窗） |
| `avgFirstTokenMs` | 仅明细 `first_token_ms`；rollup → null |
| 近 5 分钟 | 当前只展示成功率（请求量通常较小） |


## 最近调用缓存

从「设置」返回供应商列表时，行内最近调用曾会整批重拉并卡住 UI。根因与修复：

| 点 | 说明 |
|----|------|
| 根因 | 每卡用 `custom` + `Date.now()` 做时间窗，**queryKey 每秒都变** → 缓存 miss → N 个 provider 并发 `get_request_logs` |
| 时间窗 | 改为稳定 preset **`1d`**（与「近 24h」同量级，key 稳定可复用） |
| staleTime | 最近调用 **30s** 内不强制重拉；后台仍按 15s/60s 轮询刷新 |
| gcTime | 卸载后 **10 分钟** 保留缓存，覆盖设置页往返 |
| 列表 stats | 7d `staleTime=60s`；5m `staleTime=15s`；均 `refetchOnWindowFocus=false` |
| 首屏 | 有缓存时立刻渲染旧数据，后台静默刷新；仅无缓存时显示「加载中」 |

## 热重载

| 改动范围 | 命令 |
|----------|------|
| 仅前端 UI / 查询范围 | Vite HMR / `pnpm dev` |
| `ProviderStats` Rust 字段 | `pnpm tauri dev` |

## 验证清单

- [ ] 有 5 分钟内请求时显示「近 5 分钟 成功率」
- [ ] 累计统计标签为「总调用率 / 总成功率」
- [ ] 卡片右侧显示最近调用压缩窗口
- [ ] hover 操作按钮叠在最近调用之上可点
- [ ] 无请求供应商不显示用量行（最近调用仍可空态）
- [ ] 与 `UsageFooter` 配额互不干扰
- [ ] 从设置返回供应商列表时最近调用立刻用缓存展示，不整页卡死

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
