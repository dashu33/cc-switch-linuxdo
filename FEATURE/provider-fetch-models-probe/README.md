# 一键拉取模型（批量供应商有效性探测）

> 文档状态：最后同步 2026-07-15 · 批量并发 + 卡片边框 + Codex「获取」按钮同步着色

## 目标

顶部工具栏 **AppSwitcher 左侧** 的「一键拉取模型」按钮，对 **当前 app 下全部可探测供应商** 并发调用 `fetchModelsForConfig`（兼容 `/v1/models`）：

| 结果 | 顶部按钮 | 卡片边框 | Codex 卡「获取」按钮 | 含义 |
|------|----------|----------|----------------------|------|
| probing | 琥珀 + spinner + `N✓ M✗` 进度 | 琥珀 + pulse | 琥珀 / 获取中… | 探测中 |
| success | 绿 + 汇总短文案 | **粗绿边** | 绿 / 可用 | 拿到 ≥1 模型 |
| empty | 橙 | **粗橙边** | 橙 / 无模型 | 可连通但 0 模型 |
| failed | 红 | **粗红边** | 红 / 失败 | 请求失败 |
| skipped | 灰弱（全跳过时） | 不变 | 不变 | 官方 / OAuth / 缺配置 |

## 位置

```text
[一键拉模型 3✓ 1○ 2✗] [定位当前] [AppSwitcher] …
```

- 空闲：仅 Search 图标（`size=icon`）
- 探测中 / 有结果：按钮展开为 `sm`，显示 `可用✓ 无模型○ 失败✗` 短文案
- 约 **60s** 后复位 idle

> 快速定位准星按钮见独立文档：[../provider-scroll-to-current/](../provider-scroll-to-current/)

## 行为

1. 遍历当前 app 全部 `providers`
2. `resolveProviderModelsProbeTarget`：不可探测 → `skipped`
3. 可探测项 **并发 4** 路 `fetchModelsForConfig`
4. 边完成边写 `probeById[providerId]`，卡片实时变色
5. 结束 toast 汇总：可用 / 无模型 / 失败 / 跳过
6. 60s 自动清空 `probeResult` + `probeById`
7. 切换 `appId` 立即清空，防串色

## 状态传递

```text
useFetchCurrentProviderModels
  ├─ probeResult     → 顶部按钮汇总色/文案
  └─ probeById       → ProviderList
        → ProviderCard.modelsProbeStatus（边框）
        → CodexProviderQuickAdjust.modelsProbeStatus（「获取」色）
```

### 优先级

- **卡片手动「获取」** 本地 `fetchStatus` 在请求中优先
- 批量结果通过 `useEffect` 同步进 `fetchStatus`（idle/skipped 不覆盖）

## 跳过规则

| 类型 | status |
|------|--------|
| 无供应商列表 | toast，不进入 probing |
| `category === "official"` | skipped |
| `github_copilot` / `codex_oauth` | skipped |
| 缺 baseUrl 与 apiKey | skipped |
| 仅缺其一 | skipped（reason 区分） |

## 凭证解析

`src/utils/providerModelsProbe.ts` 复用 `extractPortableCredentials`：

- baseUrl / apiKey
- 透传 `meta.isFullUrl`、`meta.customUserAgent`

## i18n（`provider.*`）

| Key | 用途 |
|-----|------|
| `fetchModelsProbe` | 按钮 aria / 默认 title |
| `fetchModelsProbeRunning` / `RunningShort` | 进行中 |
| `fetchModelsProbeDoneShort` | 完成后短文案 |
| `fetchModelsProbeButtonSuccess/Empty/Failed` | title 详情 |
| `fetchModelsBatchDone` / `BatchDoneHint` | 结束 toast |
| `fetchModelsAllSkipped` | 全跳过 |
| `fetchModelsNoProviders` | 空列表 |
| 另有历史 `fetchModelsNoCurrent` 等（单测路径遗留文案可保留） |

## 热重载

纯前端：Vite HMR / `pnpm dev`。

## 回归清单

- [ ] 点顶部按钮 → 多卡同时变琥珀 → 逐个变绿/橙/红
- [ ] 顶部按钮出现 `3✓ 1○ 2✗` 类短文案
- [ ] Codex 卡「获取」按钮同步变色
- [ ] 官方 / OAuth 卡不变色（skipped）
- [ ] 结束 toast 数字与卡片一致
- [ ] ~60s 后边框与按钮复位
- [ ] 切 app 后旧颜色不残留
- [ ] 与单卡手动「获取」共用 `fetchModelsForConfig`

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- Codex 快速调整：[../codex-provider-quick-adjust/](../codex-provider-quick-adjust/)
- 快速定位：[../provider-scroll-to-current/](../provider-scroll-to-current/)
